"""Synthetic test-question generator.

From each sampled chunk it asks the judge model for a question, a short answer
and the exact sentence that answers it. A case is kept only if that sentence is
really in the chunk, so every gold chunk_id is checked, not trusted.
Also makes unanswerable traps (answer must be an abstention) and, when an older
version of the document is present, stale-version traps.
"""

from __future__ import annotations

import difflib
import re

from .ingest import Chunk
from .llm import Judge, JudgeError
from .rag import RagSystem

QA_SYSTEM = (
    "You write test questions for a document Q&A system. Given one passage, write ONE question that a real user "
    "might ask and that this passage answers on its own. Prefer specific facts: numbers, dates, limits, names, conditions. "
    "Do not mention 'the passage' or 'the document' in the question. "
    "Give the short correct answer and copy, word for word, the sentence from the passage that contains the answer."
)
QA_SCHEMA = {
    "type": "object",
    "properties": {"question": {"type": "string"}, "answer": {"type": "string"}, "evidence": {"type": "string"}},
    "required": ["question", "answer", "evidence"],
}

UNANSWERABLE_SYSTEM = (
    "You write trap questions for a document Q&A system. Given excerpts from a document, write ONE question on the same "
    "topic that sounds like it should be answered by this document but is NOT answered anywhere in the excerpts "
    "(for example a detail, number or case they never mention). Do not mention 'the document' in the question."
)
UNANSWERABLE_SCHEMA = {
    "type": "object",
    "properties": {"question": {"type": "string"}},
    "required": ["question"],
}

ANSWERED_SYSTEM = (
    "Decide whether any of the numbered passages answers the question. answered=true only if a passage states the answer."
)
ANSWERED_SCHEMA = {
    "type": "object",
    "properties": {"answered": {"type": "boolean"}},
    "required": ["answered"],
}

STALE_SYSTEM = (
    "Two passages come from an OLD and a NEW version of the same document. If they state DIFFERENT values for the same "
    "fact (a number, date, limit, fee, requirement), write ONE question about that fact, the answer from the NEW version, "
    "and the outdated answer from the OLD version. If they do not differ on any fact, set changed=false."
)
STALE_SCHEMA = {
    "type": "object",
    "properties": {
        "changed": {"type": "boolean"},
        "question": {"type": "string"},
        "new_answer": {"type": "string"},
        "old_answer": {"type": "string"},
    },
    "required": ["changed", "question", "new_answer", "old_answer"],
}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s%$.]", " ", text.lower())).strip()


def evidence_in_chunk(evidence: str, chunk_text: str, threshold: float = 0.85) -> bool:
    ev, text = _norm(evidence), _norm(chunk_text)
    if len(ev) < 8:
        return False
    if ev in text:
        return True
    # Allow small copy errors: best fuzzy match over a window the size of the evidence.
    matcher = difflib.SequenceMatcher(None, text, ev, autojunk=False)
    block = matcher.find_longest_match(0, len(text), 0, len(ev))
    start = max(0, block.a - block.b)
    window = text[start : start + len(ev) + 10]
    return difflib.SequenceMatcher(None, window, ev, autojunk=False).ratio() >= threshold


def sample_chunks(chunks: list[Chunk], count: int, min_chars: int = 150) -> list[Chunk]:
    """Evenly spaced, deterministic sample of chunks with enough text to ask about."""
    usable = [c for c in chunks if len(c.text) >= min_chars] or chunks
    if count >= len(usable):
        return usable
    step = len(usable) / count
    return [usable[int(i * step)] for i in range(count)]


def version_key(filename: str) -> tuple[str, int | None]:
    """'fee_schedule_v2.pdf' -> ('fee schedule', 2). Used to pair old and new versions of a document."""
    stem = re.sub(r"\.[a-z0-9]+$", "", filename.lower())
    match = re.search(r"(?:^|[\s_\-])v(?:ersion)?[\s_\-]?(\d+)\b", stem)
    version = int(match.group(1)) if match else None
    base = re.sub(r"(?:^|[\s_\-])v(?:ersion)?[\s_\-]?\d+\b", " ", stem)
    base = re.sub(r"[\s_\-]+", " ", base).strip()
    return base, version


