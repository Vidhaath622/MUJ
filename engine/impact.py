"""Change impact radar: what a document update breaks for users today.

1. Diff two versions of a document sentence by sentence (rules only, no model).
2. For each changed fact, ask the judge model for one question whose answer is the NEW
   sentence (numeric changes first).
3. Run those questions through the RAG system with BOTH versions indexed, as users would
   hit it, and flag the ones that still come back with the old fact.
"""

from __future__ import annotations

import difflib
import re

from .ingest import Chunk
from .llm import JudgeError

IMPACT_SYSTEM = (
    "A document was updated. Given an OLD sentence and the NEW sentence that replaced it, write ONE question a user "
    "would naturally ask whose correct answer is stated in the NEW sentence and differs from the OLD one. Do not "
    "mention old or new versions, documents, or which year's document. Give the short correct answer from the NEW sentence."
)
IMPACT_SCHEMA = {
    "type": "object",
    "properties": {"question": {"type": "string"}, "answer": {"type": "string"}},
    "required": ["question", "answer"],
}

_NUMBER = re.compile(r"\$?\d[\d,]*(?:\.\d+)?%?")
_YEAR = re.compile(r"^(19|20)\d\d$")
# Numbers that label rather than state a fact: parts of IDs like IR-2025-128 or Notice-2026-10, and days in dates.
_ID_OR_DATE = re.compile(
    r"(?:[A-Za-z]+-\d+(?:-\d+)*)|(?:\b\d{4}-\d+\b)|(?:\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2}\b)"
)


def numbers(text: str) -> list[str]:
    return [n.replace(",", "").strip("$%") for n in _NUMBER.findall(text)]


def fact_numbers(text: str) -> list[str]:
    """Numbers that state facts: IDs and calendar days are left out."""
    return numbers(_ID_OR_DATE.sub(" ", text))


def sentences(chunks: list[Chunk]) -> list[tuple[str, str]]:
    """(sentence, chunk_id) for every sentence long enough to state a fact; headings are skipped."""
    out = []
    for chunk in chunks:
        for line in chunk.text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            line = line.lstrip("-* ").strip()
            for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z$(])", line):
                sentence = sentence.strip()
                if len(sentence) >= 20:
                    out.append((sentence, chunk.chunk_id))
    return out


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def diff(old_chunks: list[Chunk], new_chunks: list[Chunk], threshold: float = 0.6) -> tuple[list[dict], int]:
    """Changes between two versions, plus the number of unchanged sentences."""
    old = sentences(old_chunks)
    new = sentences(new_chunks)
    old_norm = [_norm(s) for s, _ in old]
    used: set[int] = set()
    changes, unchanged = [], 0
    for sentence, chunk_id in new:
        norm = _norm(sentence)
        if norm in old_norm and old_norm.index(norm) not in used:
            used.add(old_norm.index(norm))
            unchanged += 1
            continue
        best, best_ratio = None, 0.0
        for i, candidate in enumerate(old_norm):
            if i in used:
                continue
            matcher = difflib.SequenceMatcher(None, candidate, norm, autojunk=False)
            if matcher.quick_ratio() < threshold:
                continue
            ratio = matcher.ratio()
            if ratio > best_ratio:
                best, best_ratio = i, ratio
        if best is not None and best_ratio >= threshold:
            used.add(best)
            old_sentence, old_chunk = old[best]
            old_nums, new_nums = numbers(old_sentence), numbers(sentence)
            pairs = [{"old": a, "new": b} for a, b in zip(old_nums, new_nums) if a != b]
            pairs += [{"old": None, "new": b} for b in new_nums[len(old_nums):]]
            pairs += [{"old": a, "new": None} for a in old_nums[len(new_nums):]]
            changes.append({"kind": "changed", "old": old_sentence, "new": sentence, "numbers_changed": pairs,
                            "old_chunk_id": old_chunk, "new_chunk_id": chunk_id, "similarity": round(best_ratio, 3)})
        else:
            changes.append({"kind": "added", "old": None, "new": sentence, "numbers_changed": [],
                            "old_chunk_id": None, "new_chunk_id": chunk_id})
    for i, (sentence, chunk_id) in enumerate(old):
        if i not in used:
            changes.append({"kind": "removed", "old": sentence, "new": None, "numbers_changed": [],
                            "old_chunk_id": chunk_id, "new_chunk_id": None})
    return _pair_rewrites(changes), unchanged


