"""In-memory stand-in for engine.Engine. Returns small dicts shaped like the real ones and honours owner_id."""

from __future__ import annotations

import uuid

from app.engine_bridge import ModelUnavailable, NotFound


class FakeEngine:
    def __init__(self):
        self.batch_error = None
        self.batch_delay = 0
        self.docs: dict[tuple[str, str], dict] = {}
        self.uploads: list[tuple[str, str, bytes]] = []
        self.calls: list[tuple] = []
        self.ollama_up = True
        self.raise_on_eval: Exception | None = None

    def status(self) -> dict:
        if not self.ollama_up:
            raise ModelUnavailable("Ollama is not reachable at http://localhost:11434")
        return {
            "engine_ready": True,
            "ollama_reachable": True,
            "models": {"generator": {"name": "llama3.2:3b", "ready": True}},
            "evaluation_mode": "local",
            "judge_model": "qwen3:8b",
            "generator_model": "llama3.2:3b",
        }

    def ingest(self, owner_id, filename, data, pack_id=None):
        self.uploads.append((owner_id, filename, data))
        doc_id = "doc_" + uuid.uuid4().hex[:8]
        doc = {
            "document_id": doc_id,
            "filename": filename,
            "chunk_count": 1,
            "pack_id": pack_id,
            "uploaded_at": "2026-10-24T12:00:00Z",
            "chunks": [{"chunk_id": f"{doc_id}_c0", "text": data.decode(errors="replace"), "page": None}],
        }
        self.docs[(owner_id, doc_id)] = doc
        return dict(doc)

    def list_documents(self, owner_id):
        return [{k: v for k, v in d.items() if k != "chunks"} for (o, _), d in self.docs.items() if o == owner_id]

    def get_document(self, owner_id, document_id):
        doc = self.docs.get((owner_id, document_id))
        if doc is None:
            raise NotFound(f"document {document_id} not found")
        return dict(doc)

    def delete_document(self, owner_id, document_id):
        if self.docs.pop((owner_id, document_id), None) is None:
            raise NotFound(f"document {document_id} not found")

    def _check(self, owner_id, document_ids):
        missing = [d for d in document_ids if (owner_id, d) not in self.docs]
        if not document_ids or missing:
            raise NotFound(f"documents not found: {', '.join(missing)}")

    def ask(self, owner_id, query, document_ids, k=None):
        self._check(owner_id, document_ids)
        return {"answer": "20 days.", "retrieved_chunks": [], "citations": [], "latency_ms": 12, "model": "llama3.2:3b"}

    def _evaluation(self, query, ground_truth):
        return {
            "evaluation_id": "eval_" + uuid.uuid4().hex[:8],
            "query": query,
            "generated_answer": "20 days.",
            "ground_truth": ground_truth,
            "retrieved_chunks": [],
            "metrics": {
                "context_relevance": {"score": 0.9, "status": "PASS", "judged_by": "model", "details": ""},
                "faithfulness": {"score": 1.0, "status": "PASS", "judged_by": "model", "details": ""},
                "answer_accuracy": {"score": None, "status": "REVIEW", "judged_by": "rule", "details": ""},
            },
            "root_cause": {"category": "CLEAN_PASS", "summary": "", "recommended_action": "", "evidence": []},
            "replay": None,
            "evaluation_mode": "local",
            "judge_model": "qwen3:8b",
        }

    def evaluate_query(self, owner_id, query, document_ids, ground_truth=None, manual_answer=None, gold_chunk_ids=None,
                       case_type="factoid", stale_chunk_ids=None, test_id=None, distractor_document_ids=None):
        self.last_query = {"ground_truth": ground_truth, "gold_chunk_ids": gold_chunk_ids, "case_type": case_type,
                           "stale_chunk_ids": stale_chunk_ids, "test_id": test_id, "document_ids": list(document_ids)}
        self.calls.append(("evaluate_query", owner_id, query, tuple(document_ids), case_type))
        if self.raise_on_eval:
            raise self.raise_on_eval
        self._check(owner_id, document_ids)
        return self._evaluation(query, ground_truth)

    def evaluate_batch(self, owner_id, document_ids, test_cases, pack_id=None, progress=None, batch_id=None, concurrency=None):
        if self.batch_error is not None:
            raise self.batch_error
        if self.batch_delay:
            import time

            time.sleep(self.batch_delay)
        self.calls.append(("evaluate_batch", owner_id, tuple(document_ids), len(test_cases), pack_id))
        self.last_batch_cases = test_cases
        self._check(owner_id, document_ids)
        results = []
        for i, case in enumerate(test_cases, start=1):
            item = self._evaluation(case.get("question") or "", case.get("ground_truth_answer"))
            item.update(test_id=case.get("test_id") or f"tc_{i:02d}", category="CLEAN_PASS",
                        context_relevance=0.9, faithfulness=1.0, answer_accuracy=None)
            results.append(item)
            if progress:
                progress(i, len(test_cases), 0)
        return {
            "batch_id": batch_id or "batch_" + uuid.uuid4().hex[:8],
            "pack_id": pack_id,
            "document_ids": document_ids,
            "created_at": "2026-10-24T12:00:00Z",
            "total_evaluated": len(results),
            "overall_score": 0.95,
            "aggregates": {"avg_context_relevance": 0.9, "avg_faithfulness": 1.0, "avg_answer_accuracy": None, "pass_rate": 1.0},
            "root_cause_breakdown": {"CLEAN_PASS": len(results)},
            "judge_agreement": None,
            "duration_ms": 5,
            "results": results,
        }

    def synthetic(self, owner_id, document_id, count=5, include_traps=True):
        self.calls.append(("synthetic", owner_id, document_id, count, include_traps))
        self.get_document(owner_id, document_id)
        cases = [{"test_id": f"tc_{i:02d}", "question": f"q{i}", "ground_truth_answer": "a", "type": "factoid"} for i in range(1, count + 1)]
        return {"document_id": document_id, "requested_count": count, "generated_count": count, "test_cases": cases}

    def list_packs(self):
        return [{"pack_id": "banking", "name": "Banking", "description": "", "document_count": 1, "test_case_count": 1}]

    def load_pack(self, owner_id, pack_id):
        if pack_id != "banking":
            raise NotFound(f"pack {pack_id} not found")
        doc = self.ingest(owner_id, "fees_v2.md", b"Monthly fee is 5 USD.", pack_id)
        cases = [{"test_id": "bk_01", "question": "What is the monthly fee?", "ground_truth_answer": "5 USD", "type": "factoid"}]
        return {"pack_id": pack_id, "document_ids": [doc["document_id"]], "test_cases": cases}

    def injection_run(self, owner_id, pack_ids=None, n_per_type=5, progress=None, batch_id=None):
        results = []
        for i, (true, pred) in enumerate([("WRONG_CHUNK", "WRONG_CHUNK"), ("HALLUCINATION", "IGNORED_CONTEXT")], start=1):
            item = self._evaluation(f"q{i}", "gt")
            item.update(test_id=f"inj_{i}", true_failure_type=true)
            item["root_cause"] = {"category": "X", "failure_type": pred, "stage": "retriever"}
            results.append(item)
            if progress:
                progress(i, 2, 0)
        return {"batch_id": batch_id, "pack_id": None, "kind": "injection", "total_evaluated": 2, "aggregates": {"pass_rate": 0.0},
                "results": results, "n_per_type": n_per_type, "injected_packs": pack_ids or ["banking"],
                "confusion": {"labels": ["WRONG_CHUNK", "IGNORED_CONTEXT", "HALLUCINATION"], "matrix": [[1, 0, 0], [0, 0, 0], [0, 1, 0]],
                              "per_class": {}, "accuracy": 0.5, "n": 2}}

    def stability(self, owner_id, batch, judges=None, shuffles=3, max_cases=20, progress=None):
        if progress:
            progress(1, 1, 0)
        return {"batch_id": batch["batch_id"], "judges": judges or ["groq:a", "groq:b"], "n_cases": 1,
                "judge_swap": {"correlation": {"faithfulness": 1.0}, "verdict_agreement": 1.0, "verdict_kappa": 1.0, "n": 1},
                "shuffle": {"runs": shuffles, "max_delta": 0.0, "stable": True}, "stable": True}

    def profiles(self):
        return [{"id": "v1", "name": "v1", "params": {"top_k": 4}}, {"id": "v2", "name": "v2", "params": {"top_k": 2}}]

    def run_profile(self, owner_id, pack_id, profile_id, progress=None, batch_id=None):
        pack = self.load_pack(owner_id, pack_id)
        batch = self.evaluate_batch(owner_id, pack["document_ids"], pack["test_cases"], pack_id=pack_id, progress=progress, batch_id=batch_id)
        if profile_id == "v2":
            for result in batch["results"]:
                result["root_cause"] = {"category": "RETRIEVAL_FAILURE"}
        return {**batch, "profile": profile_id, "failed_cases": 0}

    def compare(self, base_results, candidate_results, base, candidate):
        base_pass = {r["test_id"]: r["root_cause"]["category"] == "CLEAN_PASS" for r in base_results}
        flips = [
            {"test_id": r["test_id"], "pack_id": r.get("pack_id"),
             "direction": "pass_to_fail" if base_pass[r["test_id"]] else "fail_to_pass"}
            for r in candidate_results
            if base_pass.get(r["test_id"]) != (r["root_cause"]["category"] == "CLEAN_PASS")
        ]
        return {"base": base, "candidate": candidate, "n": len(candidate_results), "flips": flips,
                "pass_to_fail": sum(f["direction"] == "pass_to_fail" for f in flips)}

    def load_pack_summary(self, pack_id):
        if pack_id != "banking":
            raise NotFound(f"pack {pack_id} not found")
        return {"pack_id": pack_id, "test_case_count": 1, "filenames": {}}

    def rejudge(self, owner_id, batch, progress=None):
        if progress:
            progress(1, 1, 0)
        return {**batch, "rejudged": {"judge": "groq:openai/gpt-oss-120b"}}

    def impact(self, owner_id, old_document_id, new_document_id, max_tests=10, progress=None):
        if progress:
            progress(1, 1, 0)
        return {"old_document": {"document_id": old_document_id}, "new_document": {"document_id": new_document_id},
                "summary": {"unchanged": 1, "changed": 1, "added": 0, "removed": 0, "tests": 1, "at_risk": 1},
                "changes": [{"kind": "changed", "old": "fee $35", "new": "fee $25", "numbers_changed": [{"old": "35", "new": "25"}]}],
                "tests": [{"test_id": "imp_01", "question": "fee?", "answer": "$35", "verdict": "RETRIEVAL_FAILURE",
                           "failure_type": "STALE_SOURCE", "at_risk": True}],
                "at_risk": 1, "judge_model": "fake"}
