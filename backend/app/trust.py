"""Agreement statistics for the evaluator-trust page. Pure functions, no I/O."""

from __future__ import annotations

from collections import Counter


def cohen_kappa(a: list, b: list) -> float | None:
    """Cohen's kappa for two raters over the same items (any hashable labels)."""
    n = len(a)
    if n == 0 or n != len(b):
        return None
    observed = sum(x == y for x, y in zip(a, b)) / n
    count_a, count_b = Counter(a), Counter(b)
    expected = sum(count_a[k] * count_b[k] for k in set(a) | set(b)) / (n * n)
    if expected == 1:
        return 1.0 if observed == 1 else None  # both raters used one label throughout: kappa is undefined
    return round((observed - expected) / (1 - expected), 3)


def agreement(labels: list[dict], runs: dict[str, dict]) -> dict:
    """Human-human agreement on double-labelled items, then the pipeline against the human consensus.

    An item is (batch_id, test_id). The pipeline "passes" an item when its verdict is CLEAN_PASS.
    Consensus items are those where the first two labellers agree on correct/incorrect.
    """
    by_item: dict[tuple[str, str], dict[str, dict]] = {}
    for label in labels:
        by_item.setdefault((label["batch_id"], label["test_id"]), {})[label["labeler"]] = label

    double = {key: votes for key, votes in by_item.items() if len(votes) >= 2}
    first, second, pipe_votes, human_votes = [], [], [], []
    false_pass = false_fail = 0
    type_pairs = []
    disagreements = []
    for (batch_id, test_id), votes in sorted(double.items()):
        (name_a, a), (name_b, b) = sorted(votes.items())[:2]
        first.append(a["correct"])
        second.append(b["correct"])
        if not a["correct"] and not b["correct"] and a.get("failure_type") and b.get("failure_type"):
            type_pairs.append((a["failure_type"], b["failure_type"]))
        result = next((r for r in runs.get(batch_id, {}).get("results", []) if r["test_id"] == test_id), None)
        verdict = result["root_cause"]["category"] if result else None
        humans = f"{name_a}: {'correct' if a['correct'] else 'incorrect'} / {name_b}: {'correct' if b['correct'] else 'incorrect'}"
        if a["correct"] != b["correct"]:
            disagreements.append({"test_id": test_id, "batch_id": batch_id, "question": a["question"], "humans": humans,
                                  "pipeline": verdict, "kind": "human_vs_human", "note": a.get("note") or b.get("note")})
            continue
        if verdict is None:
            continue
        pipeline_pass = verdict == "CLEAN_PASS"
        pipe_votes.append(pipeline_pass)
        human_votes.append(a["correct"])
        if pipeline_pass and not a["correct"]:
            false_pass += 1
        elif not pipeline_pass and a["correct"]:
            false_fail += 1
        if pipeline_pass != a["correct"]:
            disagreements.append({"test_id": test_id, "batch_id": batch_id, "question": a["question"], "humans": humans,
                                  "pipeline": verdict, "kind": "pipeline_vs_consensus", "note": a.get("note") or b.get("note")})

    n_pipe = len(pipe_votes)
    return {
        "n_labels": len(labels),
        "n_items_labeled": len(by_item),
        "n_double_labeled": len(double),
        "labelers": sorted({l["labeler"] for l in labels}),
        "human_human": {
            "agreement": round(sum(x == y for x, y in zip(first, second)) / len(first), 3) if first else None,
            "cohen_kappa": cohen_kappa(first, second),
            "n": len(first),
            "failure_type_agreement": (
                round(sum(x == y for x, y in type_pairs) / len(type_pairs), 3) if type_pairs else None
            ),
            "failure_type_n": len(type_pairs),
        },
        "pipeline_vs_consensus": {
            "agreement": round(sum(p == h for p, h in zip(pipe_votes, human_votes)) / n_pipe, 3) if n_pipe else None,
            "kappa": cohen_kappa(pipe_votes, human_votes),
            "false_pass": false_pass,
            "false_fail": false_fail,
            "n": n_pipe,
        },
        "disagreements": disagreements,
    }
