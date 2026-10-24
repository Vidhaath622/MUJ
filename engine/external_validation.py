"""External validation of the faithfulness check on RAGTruth (third-party human labels).

    python -m engine.external_validation <ragtruth_dataset_dir> --n 50 --out report.json

RAGTruth (Niu et al., ACL 2024; github.com/ParticleMedia/RAGTruth, MIT licence) has answers
from several LLMs to retrieval-augmented tasks, with hallucinated spans marked by human
annotators. We take QA items from the test split, balanced between answers with at least one
annotated hallucination span and answers with none, run our claim-level faithfulness check
against the same passages the model was given, and compare at the answer level:
predicted "hallucinated" = at least one claim judged unsupported or contradicted.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from .config import get_settings
from .ingest import Chunk
from .llm import Judge, JudgeError, ModelUnavailable, build_models
from .scoring import score_faithfulness


def load_items(dataset: Path, n: int, seed: int) -> list[dict]:
    sources = {}
    for line in (dataset / "source_info.jsonl").open():
        s = json.loads(line)
        if s.get("task_type") == "QA":
            sources[s["source_id"]] = s
    hallucinated, clean = [], []
    for line in (dataset / "response.jsonl").open():
        r = json.loads(line)
        if r.get("split") != "test" or r["source_id"] not in sources or r.get("quality", "good") != "good":
            continue
        (hallucinated if r.get("labels") else clean).append(r)
    rng = random.Random(seed)
    sample = rng.sample(hallucinated, n // 2) + rng.sample(clean, n - n // 2)
    rng.shuffle(sample)
    return [{"response": r, "source": sources[r["source_id"]]} for r in sample]


def passages_of(source: dict) -> list[Chunk]:
    info = source["source_info"]
    raw = info.get("passages", "") if isinstance(info, dict) else str(info)
    parts = [p.strip() for p in raw.split("\n\n") if p.strip()] or [raw]
    return [Chunk(f"rt_{source['source_id']}_{i}", f"rt_{source['source_id']}", i, text, None) for i, text in enumerate(parts)]


def run(dataset: Path, n: int, seed: int) -> dict:
    settings = get_settings()
    models = build_models(settings)
    judge = Judge(models.judge, settings.data_dir / "judge_cache.sqlite", replicas=models.judge_replicas, max_wait_s=600)
    rows = []
    for item in load_items(dataset, n, seed):
        r, s = item["response"], item["source"]
        try:
            result = score_faithfulness(judge, r["response"], passages_of(s))
        except (JudgeError, ModelUnavailable) as exc:
            rows.append({"id": r["id"], "error": str(exc)})
            continue
        bad = result.extra.get("hallucinated_claims", [])
        rows.append({
            "id": r["id"],
            "model": r.get("model"),
            "human_hallucinated": bool(r.get("labels")),
            "human_spans": [l.get("text") for l in r.get("labels", [])],
            "human_label_types": sorted({l.get("label_type") for l in r.get("labels", [])}),
            "predicted_hallucinated": bool(bad),
            "faithfulness": result.score,
            "flagged_claims": bad,
        })
    scored = [x for x in rows if "error" not in x]
    tp = sum(x["human_hallucinated"] and x["predicted_hallucinated"] for x in scored)
    fp = sum(not x["human_hallucinated"] and x["predicted_hallucinated"] for x in scored)
    fn = sum(x["human_hallucinated"] and not x["predicted_hallucinated"] for x in scored)
    tn = sum(not x["human_hallucinated"] and not x["predicted_hallucinated"] for x in scored)
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    f1 = 2 * precision * recall / (precision + recall) if precision and recall else None
    return {
        "dataset": "RAGTruth (Niu et al., ACL 2024), github.com/ParticleMedia/RAGTruth, MIT licence; QA task, test split",
        "judge": f"{judge.provider}:{judge.model}",
        "n": len(scored),
        "errors": len(rows) - len(scored),
        "sample": f"balanced random sample, seed {seed}: {n // 2} answers with human-annotated hallucination spans, {n - n // 2} without",
        "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
        "precision": round(precision, 3) if precision is not None else None,
        "recall": round(recall, 3) if recall is not None else None,
        "f1": round(f1, 3) if f1 is not None else None,
        "accuracy": round((tp + tn) / len(scored), 3) if scored else None,
        "items": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--n", type=int, default=50)
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    report = run(args.dataset, args.n, args.seed)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps({k: v for k, v in report.items() if k != "items"}, indent=2))


if __name__ == "__main__":
    main()