class SyntheticGenerator:
    def __init__(self, judge: Judge, rag: RagSystem):
        self.judge = judge
        self.rag = rag

    def factoid(self, chunk: Chunk) -> dict | None:
        try:
            result = self.judge.ask(QA_SYSTEM, f"Passage:\n{chunk.text}", QA_SCHEMA)
        except JudgeError:
            return None
        question = str(result.get("question", "")).strip()
        answer = str(result.get("answer", "")).strip()
        evidence = str(result.get("evidence", "")).strip()
        if len(question) < 10 or not answer or not evidence_in_chunk(evidence, chunk.text):
            return None
        return {
            "question": question,
            "ground_truth_answer": answer,
            "source_chunk_id": chunk.chunk_id,
            "gold_chunk_ids": [chunk.chunk_id],
            "context_snippet": evidence,
            "type": "factoid",
        }

    def unanswerable(self, owner_id: str, chunks: list[Chunk], document_ids: list[str]) -> dict | None:
        excerpt = "\n\n".join(c.text[:400] for c in sample_chunks(chunks, 6, min_chars=0))
        try:
            question = str(self.judge.ask(UNANSWERABLE_SYSTEM, f"Excerpts:\n{excerpt}", UNANSWERABLE_SCHEMA).get("question", "")).strip()
        except JudgeError:
            return None
        if len(question) < 10:
            return None
        # Verify against the whole document, not just the excerpt.
        top = self.rag.retrieve(owner_id, question, document_ids, k=5)
        passages = "\n\n".join(f"[{i}] {s.chunk.text}" for i, s in enumerate(top, start=1))
        try:
            answered = self.judge.ask(ANSWERED_SYSTEM, f"Question: {question}\n\nPassages:\n\n{passages}", ANSWERED_SCHEMA).get("answered")
        except JudgeError:
            return None
        if answered is not False:
            return None
        return {
            "question": question,
            "ground_truth_answer": "",
            "source_chunk_id": None,
            "gold_chunk_ids": [],
            "context_snippet": "",
            "type": "unanswerable",
        }

    def stale(self, owner_id: str, new_chunks: list[Chunk], old_chunks: list[Chunk], limit: int) -> list[dict]:
        """Pair each new chunk with its most similar old chunk; keep pairs where a fact changed."""
        if not new_chunks or not old_chunks or limit <= 0:
            return []
        new_vecs = self.rag.ollama.embed([f"search_document: {c.text}" for c in new_chunks])
        old_vecs = self.rag.ollama.embed([f"search_document: {c.text}" for c in old_chunks])
        import numpy as np

        a = np.asarray(new_vecs, dtype=np.float32)
        b = np.asarray(old_vecs, dtype=np.float32)
        a /= np.linalg.norm(a, axis=1, keepdims=True) + 1e-9
        b /= np.linalg.norm(b, axis=1, keepdims=True) + 1e-9
        sims = a @ b.T
        pairs = []
        for i, new in enumerate(new_chunks):
            j = int(np.argmax(sims[i]))
            if sims[i, j] >= 0.75 and _norm(new.text) != _norm(old_chunks[j].text):
                pairs.append((float(sims[i, j]), new, old_chunks[j]))
        pairs.sort(key=lambda p: -p[0])
        cases = []
        for _, new, old in pairs:
            if len(cases) >= limit:
                break
            try:
                result = self.judge.ask(STALE_SYSTEM, f"OLD version:\n{old.text}\n\nNEW version:\n{new.text}", STALE_SCHEMA)
            except JudgeError:
                continue
            if result.get("changed") is not True or not str(result.get("question", "")).strip():
                continue
            cases.append(
                {
                    "question": str(result["question"]).strip(),
                    "ground_truth_answer": str(result.get("new_answer", "")).strip(),
                    "stale_answer": str(result.get("old_answer", "")).strip(),
                    "source_chunk_id": new.chunk_id,
                    "gold_chunk_ids": [new.chunk_id],
                    "stale_chunk_ids": [old.chunk_id],
                    "context_snippet": new.text[:200],
                    "type": "stale",
                }
            )
        return cases

    def generate(
        self,
        owner_id: str,
        document_id: str,
        chunks: list[Chunk],
        count: int,
        search_document_ids: list[str],
        old_version_chunks: list[Chunk] | None = None,
        include_traps: bool = True,
    ) -> list[dict]:
        traps: list[dict] = []
        if include_traps and count >= 3:
            if old_version_chunks:
                traps.extend(self.stale(owner_id, chunks, old_version_chunks, limit=max(1, count // 5)))
            trap = self.unanswerable(owner_id, chunks, search_document_ids)
            if trap:
                traps.append(trap)
        wanted = max(0, count - len(traps))
        cases: list[dict] = []
        seen_questions: set[str] = set()
        # Over-sample: some candidates fail the evidence check.
        for chunk in sample_chunks(chunks, min(len(chunks), wanted * 2)):
            if len(cases) >= wanted:
                break
            case = self.factoid(chunk)
            if case and _norm(case["question"]) not in seen_questions:
                seen_questions.add(_norm(case["question"]))
                cases.append(case)
        out = cases + traps
        for i, case in enumerate(out, start=1):
            case["test_id"] = f"tc_{i:02d}"
            case["document_id"] = document_id
        return out
