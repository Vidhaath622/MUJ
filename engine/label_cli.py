"""Hand-label answers from a batch run, for judge-vs-human agreement.

    python -m engine.label_cli run.json engine/packs_builtin/banking/labels.json --labeller SR

run.json is a batch response (save it from GET /api/runs/{batch_id}). For each
result you see the question, ground truth, retrieved context and answer, and
press c (correct), i (incorrect), s (skip) or q (quit). Labels are appended to
labels.json in the format engine/agreement.py reads; already-labelled answers are skipped.
The judge's own score is hidden while you label, so it cannot anchor you.
"""

from __future__ import annotations

import argparse
import json
import textwrap
from pathlib import Path


def _wrap(text: str, indent: str = "    ") -> str:
    return textwrap.fill(text or "(empty)", width=100, initial_indent=indent, subsequent_indent=indent)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run", type=Path, help="batch response JSON")
    parser.add_argument("labels", type=Path, help="labels.json to append to")
    parser.add_argument("--labeller", required=True, help="your initials, stored with each label")
    args = parser.parse_args()

    run = json.loads(args.run.read_text())
    labels = json.loads(args.labels.read_text()) if args.labels.exists() else []
    done = {(item["test_id"], item["answer"]) for item in labels}
    pack_id = run.get("pack_id")

    todo = [r for r in run["results"] if (r.get("test_id"), r["generated_answer"]) not in done]
    print(f"{len(todo)} answers to label ({len(labels)} labels already in {args.labels}).\n")
    for n, result in enumerate(todo, start=1):
        print(f"[{n}/{len(todo)}] {result.get('test_id')}  ({result.get('case_type', 'factoid')})")
        print("  Question:")
        print(_wrap(result["query"]))
        print("  Ground truth:")
        print(_wrap(result.get("ground_truth") or "(none: the correct behaviour is to abstain)"))
        print("  Retrieved context:")
        for chunk in result.get("retrieved_chunks", [])[:4]:
            print(_wrap(chunk["text"][:400], "    | "))
        print("  Answer:")
        print(_wrap(result["generated_answer"]))
        while True:
            key = input("  correct / incorrect / skip / quit [c/i/s/q]: ").strip().lower()
            if key in ("c", "i", "s", "q"):
                break
        if key == "q":
            break
        if key == "s":
            continue
        labels.append(
            {
                "test_id": result.get("test_id"),
                "pack_id": pack_id,
                "type": result.get("case_type", "factoid"),
                "question": result["query"],
                "ground_truth": result.get("ground_truth") or "",
                "answer": result["generated_answer"],
                "label": "correct" if key == "c" else "incorrect",
                "labeller": args.labeller,
            }
        )
        args.labels.write_text(json.dumps(labels, indent=2) + "\n")
        print()
    print(f"Saved {len(labels)} labels to {args.labels}.")


if __name__ == "__main__":
    main()
