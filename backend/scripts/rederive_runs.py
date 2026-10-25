"""Bring stored runs up to the current verdict rules, with no model calls. Dry run unless --apply.

    python backend/scripts/rederive_runs.py backend/data/app.sqlite            # counts only
    python backend/scripts/rederive_runs.py backend/data/app.sqlite --apply    # backs up, then updates

What changes (25 Oct rules):
  - an answer or replay answer that breaks off mid-sentence ("... lowered to [1].") but was scored
    correct is set to 0 accuracy, and that result's verdict is re-derived from its stored facts;
  - every replay gets `blames` (retriever | generator | both) read from its verdict, and the
    "gold chunk found, replay correct" explanation says the generator is at fault, not the retriever.
Distractor documents are taken from each run's pack files (no ingest), so re-derived verdicts keep
their distractor facts. Other results are not re-derived, so nothing else moves.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from engine.config import Settings  # noqa: E402
from engine.evaluate import rederive  # noqa: E402
from engine.ingest import document_id_for  # noqa: E402
from engine.packs import discover, read_document_bytes  # noqa: E402
from engine.scoring import cut_off_without_answer  # noqa: E402
from engine.verdict import replay_blame  # noqa: E402

OLD_EFFECT = "With only the gold chunk the answer was correct, so the extra retrieved chunks distracted the generator."
NEW_EFFECT = ("The retriever found the right text. With only that passage the generator answered correctly, so the "
              "other retrieved chunks distracted it: the generator did not stick to the right passage.")


def distractor_ids() -> dict[str, list[str]]:
    out = {}
    for pack_id, spec in discover(Settings().packs_dirs).items():
        ids = []
        for entry in spec.documents:
            filename, data = read_document_bytes(spec, entry)
            if entry.get("role") == "distractor" or "distractor" in filename.lower():
                ids.append(document_id_for(data))
        out[pack_id] = ids
    return out


def update_result(result: dict, distractors: list[str]) -> tuple[dict, str | None]:
    """(new result, what changed) for one stored result."""
    if result.get("error"):
        return result, None
    replay = result.get("replay") or {}
    truth = result.get("ground_truth")
    cut = (result["metrics"]["answer_accuracy"].get("score") and cut_off_without_answer(result.get("generated_answer", ""), truth)
           and not result.get("expected_abstain")) or (replay.get("answer_accuracy") and cut_off_without_answer(replay.get("answer") or "", truth))
    if cut:
        new = rederive(result, distractors)
        return new, f"cut-off answer: {result['root_cause']['category']} -> {new['root_cause']['category']}"
    if not replay:
        return result, None
    blames = replay_blame(result["root_cause"]["category"])
    effect = NEW_EFFECT if replay.get("verdict_effect") == OLD_EFFECT else replay.get("verdict_effect")
    if replay.get("blames") == blames and effect == replay.get("verdict_effect"):
        return result, None
    return {**result, "replay": {**replay, "blames": blames, "verdict_effect": effect}}, "replay explanation"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("sqlite_path", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.apply:
        backup = args.sqlite_path.parent / "backups" / f"app-before-rederive-{time.strftime('%Y%m%d-%H%M%S')}.sqlite"
        backup.parent.mkdir(exist_ok=True)
        src, dst = sqlite3.connect(args.sqlite_path), sqlite3.connect(backup)
        src.backup(dst)
        dst.close(), src.close()
        print("backup:", backup)
    distractors = distractor_ids()
    db = sqlite3.connect(args.sqlite_path, timeout=30)
    counts: dict[str, int] = {}
    examples: list[str] = []
    runs_changed = 0
    for batch_id, pack_id, raw in db.execute("SELECT batch_id, pack_id, json FROM runs WHERE status = 'done'").fetchall():
        batch = json.loads(raw)
        changed = False
        for i, result in enumerate(batch.get("results", [])):
            new, what = update_result(result, distractors.get(pack_id or "", []))
            if what:
                kind = what.split(":")[0]
                counts[kind] = counts.get(kind, 0) + 1
                if kind == "cut-off answer" and len(examples) < 12:
                    examples.append(f"{batch_id} {result.get('test_id')}: {what}")
                if "category" in result:
                    new["category"] = new["root_cause"]["category"]
                batch["results"][i] = new
                changed = True
        if changed:
            runs_changed += 1
            breakdown: dict[str, int] = {}
            for r in batch["results"]:
                breakdown[r["root_cause"]["category"]] = breakdown.get(r["root_cause"]["category"], 0) + 1
            if "root_cause_breakdown" in batch:
                batch["root_cause_breakdown"] = {**{k: 0 for k in batch["root_cause_breakdown"]}, **breakdown}
            if args.apply:
                with db:
                    db.execute("UPDATE runs SET json = ? WHERE batch_id = ?", (json.dumps(batch), batch_id))
    print(json.dumps({"runs_changed": runs_changed, "results": counts, "applied": args.apply}, indent=1))
    for line in examples:
        print("  ", line)


if __name__ == "__main__":
    main()