def _opening(text: str, words: int = 4) -> str:
    return " ".join(re.findall(r"[a-z]+", text.lower())[:words])


def _pair_rewrites(changes: list[dict], threshold: float = 0.4) -> list[dict]:
    """Second pass: a removed and an added sentence that open the same way are one rewritten fact."""
    removed = [c for c in changes if c["kind"] == "removed"]
    added = [c for c in changes if c["kind"] == "added"]
    paired: set[int] = set()
    for old in removed:
        best, best_ratio = None, 0.0
        for new in added:
            if id(new) in paired or _opening(new["new"]) != _opening(old["old"]):
                continue
            ratio = difflib.SequenceMatcher(None, _norm(old["old"]), _norm(new["new"]), autojunk=False).ratio()
            if ratio > best_ratio:
                best, best_ratio = new, ratio
        if best is not None and best_ratio >= threshold:
            paired.add(id(best))
            old_nums, new_nums = numbers(old["old"]), numbers(best["new"])
            pairs = [{"old": a, "new": b} for a, b in zip(old_nums, new_nums) if a != b]
            pairs += [{"old": None, "new": b} for b in new_nums[len(old_nums):]]
            pairs += [{"old": a, "new": None} for a in old_nums[len(new_nums):]]
            best.update(kind="changed", old=old["old"], old_chunk_id=old["old_chunk_id"], numbers_changed=pairs,
                        similarity=round(best_ratio, 3))
            old["kind"] = "_merged"
    return [c for c in changes if c["kind"] != "_merged"]


def priority(change: dict) -> tuple:
    """Changed facts with a changed number first (IDs, dates and years do not count), then other edits."""
    old, new = fact_numbers(change["old"] or ""), fact_numbers(change["new"] or "")
    fact_change = [n for n in set(old) ^ set(new) if not _YEAR.match(n)]
    return (not fact_change, not change["numbers_changed"], len(change["new"] or "") < 40, change.get("similarity", 1.0))


def quotes_old_value(answer: str, change: dict) -> bool:
    """The answer states an old number from this change and none of the new ones."""
    got = set(numbers(answer))
    old = {p["old"] for p in change["numbers_changed"] if p["old"] and not _YEAR.match(p["old"])}
    new = {p["new"] for p in change["numbers_changed"] if p["new"] and not _YEAR.match(p["new"])}
    return bool(old & got) and not (new & got)


def make_tests(judge, changes: list[dict], max_tests: int) -> list[tuple[dict, dict]]:
    """(test case, change) pairs: one generated question per changed fact."""
    candidates = sorted([c for c in changes if c["kind"] == "changed"], key=priority)
    tests = []
    for change in candidates:
        if len(tests) >= max_tests:
            break
        try:
            result = judge.ask(IMPACT_SYSTEM, f"OLD: {change['old']}\nNEW: {change['new']}", IMPACT_SCHEMA)
        except JudgeError:
            continue
        question, answer = str(result.get("question", "")).strip(), str(result.get("answer", "")).strip()
        if len(question) < 10 or not answer:
            continue
        change["tested"] = True
        tests.append((
            {
                "test_id": f"imp_{len(tests) + 1:02d}",
                "question": question,
                "ground_truth_answer": answer,
                "type": "stale",
                "gold_chunk_ids": [change["new_chunk_id"]],
                "stale_chunk_ids": [change["old_chunk_id"]],
            },
            change,
        ))
    return tests
