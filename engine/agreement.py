"""Judge-vs-human agreement.

labels.json format (a list; one entry per hand-labelled answer):
    [{"test_id": "bank_03", "question": "...", "ground_truth": "...", "answer": "the answer that was labelled",
      "label": "correct" | "incorrect", "labeller": "initials", "pack_id": "banking"}]

The judge re-scores each labelled (question, ground_truth, answer) triple, so
agreement does not depend on the generator producing the same answer again.
"""

from __future__ import annotations

import json
from pathlib import Path

from .llm import Judge, JudgeError
from .scoring import score_answer_accuracy


def load_labels(path: Path) -> list[dict]:
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return [d for d in data if d.get("label") in ("correct", "incorrect") and d.get("answer")]


def agreement_stats(pairs: list[tuple[bool, bool]]) -> dict | None:
    """pairs of (judge_pass, human_pass). Returns None when there is nothing to compare."""
    if not pairs:
        return None
    agree = sum(j == h for j, h in pairs)
    return {
        "agreement": round(agree / len(pairs), 3),
        "n": len(pairs),
        "false_pass": sum(j and not h for j, h in pairs),
        "false_fail": sum(h and not j for j, h in pairs),
    }


def judge_agreement(judge: Judge, labels: list[dict], test_ids: set[str] | None = None) -> dict | None:
    pairs: list[tuple[bool, bool]] = []
    for item in labels:
        if test_ids is not None and item.get("test_id") not in test_ids:
            continue
        unanswerable = not item.get("ground_truth") and item.get("type") == "unanswerable"
        try:
            result = score_answer_accuracy(judge, item["question"], item["answer"], item.get("ground_truth"), unanswerable)
        except JudgeError:
            continue
        if result.score is None:
            continue
        pairs.append((result.passed, item["label"] == "correct"))
    return agreement_stats(pairs)


__all__ = ["agreement_stats", "judge_agreement", "load_labels"]
