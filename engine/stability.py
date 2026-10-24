"""Is the evaluation stable? Swap the judge, shuffle the inputs, and measure what moves.

Both checks re-score answers that a batch already produced (same question, retrieved
chunks, answer and ground truth), so only the judging changes:

  judge swap  every case scored by judge A and by judge B (single models, no pool);
              per-metric Pearson correlation, verdict agreement and Cohen's kappa
  shuffle     the retrieved chunks passed to the judge in a different order, `shuffles`
              times; a new order is a new prompt, so the judge cache cannot hide
              instability. Max and mean score change per case; a case is stable when no
              metric moves more than `threshold` and its verdict never changes.
"""

from __future__ import annotations

import math
import random
from concurrent.futures import ThreadPoolExecutor

from .ingest import Chunk
from .llm import ChatModel, Judge, JudgeError, ModelUnavailable
from .rag import is_abstention
from .scoring import score_case
from .verdict import Facts, decide

METRICS = ("context_relevance", "faithfulness", "answer_accuracy")


def pearson(xs: list[float], ys: list[float]) -> float | None:
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    if len(pairs) < 3:
        return None
    xs, ys = [p[0] for p in pairs], [p[1] for p in pairs]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if sx == 0 or sy == 0:
        # A constant series has no correlation; report exact agreement as 1.0 rather than undefined.
        return 1.0 if xs == ys else None
    return round(sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy), 3)


def cohen_kappa(a: list, b: list) -> float | None:
    n = len(a)
    if n == 0:
        return None
    observed = sum(x == y for x, y in zip(a, b)) / n
    labels = set(a) | set(b)
    expected = sum((a.count(k) / n) * (b.count(k) / n) for k in labels)
    if expected == 1:
        return 1.0 if observed == 1 else None
    return round((observed - expected) / (1 - expected), 3)


def _rescore(judge: Judge, result: dict, chunks: list[Chunk], replay_chunks: list[Chunk]) -> dict:
    """Metrics and verdict for a finished result under `judge`, with `chunks` in the given order."""
    gt = result.get("ground_truth")
    unanswerable = bool(result.get("expected_abstain"))
    scores = score_case(judge, result["query"], result["generated_answer"], chunks, gt, unanswerable)
    replay_correct = None
    if result.get("replay") and replay_chunks:
        replay = score_case(judge, result["query"], result["replay"]["answer"], replay_chunks, gt, unanswerable, with_relevance=False)
        replay_correct = replay.accuracy.passed
    retrieved = {c.chunk_id for c in chunks}
    facts = Facts(
        has_ground_truth=bool(gt) or unanswerable,
        unanswerable=unanswerable,
        abstained=is_abstention(result["generated_answer"]),
        gold_known=bool(result.get("gold_chunk_ids")),
        gold_retrieved=bool(set(result.get("gold_chunk_ids") or []) & retrieved),
        relevant_context=scores.relevance.passed if scores.relevance else False,
        faithful=None if scores.faithfulness.score is None else scores.faithfulness.passed,
        correct=None if scores.accuracy.score is None else scores.accuracy.passed,
        stale_retrieved=bool(set(result.get("stale_chunk_ids") or []) & retrieved),
        replay_ran=replay_correct is not None,
        replay_correct=replay_correct,
    )
    return {
        "context_relevance": scores.relevance.score if scores.relevance else None,
        "faithfulness": scores.faithfulness.score,
        "answer_accuracy": scores.accuracy.score,
        "verdict": decide(facts).category,
    }


