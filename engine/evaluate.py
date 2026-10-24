"""Evaluate one question end to end: retrieve, generate, score, replay, verdict.

Output dicts follow docs/api_contract.md sections 2.3 and 4.5.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

from .ingest import Chunk
from .llm import Judge, JudgeError, ModelUnavailable
from .rag import RagSystem, is_abstention
from .scoring import (
    MetricResult,
    score_answer_accuracy,
    score_context_relevance,
    score_faithfulness,
)
from .store import VectorStore
from .verdict import Facts, decide, needs_replay

SUPPORT_SYSTEM = (
    "Decide whether the passage states the ground-truth answer to the question. "
    "Answer supports=true only if a reader could give the ground-truth answer from this passage alone."
)
SUPPORT_SCHEMA = {
    "type": "object",
    "properties": {"supports": {"type": "boolean"}, "reason": {"type": "string"}},
    "required": ["supports", "reason"],
}


@dataclass
class TestCase:
    question: str
    ground_truth: str | None = None
    test_id: str | None = None
    gold_chunk_ids: list[str] = field(default_factory=list)
    stale_chunk_ids: list[str] = field(default_factory=list)
    type: str = "factoid"  # factoid | unanswerable | stale | distractor
    manual_answer: str | None = None

    @property
    def unanswerable(self) -> bool:
        return self.type == "unanswerable"


def _safe(fn, *args, **kwargs) -> MetricResult | None:
    try:
        return fn(*args, **kwargs)
    except JudgeError:
        return None


class Evaluator:
    def __init__(self, store: VectorStore, rag: RagSystem, judge: Judge):
        self.store = store
        self.rag = rag
        self.judge = judge

    # ---------------------------------------------------------------- gold

    def infer_gold(self, owner_id: str, case: TestCase, document_ids: list[str]) -> tuple[list[str], str | None]:
        """For a live query with a ground truth but no gold chunk, find the chunk that states the answer."""
        if not case.ground_truth or case.unanswerable:
            return [], None
        candidates = self.rag.retrieve(owner_id, f"{case.question} {case.ground_truth}", document_ids, k=3)
        for scored in candidates:
            try:
                result = self.judge.ask(
                    SUPPORT_SYSTEM,
                    f"Question: {case.question}\nGround truth: {case.ground_truth}\n\nPassage: {scored.chunk.text}",
                    SUPPORT_SCHEMA,
                )
            except JudgeError:
                continue
            if result.get("supports") is True:
                return [scored.chunk.chunk_id], str(result.get("reason", ""))
        return [], None

    # -------------------------------------------------------------- replay

    def replay(self, case: TestCase, gold_chunks: list[Chunk]) -> dict:
        answer, citations, latency = self.rag.generate(case.question, gold_chunks)
        faith = score_faithfulness(self.judge, answer, gold_chunks)
        acc = score_answer_accuracy(self.judge, case.question, answer, case.ground_truth, case.unanswerable)
        return {
            "answer": answer,
            "answer_accuracy": acc.score,
            "faithfulness": faith.score,
            "context_chunk_ids": [c.chunk_id for c in gold_chunks],
            "citations": citations,
            "latency_ms": latency,
            "accuracy_details": acc.details,
            "passed": acc.passed,
        }

    # ------------------------------------------------------------ evaluate

    def evaluate(self, owner_id: str, case: TestCase, document_ids: list[str]) -> dict:
        started = time.perf_counter()
        self.judge.start_tracking()
        if case.manual_answer:
            retrieved = self.rag.retrieve(owner_id, case.question, document_ids)
            answer, citations, gen_ms = case.manual_answer, [], 0
        else:
            rag = self.rag.ask(owner_id, case.question, document_ids)
            retrieved, answer, citations, gen_ms = rag.retrieved, rag.answer, rag.citations, rag.generation_ms
        chunks = [s.chunk for s in retrieved]
        retrieved_ids = [c.chunk_id for c in chunks]

        relevance, per_chunk = score_context_relevance(self.judge, case.question, chunks)
        faith = _safe(score_faithfulness, self.judge, answer, chunks)
        acc = _safe(score_answer_accuracy, self.judge, case.question, answer, case.ground_truth, case.unanswerable)
        if faith is None:
            faith = MetricResult("faithfulness", None, "The judge returned an unreadable result.", "model", {"claims": [], "hallucinated_claims": []})
        if acc is None:
            acc = MetricResult("answer_accuracy", None, "The judge returned an unreadable result.", "model")

        gold_ids = list(case.gold_chunk_ids)
        gold_source = "test_case" if gold_ids else None
        if not gold_ids and case.ground_truth and not case.unanswerable:
            gold_ids, _ = self.infer_gold(owner_id, case, document_ids)
            gold_source = "inferred" if gold_ids else None
        gold_chunks = self.store.get_chunks(owner_id, gold_ids)
        gold_ids = [c.chunk_id for c in gold_chunks]
        gold_retrieved = any(g in retrieved_ids for g in gold_ids)
        stale_retrieved = [c for c in case.stale_chunk_ids if c in retrieved_ids]
        abstained = is_abstention(answer)

        facts = Facts(
            has_ground_truth=bool(case.ground_truth) or case.unanswerable,
            unanswerable=case.unanswerable,
            abstained=abstained,
            gold_known=bool(gold_ids),
            gold_retrieved=gold_retrieved,
            relevant_context=relevance.passed,
            faithful=None if faith.score is None else faith.passed,
            correct=None if acc.score is None else acc.passed,
            stale_retrieved=bool(stale_retrieved),
        )

        replay = None
        if needs_replay(facts):
            try:
                replay = self.replay(case, gold_chunks)
                facts.replay_ran = True
                facts.replay_correct = replay["passed"]
                facts.replay_failed = replay["answer_accuracy"] is None
            except JudgeError:
                facts.replay_failed = True
        verdict = decide(facts)
        if replay is not None:
            replay["verdict_effect"] = verdict.verdict_effect or (
                "Replay with the gold chunk answered correctly." if replay["passed"] else "Replay with the gold chunk was still wrong."
            )
            replay.pop("passed")

        relevance_by_id = {c["chunk_id"]: c for c in per_chunk}
        retrieved_out = []
        for scored in retrieved:
            graded = relevance_by_id.get(scored.chunk.chunk_id, {})
            retrieved_out.append(
                {
                    "chunk_id": scored.chunk.chunk_id,
                    "document_id": scored.chunk.document_id,
                    "text": scored.chunk.text,
                    "page": scored.chunk.page,
                    "relevance_score": graded.get("relevance_score", 0.0),
                    "is_relevant": graded.get("is_relevant", False),
                    "relevance_reason": graded.get("reason"),
                    "similarity": round(scored.similarity, 4),
                    "cited": scored.chunk.chunk_id in citations,
                    "is_gold": scored.chunk.chunk_id in gold_ids,
                    "is_stale": scored.chunk.chunk_id in case.stale_chunk_ids,
                }
            )

        evidence = self._evidence(gold_chunks, retrieved_ids, retrieved_out, faith, stale_retrieved, owner_id, gold_source)

        return {
            "evaluation_id": "eval_" + uuid.uuid4().hex[:10],
            "test_id": case.test_id,
            "case_type": case.type,
            "query": case.question,
            "generated_answer": answer,
            "ground_truth": case.ground_truth if not case.unanswerable else None,
            "expected_abstain": case.unanswerable,
            "retrieved_chunks": retrieved_out,
            "citations": citations,
            "metrics": {
                "context_relevance": relevance.to_dict(),
                "faithfulness": faith.to_dict(),
                "answer_accuracy": acc.to_dict(),
            },
            "root_cause": {
                "category": verdict.category,
                "summary": verdict.summary,
                "recommended_action": verdict.recommended_action,
                "evidence": evidence,
            },
            "gold_chunk_ids": gold_ids,
            "stale_chunk_ids": list(case.stale_chunk_ids),
            "gold_source": gold_source,
            "retrieved_chunk_ids": retrieved_ids,
            "gold_retrieved": gold_retrieved,
            "replay": replay,
            **self.judge.used(),
            "generator_model": self.rag.generator_model,
            "generation_ms": gen_ms,
            "duration_ms": int((time.perf_counter() - started) * 1000),
        }

    def _evidence(self, gold_chunks, retrieved_ids, retrieved_out, faith, stale_retrieved, owner_id, gold_source) -> list[dict]:
        items: list[dict] = []
        for chunk in gold_chunks:
            role = "gold_retrieved" if chunk.chunk_id in retrieved_ids else "gold_missing"
            if gold_source == "inferred":
                role += "_inferred"
            items.append({"chunk_id": chunk.chunk_id, "text": chunk.text, "role": role})
        for chunk in self.store.get_chunks(owner_id, stale_retrieved):
            items.append({"chunk_id": chunk.chunk_id, "text": chunk.text, "role": "stale_retrieved"})
        if gold_chunks and not any(c.chunk_id in retrieved_ids for c in gold_chunks) and retrieved_out:
            top = retrieved_out[0]
            items.append({"chunk_id": top["chunk_id"], "text": top["text"], "role": "retrieved_instead"})
        for claim in faith.extra.get("claims", []):
            if claim["verdict"] != "supported":
                items.append({"chunk_id": claim.get("chunk_id") or "", "text": claim["claim"], "role": f"{claim['verdict']}_claim"})
        return items


def failed_result(case: TestCase, error: Exception, judge: Judge, generator_model: str) -> dict:
    """A batch row for a case that could not be evaluated: every score is null, never guessed."""
    reason = f"Not evaluated: {error}"
    blank = {"score": None, "status": "REVIEW", "details": reason, "judged_by": "rule"}
    return {
        "evaluation_id": "eval_" + uuid.uuid4().hex[:10],
        "test_id": case.test_id,
        "case_type": case.type,
        "query": case.question,
        "generated_answer": "",
        "ground_truth": case.ground_truth if not case.unanswerable else None,
        "expected_abstain": case.unanswerable,
        "retrieved_chunks": [],
        "citations": [],
        "metrics": {
            "context_relevance": dict(blank),
            "faithfulness": dict(blank, claims=[], hallucinated_claims=[]),
            "answer_accuracy": dict(blank),
        },
        "root_cause": {
            "category": "UNRESOLVED",
            "summary": f"This case could not be evaluated ({error}).",
            "recommended_action": "Re-run the batch; judge calls already made are cached.",
            "evidence": [],
        },
        "gold_chunk_ids": list(case.gold_chunk_ids),
        "stale_chunk_ids": list(case.stale_chunk_ids),
        "gold_source": "test_case" if case.gold_chunk_ids else None,
        "retrieved_chunk_ids": [],
        "gold_retrieved": False,
        "replay": None,
        "evaluation_mode": judge.mode,
        "judge_model": judge.model,
        "generator_model": generator_model,
        "generation_ms": 0,
        "duration_ms": 0,
        "error": str(error),
    }


def summarize_batch(results: list[dict]) -> dict:
    """Aggregates for /api/evaluate/batch. Averages skip unmeasured (null) scores and report n."""
    from .verdict import CATEGORIES

    def avg(metric: str) -> tuple[float | None, int]:
        values = [r["metrics"][metric]["score"] for r in results if r["metrics"][metric]["score"] is not None]
        return (round(sum(values) / len(values), 3) if values else None), len(values)

    rel, rel_n = avg("context_relevance")
    faith, faith_n = avg("faithfulness")
    acc, acc_n = avg("answer_accuracy")
    breakdown = {c: 0 for c in CATEGORIES}
    for r in results:
        breakdown[r["root_cause"]["category"]] += 1
    measured = [v for v in (rel, faith, acc) if v is not None]
    return {
        "total_evaluated": len(results),
        "failed_cases": sum(1 for r in results if r.get("error")),
        "overall_score": round(sum(measured) / len(measured), 3) if measured else None,
        "aggregates": {
            "avg_context_relevance": rel,
            "avg_faithfulness": faith,
            "avg_answer_accuracy": acc,
            "pass_rate": round(breakdown["CLEAN_PASS"] / len(results), 3) if results else None,
            "n_context_relevance": rel_n,
            "n_faithfulness": faith_n,
            "n_answer_accuracy": acc_n,
        },
        "root_cause_breakdown": breakdown,
        "replays_run": sum(r["replay"] is not None for r in results),
        "gold_retrieval_rate": (
            round(sum(r["gold_retrieved"] for r in results if r["gold_chunk_ids"] and not r.get("error")) / n, 3)
            if (n := sum(bool(r["gold_chunk_ids"]) and not r.get("error") for r in results))
            else None
        ),
    }


__all__ = ["Evaluator", "TestCase", "summarize_batch", "ModelUnavailable"]
