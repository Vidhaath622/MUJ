"""Release gate: does this run of a pack meet the bar to ship?

Pass when the pass rate (share of questions with verdict CLEAN_PASS) is at least `min_pass_rate`
and no more than `max_new_failures` questions that passed in the baseline run fail now.
"""

from __future__ import annotations


def _passed(result: dict) -> bool:
    category = (result.get("root_cause") or {}).get("category") or result.get("category")
    return category == "CLEAN_PASS" and not result.get("error")


def _brief(result: dict) -> dict:
    root = result.get("root_cause") or {}
    return {
        "test_id": result.get("test_id"),
        "question": result.get("query") or result.get("question"),
        "category": root.get("category") or result.get("category"),
        "summary": root.get("summary"),
    }


def verdict(candidate: dict, baseline: dict | None, min_pass_rate: float, max_new_failures: int, report_url: str | None) -> dict:
    results = candidate.get("results", [])
    total = len(results)
    pass_rate = round(sum(_passed(r) for r in results) / total, 3) if total else 0.0
    new_failures, fixed = [], []
    if baseline is not None:
        before = {r.get("test_id"): _passed(r) for r in baseline.get("results", [])}
        for r in results:
            was = before.get(r.get("test_id"))
            if was is True and not _passed(r):
                new_failures.append(_brief(r))
            elif was is False and _passed(r):
                fixed.append(_brief(r))
    reasons = []
    if pass_rate < min_pass_rate:
        reasons.append(f"pass rate {pass_rate:.1%} is below the minimum {min_pass_rate:.1%}")
    if len(new_failures) > max_new_failures:
        reasons.append(f"{len(new_failures)} question(s) that passed in the baseline now fail (allowed: {max_new_failures})")
    return {
        "pass": not reasons,
        "reasons": reasons,
        "pass_rate": pass_rate,
        "min_pass_rate": min_pass_rate,
        "new_failures": new_failures,
        "max_new_failures": max_new_failures,
        "fixed": fixed,
        "total": total,
        "errors": sum(1 for r in results if r.get("error")),
        "batch_id": candidate.get("batch_id"),
        "pack_id": candidate.get("pack_id"),
        "baseline_batch_id": baseline.get("batch_id") if baseline else None,
        "answer_source": candidate.get("answer_source", "builtin"),
        "report_url": report_url,
    }
