"""Fault injection with known answers, and the confusion matrix it produces.

Each injected case breaks the pipeline in exactly one known way, so the diagnosis
the engine gives it can be checked against the truth:

  retrieval faults (the real generator answers from the manipulated context)
    WRONG_CHUNK           gold chunk(s) removed from the retrieved context
    STALE_SOURCE          the outdated version of the fact retrieved instead of the current one
    DISTRACTOR_CONFUSION  only look-alike chunks from the pack's distractor document retrieved
  generation faults (gold retrieved; a planted answer stands in for the generator)
    IGNORED_CONTEXT       the gold sentence with its number changed (contradicts the context)
    HALLUCINATION         the gold sentence plus a fabricated claim no passage supports
    REASONING_ERROR       a true sentence from the gold chunk that does not answer the question
    FALSE_ABSTENTION      "I don't know" although the gold chunk is in context
    UNANSWERABLE_ANSWERED a confident answer to a question the documents do not answer
  control
    CLEAN_PASS            the gold sentence itself, with the gold chunk retrieved

Planted answers test the judge and the verdict logic directly; retrieval faults test
the whole pipeline including the replay.
"""

from __future__ import annotations

import random
import re

from .ingest import Chunk
from .rag import ABSTAIN_ANSWER
from .verdict import FAILURE_TYPES

INJECTED_TYPES = [t for t in FAILURE_TYPES if t != "UNRESOLVED"]

FABRICATED_CLAIMS = [
    "It also comes with a guaranteed 15 percent loyalty discount for every customer.",
    "This rule was introduced after a national audit in 2019.",
    "Exceptions can be approved by any team lead without written records.",
]


def _sentences(text: str) -> list[str]:
    lines = [l.strip().lstrip("#").strip() for l in text.splitlines()]
    out = []
    for line in lines:
        out.extend(s.strip() for s in re.split(r"(?<=[.!?])\s+", line) if len(s.strip()) > 25)
    return out


def _bump_number(sentence: str) -> str | None:
    """Change the first number in a sentence so it contradicts the source."""
    match = re.search(r"\d+(?:\.\d+)?", sentence)
    if not match:
        return None
    value = match.group(0)
    changed = str(round(float(value) * 2 + 1, 2)).rstrip("0").rstrip(".") if "." in value else str(int(value) * 2 + 1)
    return sentence[: match.start()] + changed + sentence[match.end():]


