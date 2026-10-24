"""Compare two RAG versions on the same questions and say whether the difference is real.

A question "passes" when its verdict is CLEAN_PASS. The comparison is paired (same
test_id in both runs):
  flips          pass->fail (regressions) and fail->pass (fixes), per question
  delta          candidate pass rate minus base pass rate, with a paired bootstrap 95% CI
  mcnemar_p      exact two-sided McNemar test on the discordant pairs
  meaningful     p < 0.05 and the CI excludes 0
"""

from __future__ import annotations

import math
import random

PROFILES = {
    "v1": {
        "id": "v1",
        "name": "v1 baseline",
        "description": "Top-4 dense retrieval over every document, including superseded versions.",
        "params": {"top_k": 4, "newest_versions_only": False},
    },
    "v2": {
        "id": "v2",
        "name": "v2 top-2, newest versions only",
        "description": "Top-2 retrieval and superseded document versions filtered out before search.",
        "params": {"top_k": 2, "newest_versions_only": True},
    },
}


def _passed(result: dict) -> bool:
    return result["root_cause"]["category"] == "CLEAN_PASS"


def mcnemar_exact(b: int, c: int) -> float | None:
    """Two-sided exact McNemar p-value from the discordant counts b (pass->fail) and c (fail->pass)."""
    n = b + c
    if n == 0:
        return None
    k = min(b, c)
    tail = sum(math.comb(n, i) for i in range(k + 1)) / 2**n
    return round(min(1.0, 2 * tail), 4)


def bootstrap_ci(diffs: list[int], iterations: int = 2000, seed: int = 5) -> tuple[float, float] | None:
    if not diffs:
        return None
    rng = random.Random(seed)
    n = len(diffs)
    means = sorted(sum(diffs[rng.randrange(n)] for _ in range(n)) / n for _ in range(iterations))
    return round(means[int(0.025 * iterations)], 3), round(means[int(0.975 * iterations) - 1], 3)


def compare_runs(base: list[dict], candidate: list[dict], base_id: str, candidate_id: str) -> dict:
    base_by_id = {r["test_id"]: r for r in base if not r.get("error")}
    cand_by_id = {r["test_id"]: r for r in candidate if not r.get("error")}
    shared = [t for t in base_by_id if t in cand_by_id]
    flips, diffs = [], []
    b = c = 0
    acc_deltas = []
    for test_id in shared:
        old, new = base_by_id[test_id], cand_by_id[test_id]
        p_old, p_new = _passed(old), _passed(new)
        diffs.append(int(p_new) - int(p_old))
        a_old, a_new = old["metrics"]["answer_accuracy"]["score"], new["metrics"]["answer_accuracy"]["score"]
        if a_old is not None and a_new is not None:
            acc_deltas.append(a_new - a_old)
        if p_old != p_new:
            b += p_old and not p_new
            c += p_new and not p_old
            flips.append({
                "test_id": test_id,
                "question": new["query"],
                "pack_id": new.get("pack_id"),
                "base_verdict": old["root_cause"]["category"],
                "candidate_verdict": new["root_cause"]["category"],
                "base_failure_type": old["root_cause"].get("failure_type"),
                "candidate_failure_type": new["root_cause"].get("failure_type"),
                "direction": "pass_to_fail" if p_old else "fail_to_pass",
                "base_accuracy": a_old,
                "candidate_accuracy": a_new,
                "base_answer": old["generated_answer"],
                "candidate_answer": new["generated_answer"],
            })
    n = len(shared)
    base_rate = round(sum(_passed(base_by_id[t]) for t in shared) / n, 3) if n else None
    cand_rate = round(sum(_passed(cand_by_id[t]) for t in shared) / n, 3) if n else None
    delta = round(cand_rate - base_rate, 3) if n else None
    ci = bootstrap_ci(diffs)
    p = mcnemar_exact(b, c)
    meaningful = bool(p is not None and p < 0.05 and ci and (ci[0] > 0 or ci[1] < 0))
    if not n:
        verdict = "NO_DATA"
    elif meaningful:
        verdict = "IMPROVEMENT" if delta > 0 else "REGRESSION"
    else:
        verdict = "NO_MEANINGFUL_CHANGE"
    flips.sort(key=lambda f: (f["direction"] != "pass_to_fail", f["test_id"]))
    return {
        "base": base_id,
        "candidate": candidate_id,
        "n": n,
        "base_pass_rate": base_rate,
        "candidate_pass_rate": cand_rate,
        "accuracy_delta": delta,
        "answer_accuracy_delta": round(sum(acc_deltas) / len(acc_deltas), 3) if acc_deltas else None,
        "ci": list(ci) if ci else None,
        "mcnemar_p": p,
        "pass_to_fail": b,
        "fail_to_pass": c,
        "meaningful": meaningful,
        "verdict": verdict,
        "flips": flips,
    }
