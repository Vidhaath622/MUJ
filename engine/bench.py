"""Measure a cold batch on the real models: N pack questions, a fresh judge cache, live data untouched.

    python -m engine.bench --env backend/.env --cases 200

Uses the API keys and models from the .env file (keys are never printed) and local Ollama for the
generator and embeddings. Everything is written to a new temporary directory, so the judge cache
is empty (cold) and the backend's data is not touched. Prints progress, then the batch timing:
wall time, cases per minute, judge calls and tokens, time spent waiting on rate limits, and calls
per API key.

Cost: about 1.3 judge calls per question, each 1-2K tokens, so 200 questions spend roughly
300-400K tokens of the Groq keys' daily budget (200K tokens per key per day on gpt-oss-120b).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from pathlib import Path

PACK_ORDER = ("banking", "healthcare", "recruitment", "realworld", "ragseal")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", type=Path, required=True, help="the backend .env with the API keys")
    parser.add_argument("--cases", type=int, default=200)
    parser.add_argument("--packs", default=",".join(PACK_ORDER), help='comma-separated pack ids, or "all"')
    parser.add_argument("--workers", type=int, default=None, help="batch concurrency (default: the engine's choice)")
    args = parser.parse_args()

    from dotenv import load_dotenv

    if not args.env.exists():
        sys.exit(f"{args.env} does not exist")
    load_dotenv(args.env, override=True)
    os.environ.pop("DATABASE_URL", None)  # the engine never uses it; keep it out of this process anyway
    data_dir = Path(tempfile.mkdtemp(prefix="ragseal-bench-"))
    os.environ["RAGSEAL_DATA_DIR"] = str(data_dir)

    from .config import get_settings
    from .service import Engine

    engine = Engine(get_settings())
    judge = engine.judge
    print(f"judge {judge.provider}:{judge.model} on {sum(1 for m in judge.primary if m.hosted)} key(s); "
          f"generator {engine.generator.model}; data in {data_dir}", flush=True)

    started = time.perf_counter()
    document_ids, cases = [], []
    available = [p["pack_id"] for p in engine.list_packs()]
    wanted = available if args.packs == "all" else [p for p in args.packs.split(",") if p in available]
    for pack_id in wanted:
        if len(cases) >= args.cases:
            break
        pack = engine.load_pack("bench", pack_id)
        document_ids += pack["document_ids"]
        cases += pack["test_cases"]
    cases = cases[: args.cases]
    print(f"ingested packs in {time.perf_counter() - started:.0f} s; running {len(cases)} questions cold", flush=True)

    def progress(done: int, total: int, failed: int) -> None:
        if done % 10 == 0 or done == total:
            elapsed = time.perf_counter() - begun
            print(f"  {done}/{total} done, {failed} failed, {elapsed:.0f} s, {done / elapsed * 60:.1f} per min", flush=True)

    begun = time.perf_counter()
    batch = engine.evaluate_batch("bench", document_ids, cases, progress=progress, concurrency=args.workers)
    timing = batch["timing"]
    print(json.dumps({
        "questions": len(cases),
        "packs": wanted,
        "origins": {o: sum(1 for c in cases if c.get("origin", "hand") == o) for o in {c.get("origin", "hand") for c in cases}},
        "wall_min": round(timing["wall_ms"] / 60000, 2),
        "failed": batch.get("failed_cases"),
        "judge_models_used": batch["judge_models_used"],
        "judge_fallback_cases": batch["judge_fallback_cases"],
        "categories": batch["root_cause_breakdown"],
        **timing,
    }, indent=1))


if __name__ == "__main__":
    main()
