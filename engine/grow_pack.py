"""Grow a pack's test set with judge-generated questions, keeping every gold quote verifiable.

    python -m engine.grow_pack banking --target 70

Hand-written cases stay as they are. New cases are marked "origin": "synthetic" with the
model that wrote them. Rules that keep the data honest:
  - every gold quote is a verbatim sentence of its chunk (the model's evidence is snapped to
    the closest real sentence and dropped if nothing matches well), so packs.py resolves it;
  - no questions are generated from superseded documents; when a v2 fact is unchanged in v1,
    the v1 sentence is accepted as gold too, so retrieving either copy is not a miss;
  - unanswerable traps are kept only if the judge confirms no retrieved passage answers them;
  - a question is typed "distractor" when, by embedding similarity, a chunk from a distractor
    document ranks above the gold chunk for it (measured, not guessed).
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
from pathlib import Path

import numpy as np

from .ingest import Chunk, parse_document
from .llm import JudgeError
from .packs import discover, read_document_bytes
from .service import Engine
from .synth import ANSWERED_SCHEMA, ANSWERED_SYSTEM, UNANSWERABLE_SCHEMA, UNANSWERABLE_SYSTEM, sample_chunks

MULTI_QA_SYSTEM = (
    "You write test questions for a document Q&A system. Given one passage, write up to {n} DIFFERENT questions that a "
    "real user might ask and that this passage answers on its own. Each question must be self-contained: name the "
    "product, role, policy or process it is about (never say 'the passage' or 'the document'). Prefer specific facts: "
    "numbers, dates, limits, names, conditions, steps. For each, give the short correct answer and copy, word for word, "
    "the ONE sentence from the passage that contains the answer. Skip facts that need more than one sentence."
)
MULTI_QA_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"question": {"type": "string"}, "answer": {"type": "string"}, "evidence": {"type": "string"}},
                "required": ["question", "answer", "evidence"],
            },
        }
    },
    "required": ["items"],
}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _sentences(text: str) -> list[str]:
    out = []
    for line in text.splitlines():
        line = line.strip().lstrip("#").strip()
        if line.startswith(("- ", "* ")):
            line = line[2:]
        out.extend(s.strip() for s in re.split(r"(?<=[.!?])\s+", line) if len(s.strip()) > 15)
    return out


def snap_to_sentence(evidence: str, chunk: Chunk, min_ratio: float = 0.8) -> str | None:
    """The chunk sentence that best matches the model's evidence, if it is close enough."""
    best, best_ratio = None, 0.0
    for sentence in _sentences(chunk.text):
        ratio = difflib.SequenceMatcher(None, _norm(sentence), _norm(evidence), autojunk=False).ratio()
        if ratio > best_ratio:
            best, best_ratio = sentence, ratio
    if best is None or best_ratio < min_ratio or _norm(best) not in _norm(chunk.text):
        return None
    return best