def run_stability(
    engine,
    owner_id: str,
    batch: dict,
    judges: tuple[ChatModel, ChatModel],
    shuffles: int = 3,
    max_cases: int = 20,
    threshold: float = 0.15,
    seed: int = 11,
    progress=None,
) -> dict:
    results = [r for r in batch.get("results", []) if not r.get("error") and r.get("retrieved_chunk_ids")]
    rng = random.Random(seed)
    if len(results) > max_cases:
        results = rng.sample(results, max_cases)
    cache = engine.settings.data_dir / "judge_cache.sqlite"
    judge_a, judge_b = (Judge(m, cache, max_wait_s=120) for m in judges)
    total = len(results) * (2 + shuffles)
    done = 0

    def tick():
        nonlocal done
        done += 1
        if progress:
            progress(done, total, 0)

    def chunks_of(result: dict) -> tuple[list[Chunk], list[Chunk]]:
        chunks = engine.store.get_chunks(owner_id, result["retrieved_chunk_ids"])
        replay = engine.store.get_chunks(owner_id, (result.get("replay") or {}).get("context_chunk_ids") or result.get("gold_chunk_ids") or [])
        return chunks, replay

    def swap(result: dict) -> tuple[dict | None, dict | None]:
        chunks, replay = chunks_of(result)
        out = []
        for judge in (judge_a, judge_b):
            try:
                out.append(_rescore(judge, result, chunks, replay))
            except (JudgeError, ModelUnavailable):
                out.append(None)
            tick()
        return out[0], out[1]

    def shuffled(item: tuple[int, dict]) -> list[dict | None]:
        index, result = item
        chunks, replay = chunks_of(result)
        local = random.Random(seed * 1000 + index)
        runs = []
        for _ in range(shuffles):
            order = chunks[:]
            # Every shuffle must differ from the original order, or it tests nothing.
            for _ in range(10):
                local.shuffle(order)
                if [c.chunk_id for c in order] != [c.chunk_id for c in chunks] or len(order) < 2:
                    break
            try:
                runs.append(_rescore(judge_a, result, order, replay))
            except (JudgeError, ModelUnavailable):
                runs.append(None)
            tick()
        return runs

    # Judges A and B have separate rate limits, so their calls overlap.
    with ThreadPoolExecutor(max_workers=4) as pool:
        swapped = list(pool.map(swap, results))
        shuffle_runs = list(pool.map(shuffled, enumerate(results)))

    pairs = [(a, b) for a, b in swapped if a and b]
    correlation = {m: pearson([a[m] for a, _ in pairs], [b[m] for _, b in pairs]) for m in METRICS}
    verdicts_a = [a["verdict"] for a, _ in pairs]
    verdicts_b = [b["verdict"] for _, b in pairs]

    per_case = []
    for (base, _), runs, result in zip(swapped, shuffle_runs, results):
        valid = [r for r in runs if r]
        if not base or not valid:
            continue
        deltas = [abs(r[m] - base[m]) for r in valid for m in METRICS if r[m] is not None and base[m] is not None]
        max_delta = max(deltas) if deltas else 0.0
        verdict_changed = any(r["verdict"] != base["verdict"] for r in valid)
        per_case.append({
            "test_id": result.get("test_id"),
            "max_delta": round(max_delta, 3),
            "verdict_changed": verdict_changed,
            "stable": max_delta <= threshold and not verdict_changed,
        })
    max_delta = max((c["max_delta"] for c in per_case), default=None)
    unstable = [c for c in per_case if not c["stable"]]
    verdict_agreement = round(sum(a == b for a, b in zip(verdicts_a, verdicts_b)) / len(pairs), 3) if pairs else None
    judge_names = [f"{m.provider}:{m.model}" for m in judges]
    disagreeing = [
        {"test_id": r.get("test_id"), "judge_a": a["verdict"], "judge_b": b["verdict"]}
        for (a, b), r in zip(swapped, results) if a and b and a["verdict"] != b["verdict"]
    ]
    return {
        "batch_id": batch.get("batch_id"),
        "judges": judge_names,
        "n_cases": len(results),
        "judge_swap": {
            "correlation": correlation,
            "verdict_agreement": verdict_agreement,
            "verdict_kappa": cohen_kappa(verdicts_a, verdicts_b),
            "n": len(pairs),
            "disagreements": disagreeing,
        },
        "shuffle": {
            "runs": shuffles,
            "max_delta": max_delta,
            "mean_delta": round(sum(c["max_delta"] for c in per_case) / len(per_case), 3) if per_case else None,
            "unstable_cases": len(unstable),
            "verdict_changes": sum(c["verdict_changed"] for c in per_case),
            "stable": not unstable if per_case else None,
            "threshold": threshold,
            "cases": per_case,
        },
        "stable": (not unstable and (verdict_agreement or 0) >= 0.8) if per_case else None,
    }