def build_cases(engine, owner_id: str, pack: dict, n_per_type: int, seed: int = 7) -> list[dict]:
    """Injected test cases for one loaded pack (the dict returned by Engine.load_pack)."""
    rng = random.Random(seed)
    store, rag = engine.store, engine.rag
    k = engine.settings.top_k
    doc_ids = pack["document_ids"]
    distractor_docs = set(pack.get("distractor_document_ids") or [])
    cases = pack["test_cases"]
    answerable = [c for c in cases if c["type"] != "unanswerable" and c["gold_chunk_ids"]]
    stale = [c for c in answerable if c.get("stale_chunk_ids")]
    unanswerable = [c for c in cases if c["type"] == "unanswerable"]
    rng.shuffle(answerable)
    rng.shuffle(unanswerable)
    chunks_by_id = {c.chunk_id: c for c in store.chunks_for(owner_id, doc_ids)}

    def gold_sentence(case: dict) -> tuple[Chunk, str] | None:
        chunk = chunks_by_id.get(case["gold_chunk_ids"][0])
        snippet = (case.get("context_snippet") or "").strip()
        if chunk is None:
            return None
        if snippet and snippet.lower() in chunk.text.lower():
            return chunk, snippet
        sentences = _sentences(chunk.text)
        return (chunk, sentences[0]) if sentences else None

    def context_without(case: dict, exclude: set[str], prefer_docs: set[str] | None = None) -> list[str]:
        pool_docs = list(prefer_docs) if prefer_docs else doc_ids
        hits = rag.retrieve(owner_id, case["question"], pool_docs, k=k + 8)
        return [h.chunk.chunk_id for h in hits if h.chunk.chunk_id not in exclude][:k]

    def with_gold_first(case: dict) -> list[str]:
        hits = [h.chunk.chunk_id for h in rag.retrieve(owner_id, case["question"], doc_ids, k=k)]
        gold = case["gold_chunk_ids"][0]
        return [gold, *[h for h in hits if h != gold]][:k]

    out: list[dict] = []

    def add(base: dict, true_type: str, **changes) -> None:
        case = {
            "test_id": f"inj_{true_type.lower()}_{base['test_id']}",
            "question": base["question"],
            "ground_truth_answer": base.get("ground_truth_answer", ""),
            "type": base["type"],
            "gold_chunk_ids": base.get("gold_chunk_ids", []),
            "stale_chunk_ids": base.get("stale_chunk_ids", []),
            "distractor_document_ids": list(distractor_docs),
            "true_failure_type": true_type,
            "source_test_id": base["test_id"],
        }
        case.update(changes)
        out.append(case)

    def take(pool: list[dict], n: int, offset: int) -> list[dict]:
        return [pool[(offset + i) % len(pool)] for i in range(min(n, len(pool)))] if pool else []

    for i, case in enumerate(take(answerable, n_per_type, 0)):
        excluded = set(case["gold_chunk_ids"]) | set(case.get("stale_chunk_ids") or [])
        non_distractor = set(doc_ids) - distractor_docs
        add(case, "WRONG_CHUNK", forced_chunk_ids=context_without(case, excluded, non_distractor))
    for case in take(stale, n_per_type, 0):
        others = context_without(case, set(case["gold_chunk_ids"]) | set(case["stale_chunk_ids"]), set(doc_ids) - distractor_docs)
        add(case, "STALE_SOURCE", forced_chunk_ids=[case["stale_chunk_ids"][0], *others][:k])
    if distractor_docs:
        for case in take(answerable, n_per_type, n_per_type):
            add(case, "DISTRACTOR_CONFUSION", forced_chunk_ids=context_without(case, set(case["gold_chunk_ids"]), distractor_docs))

    def planted(true_type: str, offset: int, make) -> None:
        made = 0
        for case in answerable[offset:] + answerable[:offset]:
            if made >= n_per_type:
                break
            found = gold_sentence(case)
            if not found:
                continue
            answer = make(case, *found)
            if answer:
                add(case, true_type, forced_chunk_ids=with_gold_first(case), manual_answer=answer)
                made += 1

    planted("IGNORED_CONTEXT", 2 * n_per_type, lambda case, chunk, sentence: _bump_number(sentence))
    planted(
        "HALLUCINATION",
        3 * n_per_type,
        lambda case, chunk, sentence: f"{sentence} {FABRICATED_CLAIMS[len(out) % len(FABRICATED_CLAIMS)]}",
    )

    def other_sentence(case, chunk, sentence):
        options = [s for s in _sentences(chunk.text) if s.lower() != sentence.lower() and s.lower() not in sentence.lower()]
        return options[0] if options else None

    planted("REASONING_ERROR", 4 * n_per_type, other_sentence)
    planted("FALSE_ABSTENTION", 5 * n_per_type, lambda case, chunk, sentence: ABSTAIN_ANSWER)
    planted("CLEAN_PASS", 6 * n_per_type, lambda case, chunk, sentence: sentence)

    for case in take(unanswerable, n_per_type, 0):
        hits = rag.retrieve(owner_id, case["question"], doc_ids, k=k)
        sentences = _sentences(hits[0].chunk.text) if hits else []
        if sentences:
            add(case, "UNANSWERABLE_ANSWERED", forced_chunk_ids=[h.chunk.chunk_id for h in hits], manual_answer=sentences[0])
    return out


def confusion(results: list[dict]) -> dict:
    """Rows are the injected (true) types, columns the engine's diagnosis."""
    pairs = [(r["true_failure_type"], r["root_cause"].get("failure_type", "UNRESOLVED")) for r in results if r.get("true_failure_type")]
    labels = [t for t in FAILURE_TYPES if any(t in pair for pair in pairs)]
    index = {t: i for i, t in enumerate(labels)}
    matrix = [[0] * len(labels) for _ in labels]
    for true, pred in pairs:
        matrix[index[true]][index[pred]] += 1
    per_class = {}
    for t, i in index.items():
        support = sum(matrix[i])
        predicted = sum(row[i] for row in matrix)
        hit = matrix[i][i]
        per_class[t] = {
            "precision": round(hit / predicted, 3) if predicted else None,
            "recall": round(hit / support, 3) if support else None,
            "support": support,
        }
    correct = sum(matrix[i][i] for i in range(len(labels)))
    # Also score at the coarser level the PS asks for: which stage failed.
    stage_of = {
        "CLEAN_PASS": "none", "WRONG_CHUNK": "retriever", "STALE_SOURCE": "retriever", "DISTRACTOR_CONFUSION": "retriever",
        "IGNORED_CONTEXT": "generator", "HALLUCINATION": "generator", "REASONING_ERROR": "generator",
        "UNANSWERABLE_ANSWERED": "generator", "FALSE_ABSTENTION": "generator", "UNRESOLVED": "unknown",
    }
    stage_hits = sum(stage_of[t] == stage_of[p] for t, p in pairs)
    return {
        "labels": labels,
        "matrix": matrix,
        "per_class": per_class,
        "accuracy": round(correct / len(pairs), 3) if pairs else None,
        "stage_accuracy": round(stage_hits / len(pairs), 3) if pairs else None,
        "n": len(pairs),
    }