def grow(engine: Engine, pack_id: str, target: int, per_chunk: int, n_unanswerable: int) -> dict:
    spec = discover(engine.settings.packs_dirs)[pack_id]
    manifest = json.loads((spec.path / "pack.json").read_text())
    existing = manifest["test_cases"]
    seen = {_norm(c["question"]) for c in existing}
    superseded = {d["file"] for d in manifest["documents"] if d.get("superseded_by")}
    older_of = {d["superseded_by"]: d["file"] for d in manifest["documents"] if d.get("superseded_by")}
    distractors = {d["file"] for d in manifest["documents"] if "distractor" in d["file"]}

    docs = {}
    for entry in manifest["documents"]:
        name, data = read_document_bytes(spec, entry)
        docs[name] = parse_document(name, data, engine.settings.chunk_chars)
    loaded = engine.load_pack("usr_grow", pack_id)
    all_chunks = [c for d in docs.values() for c in d.chunks]
    file_of = {c.chunk_id: name for name, d in docs.items() for c in d.chunks}

    want = max(0, target - len(existing))
    want_unanswerable = min(n_unanswerable, want)
    want_factoid = want - want_unanswerable
    new_cases: list[dict] = []

    # Factoids, round-robin over chunks so every part of every current document is covered.
    source_chunks = [c for c in all_chunks if file_of[c.chunk_id] not in superseded and len(c.text) >= 150]
    by_chunk: dict[str, list[dict]] = {}
    for chunk in source_chunks:
        if sum(len(v) for v in by_chunk.values()) >= want_factoid * 1.6:
            break
        engine.judge.start_tracking()
        try:
            result = engine.judge.ask(MULTI_QA_SYSTEM.format(n=per_chunk), f"Passage:\n{chunk.text}", MULTI_QA_SCHEMA)
        except JudgeError:
            continue
        writer = engine.judge.used()["judge_model"]
        for item in result.get("items", [])[:per_chunk]:
            question = str(item.get("question", "")).strip()
            answer = str(item.get("answer", "")).strip()
            quote = snap_to_sentence(str(item.get("evidence", "")), chunk)
            if len(question) < 12 or not answer or not quote or _norm(question) in seen:
                continue
            seen.add(_norm(question))
            gold = [{"file": file_of[chunk.chunk_id], "quote": quote}]
            older = older_of.get(file_of[chunk.chunk_id])
            if older and _norm(quote) in _norm("\n".join(c.text for c in docs[older].chunks)):
                gold.append({"file": older, "quote": quote})  # unchanged fact: either version is right
            by_chunk.setdefault(chunk.chunk_id, []).append(
                {"question": question, "ground_truth_answer": answer, "type": "factoid", "gold": gold, "_chunk": chunk.chunk_id, "generated_by": writer}
            )
    queues = list(by_chunk.values())
    while len(new_cases) < want_factoid and any(queues):
        for queue in queues:
            if queue and len(new_cases) < want_factoid:
                new_cases.append(queue.pop(0))

    # Distractor typing by measured retrieval rank: does a distractor chunk outrank the gold chunk?
    if distractors and new_cases:
        vectors = np.asarray(engine.embedder.embed([c.text for c in all_chunks], "passage"), dtype=np.float32)
        vectors /= np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-9
        index = {c.chunk_id: i for i, c in enumerate(all_chunks)}
        q_vecs = np.asarray(engine.embedder.embed([c["question"] for c in new_cases], "query"), dtype=np.float32)
        q_vecs /= np.linalg.norm(q_vecs, axis=1, keepdims=True) + 1e-9
        for case, qv in zip(new_cases, q_vecs):
            sims = vectors @ qv
            gold_sim = sims[index[case["_chunk"]]]
            best_distractor = max(sims[index[c.chunk_id]] for name in distractors for c in docs[name].chunks)
            if file_of[case["_chunk"]] not in distractors and best_distractor >= gold_sim:
                case["type"] = "distractor"
                case["note"] = f"A distractor chunk is at least as similar to the question ({best_distractor:.2f} vs gold {gold_sim:.2f})."

    # Unanswerable traps, each verified against the whole pack.
    attempts = 0
    excerpts = sample_chunks([c for c in all_chunks if file_of[c.chunk_id] not in superseded], 24, min_chars=0)
    while sum(c["type"] == "unanswerable" for c in new_cases) < want_unanswerable and attempts < want_unanswerable * 3:
        window = excerpts[(attempts * 4) % len(excerpts):][:6] or excerpts[:6]
        attempts += 1
        engine.judge.start_tracking()
        try:
            q = str(engine.judge.ask(
                UNANSWERABLE_SYSTEM + f" Attempt {attempts}: pick a different detail than before.",
                "Excerpts:\n" + "\n\n".join(c.text[:400] for c in window),
                UNANSWERABLE_SCHEMA,
            ).get("question", "")).strip()
        except JudgeError:
            continue
        if len(q) < 12 or _norm(q) in seen:
            continue
        top = engine.rag.retrieve("usr_grow", q, loaded["document_ids"], k=5)
        passages = "\n\n".join(f"[{i}] {s.chunk.text}" for i, s in enumerate(top, start=1))
        try:
            answered = engine.judge.ask(ANSWERED_SYSTEM, f"Question: {q}\n\nPassages:\n\n{passages}", ANSWERED_SCHEMA).get("answered")
        except JudgeError:
            continue
        if answered is False:
            seen.add(_norm(q))
            new_cases.append({"question": q, "ground_truth_answer": "", "type": "unanswerable", "gold": [], "generated_by": engine.judge.used()["judge_model"]})

    prefix = existing[0]["test_id"].rsplit("_", 1)[0] if existing else pack_id
    for n, case in enumerate(new_cases, start=len(existing) + 1):
        case.pop("_chunk", None)
        case["test_id"] = f"{prefix}_{n:02d}"
        case["origin"] = "synthetic"
    for case in existing:
        case.setdefault("origin", "hand")
    manifest["test_cases"] = existing + [
        {k: case[k] for k in ("test_id", "question", "ground_truth_answer", "type", "gold", "note", "origin", "generated_by") if k in case}
        for case in new_cases
    ]
    (spec.path / "pack.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return {"pack_id": pack_id, "hand": len(existing), "added": len(new_cases), "total": len(manifest["test_cases"])}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pack_id")
    parser.add_argument("--target", type=int, default=70)
    parser.add_argument("--per-chunk", type=int, default=3)
    parser.add_argument("--unanswerable", type=int, default=8)
    args = parser.parse_args()
    print(json.dumps(grow(Engine(), args.pack_id, args.target, args.per_chunk, args.unanswerable)))


if __name__ == "__main__":
    main()
