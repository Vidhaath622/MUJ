"""The three metrics: context relevance, claim-level faithfulness, answer accuracy.

Each scorer returns a MetricResult whose `judged_by` says whether a model or a
deterministic rule produced the score, so the UI can label it honestly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .config import REVIEW_BAND, THRESHOLDS
from .ingest import Chunk
from .llm import Judge
from .rag import is_abstention, strip_citations, without_hedges


@dataclass
class MetricResult:
    name: str
    score: float | None
    details: str
    judged_by: str  # "model" | "rule"
    extra: dict = field(default_factory=dict)

    @property
    def status(self) -> str:
        if self.score is None:
            return "REVIEW"
        return metric_status(self.name, self.score)

    @property
    def passed(self) -> bool:
        return self.score is not None and self.score >= THRESHOLDS[self.name]

    def to_dict(self) -> dict:
        out = {
            "score": None if self.score is None else round(self.score, 3),
            "status": self.status,
            "details": self.details,
            "judged_by": self.judged_by,
        }
        out.update(self.extra)
        return out


def metric_status(name: str, score: float) -> str:
    threshold = THRESHOLDS[name]
    if score >= threshold:
        return "PASS"
    if score >= threshold - REVIEW_BAND:
        return "REVIEW"
    return "FAIL"


def _passages(chunks: list[Chunk]) -> str:
    return "\n\n".join(f"[{i}] {c.text}" for i, c in enumerate(chunks, start=1))


def _clamp(value, default: float = 0.0) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------- relevance

RELEVANCE_SYSTEM = (
    "You grade a search system. For each numbered passage, score how well it supports answering the question:\n"
    "1.0 = contains the specific information needed to answer\n"
    "0.5 = on the right topic but missing the key fact\n"
    "0.0 = unrelated\n"
    "Judge only the passage text, not your own knowledge."
)

RELEVANCE_SCHEMA = {
    "type": "object",
    "properties": {
        "passages": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"passage": {"type": "integer"}, "score": {"type": "number"}, "reason": {"type": "string"}},
                "required": ["passage", "score", "reason"],
            },
        }
    },
    "required": ["passages"],
}


def score_context_relevance(judge: Judge, query: str, chunks: list[Chunk]) -> tuple[MetricResult, list[dict]]:
    """Returns the overall metric plus one {chunk_id, relevance_score, is_relevant, reason} per chunk."""
    if not chunks:
        return MetricResult("context_relevance", 0.0, "Nothing was retrieved.", "rule"), []
    result = judge.ask(RELEVANCE_SYSTEM, f"Question: {query}\n\nPassages:\n\n{_passages(chunks)}", RELEVANCE_SCHEMA)
    return _parse_relevance(result.get("passages"), chunks)


def _parse_relevance(passages, chunks: list[Chunk]) -> tuple[MetricResult, list[dict]]:
    if not chunks:
        return MetricResult("context_relevance", 0.0, "Nothing was retrieved.", "rule"), []
    graded = {}
    for p in passages if isinstance(passages, list) else []:
        if isinstance(p, dict):
            try:
                graded[int(p.get("passage", 0))] = p
            except (TypeError, ValueError):
                continue
    per_chunk = []
    for i, chunk in enumerate(chunks, start=1):
        entry = graded.get(i, {})
        score = _clamp(entry.get("score"))
        per_chunk.append(
            {
                "chunk_id": chunk.chunk_id,
                "relevance_score": round(score, 3),
                "is_relevant": score >= THRESHOLDS["context_relevance"],
                "reason": str(entry.get("reason", "not graded by judge")),
            }
        )
    best = max(per_chunk, key=lambda c: c["relevance_score"])
    relevant = sum(c["is_relevant"] for c in per_chunk)
    details = (
        f"Best passage scored {best['relevance_score']:.2f} ({best['reason']}). "
        f"{relevant} of {len(per_chunk)} retrieved chunks are relevant."
    )
    return (
        MetricResult(
            "context_relevance",
            best["relevance_score"],
            details,
            "model",
            {"precision": round(relevant / len(per_chunk), 3), "relevant_chunks": relevant, "n_chunks": len(per_chunk)},
        ),
        per_chunk,
    )


# ------------------------------------------------------------- faithfulness

FAITHFULNESS_SYSTEM = (
    "You check an AI answer for hallucinations.\n"
    "Step 1: split the ANSWER into short, self-contained factual claims (ignore citation markers like [1] and polite filler).\n"
    "Step 2: for each claim, read EVERY numbered CONTEXT passage, then decide:\n"
    "  supported = at least one passage states it or it follows directly from one passage\n"
    "  contradicted = no passage supports it and a passage states something different\n"
    "  unsupported = no passage says it\n"
    "Passages can disagree with each other (for example an old and a new version of a policy). "
    "A claim that matches ANY one passage is supported, even if another passage says something else.\n"
    "Give the number of the passage that supports the claim (or that contradicts it), or 0 if none. "
    "Do not use outside knowledge."
)

FAITHFULNESS_SCHEMA = {
    "type": "object",
    "properties": {
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "claim": {"type": "string"},
                    "verdict": {"type": "string", "enum": ["supported", "unsupported", "contradicted"]},
                    "passage": {"type": "integer"},
                },
                "required": ["claim", "verdict", "passage"],
            },
        }
    },
    "required": ["claims"],
}


def faithfulness_rule(answer: str, chunks: list[Chunk]) -> MetricResult | None:
    """Faithfulness when no model is needed (abstention, or claims with no context); None otherwise."""
    if is_abstention(answer):
        return MetricResult(
            "faithfulness", 1.0, "The answer abstains, so it makes no claims to check.", "rule",
            {"claims": [], "hallucinated_claims": []},
        )
    if not chunks:
        return MetricResult(
            "faithfulness", 0.0, "The answer makes claims but no context was retrieved.", "rule",
            {"claims": [], "hallucinated_claims": [strip_citations(answer)]},
        )
    return None


def score_faithfulness(judge: Judge, answer: str, chunks: list[Chunk]) -> MetricResult:
    rule = faithfulness_rule(answer, chunks)
    if rule is not None:
        return rule
    result = judge.ask(
        FAITHFULNESS_SYSTEM, f"CONTEXT:\n\n{_passages(chunks)}\n\nANSWER: {without_hedges(answer)}", FAITHFULNESS_SCHEMA
    )
    return _parse_faithfulness(result.get("claims"), chunks)


def _parse_faithfulness(items, chunks: list[Chunk]) -> MetricResult:
    claims = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict) or not str(item.get("claim", "")).strip():
            continue
        verdict = str(item.get("verdict", "unsupported")).lower()
        if verdict not in ("supported", "unsupported", "contradicted"):
            verdict = "unsupported"
        passage = item.get("passage") or 0
        try:
            passage = int(passage)
        except (TypeError, ValueError):
            passage = 0
        chunk_id = chunks[passage - 1].chunk_id if 1 <= passage <= len(chunks) else None
        claims.append({"claim": str(item["claim"]).strip(), "verdict": verdict, "chunk_id": chunk_id})
    if not claims:
        return MetricResult(
            "faithfulness", None, "The judge found no checkable claims in the answer.", "model",
            {"claims": [], "hallucinated_claims": []},
        )
    supported = sum(c["verdict"] == "supported" for c in claims)
    bad = [c["claim"] for c in claims if c["verdict"] != "supported"]
    score = supported / len(claims)
    if bad:
        contradicted = [c["claim"] for c in claims if c["verdict"] == "contradicted"]
        details = f"{supported} of {len(claims)} claims are supported by the retrieved context."
        if contradicted:
            details += f" Contradicted by context: {contradicted[0]!r}."
        else:
            details += f" Not in context: {bad[0]!r}."
    else:
        details = f"All {len(claims)} claims are supported by the retrieved context."
    return MetricResult("faithfulness", score, details, "model", {"claims": claims, "hallucinated_claims": bad})


# ----------------------------------------------------------------- accuracy

ACCURACY_SYSTEM = (
    "You compare an AI answer with a ground-truth answer.\n"
    "score 1.0 = same meaning; all key facts (numbers, dates, names, conditions) match. Extra correct detail is fine.\n"
    "score 0.5 = partly right: some key facts match, some are missing or wrong.\n"
    "score 0.0 = wrong, contradicts the ground truth, or does not answer.\n"
    "Only compare against the ground truth; do not use outside knowledge."
)

ACCURACY_SCHEMA = {
    "type": "object",
    "properties": {"score": {"type": "number"}, "reason": {"type": "string"}},
    "required": ["score", "reason"],
}


def _numbers(text: str) -> set[str]:
    return {n.replace(",", "").rstrip(".") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text)}


def accuracy_rule(answer: str, ground_truth: str | None, unanswerable: bool = False) -> MetricResult | None:
    """Accuracy when no model is needed; None otherwise.

    The numeric shortcut only ever passes an answer: when the ground truth hinges on numbers and the
    answer states exactly those numbers and no others. Anything less clear goes to the judge.
    """
    abstained = is_abstention(answer)
    if unanswerable:
        if abstained:
            return MetricResult("answer_accuracy", 1.0, "Correctly abstained: the documents do not answer this question.", "rule")
        return MetricResult(
            "answer_accuracy", 0.0, "The documents do not answer this question, but the model gave an answer instead of abstaining.", "rule"
        )
    if not ground_truth:
        return MetricResult("answer_accuracy", None, "No ground truth was given, so accuracy was not measured.", "rule")
    if abstained:
        return MetricResult("answer_accuracy", 0.0, "The model abstained, but the ground truth has an answer.", "rule")
    want, got = _numbers(ground_truth), _numbers(without_hedges(answer))
    if want and got == want and len(without_hedges(answer)) <= 400:
        return MetricResult(
            "answer_accuracy", 1.0, f"Numeric match: the answer states exactly the ground-truth values ({', '.join(sorted(want))}).", "rule"
        )
    return None


def score_answer_accuracy(judge: Judge, query: str, answer: str, ground_truth: str | None, unanswerable: bool = False) -> MetricResult:
    rule = accuracy_rule(answer, ground_truth, unanswerable)
    if rule is not None:
        return rule
    result = judge.ask(
        ACCURACY_SYSTEM,
        f"Question: {query}\nGround truth: {ground_truth}\nAI answer: {strip_citations(answer)}",
        ACCURACY_SCHEMA,
    )
    return _parse_accuracy(result)


def _parse_accuracy(result) -> MetricResult:
    if not isinstance(result, dict) or result.get("score") is None:
        return MetricResult("answer_accuracy", None, "The judge returned no accuracy score.", "model")
    score = _clamp(result.get("score"))
    return MetricResult("answer_accuracy", score, str(result.get("reason", "")).strip() or "No reason given.", "model")


# ------------------------------------------------------------ merged judge call

CASE_SYSTEM = (
    "You evaluate one answer from a retrieval-augmented QA system. Do every TASK listed below and return ONE JSON "
    "object with one key per task. Use only the given text, never outside knowledge.\n"
)
CASE_TASKS = {
    "passages": (
        "TASK passages: for each numbered PASSAGE, score how well it supports answering the QUESTION: "
        "1.0 = contains the specific information needed, 0.5 = right topic but missing the key fact, 0.0 = unrelated. "
        "Return a list of {passage, score, reason}."
    ),
    "claims": (
        "TASK claims: split the ANSWER into short, self-contained factual claims (ignore citation markers and filler). "
        "For each claim read EVERY passage, then decide: supported = at least one passage states it or it follows directly "
        "from one passage; contradicted = no passage supports it and a passage states something different; unsupported = "
        "no passage says it. Passages can disagree (for example an old and a new policy version); a claim that matches ANY "
        "one passage is supported. Give the passage number used as evidence, or 0. Return a list of {claim, verdict, passage}."
    ),
    "accuracy": (
        "TASK accuracy: compare the ANSWER with the GROUND TRUTH. score 1.0 = same meaning, all key facts (numbers, dates, "
        "names, conditions) match, extra correct detail is fine; 0.5 = partly right; 0.0 = wrong, contradicts the ground "
        "truth, or does not answer. Return {score, reason}."
    ),
}
CASE_SCHEMA_PARTS = {
    "passages": RELEVANCE_SCHEMA["properties"]["passages"],
    "claims": FAITHFULNESS_SCHEMA["properties"]["claims"],
    "accuracy": ACCURACY_SCHEMA,
}


@dataclass
class CaseScores:
    relevance: MetricResult | None
    per_chunk: list[dict]
    faithfulness: MetricResult
    accuracy: MetricResult
    judge_calls: int
    rule_shortcuts: int


def score_case(
    judge: Judge,
    query: str,
    answer: str,
    chunks: list[Chunk],
    ground_truth: str | None,
    unanswerable: bool = False,
    with_relevance: bool = True,
) -> CaseScores:
    """All three metrics with at most ONE judge call: rules decide what they can, the model does the rest."""
    faith = faithfulness_rule(answer, chunks)
    acc = accuracy_rule(answer, ground_truth, unanswerable)
    tasks = [t for t, needed in (("passages", with_relevance and bool(chunks)), ("claims", faith is None), ("accuracy", acc is None)) if needed]
    shortcuts = (faith is not None) + (acc is not None)
    relevance, per_chunk = (_parse_relevance([], chunks) if with_relevance and not chunks else (None, []))
    if tasks:
        parts = [f"QUESTION: {query}"]
        if "passages" in tasks or "claims" in tasks:
            parts.append("PASSAGES:\n\n" + _passages(chunks))
        parts.append(f"ANSWER: {without_hedges(answer) or strip_citations(answer)}")
        if "accuracy" in tasks:
            parts.append(f"GROUND TRUTH: {ground_truth}")
        schema = {"type": "object", "properties": {t: CASE_SCHEMA_PARTS[t] for t in tasks}, "required": tasks}
        system = CASE_SYSTEM + "\n".join(CASE_TASKS[t] for t in tasks)
        result = judge.ask(system, "\n\n".join(parts), schema)
        if "passages" in tasks:
            relevance, per_chunk = _parse_relevance(result.get("passages"), chunks)
        if "claims" in tasks:
            faith = _parse_faithfulness(result.get("claims"), chunks)
        if "accuracy" in tasks:
            acc = _parse_accuracy(result.get("accuracy"))
    return CaseScores(relevance, per_chunk, faith, acc, int(bool(tasks)), shortcuts)
