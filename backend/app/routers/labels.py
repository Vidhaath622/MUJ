"""Human labelling: a queue of answers from one pack run, and label submission.

The queue hides the pipeline's verdict and scores so they cannot anchor the labeller.
Every labeller of a pack works on the same run (the one that already holds the most
labels), so double labels compare the same answers.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..db import Database, User
from ..deps import get_current_user, get_db, get_engine
from ..engine_bridge import Engine

router = APIRouter(prefix="/labels", tags=["labels"])

# Same names as root_cause.failure_type (P4), so human and pipeline types can be compared.
FAILURE_TYPES = [
    "WRONG_CHUNK",
    "STALE_SOURCE",
    "DISTRACTOR_CONFUSION",
    "IGNORED_CONTEXT",
    "HALLUCINATION",
    "REASONING_ERROR",
    "UNANSWERABLE_ANSWERED",
    "FALSE_ABSTENTION",
]


class LabelIn(BaseModel):
    test_id: str
    batch_id: str
    labeler: str = Field(min_length=1, max_length=40)
    correct: bool
    failure_type: str | None = None
    note: str | None = Field(default=None, max_length=2000)


def _labelling_run(db: Database, engine: Engine, pack_id: str) -> tuple[dict | None, str | None, dict]:
    """(run to label, run of the right size still in progress, pack) for a pack.

    Locked packs always use their locked run. Otherwise the newest finished run whose size
    equals the pack's current case count, so a run of an older, smaller pack never qualifies.
    """
    pack = engine.load_pack_summary(pack_id)
    locked = db.label_lock(pack_id)
    if locked:
        return db.run_by_id(locked), None, pack
    run, running = db.labelling_candidate(pack_id, pack["test_case_count"])
    return run, running, pack


@router.get("/queue")
def label_queue(
    pack_id: str,
    labeler: str,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    engine: Engine = Depends(get_engine),
) -> dict:
    run, running, pack = _labelling_run(db, engine, pack_id)
    if run is None:
        message = (
            f"The {pack['test_case_count']}-case run of pack {pack_id} is still in progress."
            if running
            else f"No finished {pack['test_case_count']}-case run of pack {pack_id} yet: run the pack first."
        )
        return {"items": [], "labeled": 0, "total": 0, "batch_id": None, "running_batch_id": running,
                "failure_types": FAILURE_TYPES, "message": message}
    filenames = pack.get("filenames", {})
    mine = {l["test_id"] for l in db.labels(pack_id) if l["batch_id"] == run["batch_id"] and l["labeler"] == labeler}
    items = []
    for result in run.get("results", []):
        if result.get("error"):
            continue  # nothing was answered, so there is nothing to label
        items.append(
            {
                "test_id": result["test_id"],
                "batch_id": run["batch_id"],
                "pack_id": pack_id,
                "question": result["query"],
                "ground_truth": result.get("ground_truth"),
                "expected_abstain": result.get("expected_abstain", False),
                "generated_answer": result["generated_answer"],
                "retrieved_chunks": [
                    {"chunk_id": c["chunk_id"], "document_id": c.get("document_id"),
                     "filename": filenames.get(c.get("document_id")), "text": c["text"]}
                    for c in result.get("retrieved_chunks", [])
                ],
                "labeled": result["test_id"] in mine,
            }
        )
    # Unlabelled first, in pack order.
    items.sort(key=lambda item: item["labeled"])
    return {"items": items, "labeled": len(mine), "total": len(items), "batch_id": run["batch_id"],
            "locked": db.label_lock(pack_id) == run["batch_id"], "failure_types": FAILURE_TYPES}


@router.post("", status_code=status.HTTP_201_CREATED)
def submit_label(body: LabelIn, user: User = Depends(get_current_user), db: Database = Depends(get_db)) -> dict:
    run = db.run_by_id(body.batch_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"run {body.batch_id} not found")
    result = next((r for r in run.get("results", []) if r["test_id"] == body.test_id), None)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"test case {body.test_id} is not in run {body.batch_id}")
    if body.failure_type is not None and body.failure_type not in FAILURE_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"failure_type must be one of {', '.join(FAILURE_TYPES)}")
    if body.correct and body.failure_type:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "a correct answer has no failure_type")
    pack_id = run.get("pack_id")
    if pack_id and db.lock_labels(pack_id, body.batch_id) != body.batch_id:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"pack {pack_id} is being labelled on run {db.label_lock(pack_id)}, not {body.batch_id}"
        )
    db.save_label(
        user.id,
        {**body.model_dump(), "pack_id": pack_id, "question": result["query"], "answer": result["generated_answer"]},
    )
    return {"ok": True, "test_id": body.test_id, "batch_id": body.batch_id, "labeler": body.labeler}


@router.get("/disagreements")
def label_disagreements(
    pack_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> dict:
    """Items two labellers judged differently on correct/incorrect, with both labels, for adjudication."""
    by_item: dict[tuple[str, str], dict[str, dict]] = {}
    for label in db.labels(pack_id):
        by_item.setdefault((label["batch_id"], label["test_id"]), {})[label["labeler"]] = label
    runs: dict[str, dict | None] = {}
    items = []
    for (batch_id, test_id), votes in sorted(by_item.items()):
        if len(votes) < 2 or len({v["correct"] for v in votes.values()}) < 2:
            continue
        if batch_id not in runs:
            runs[batch_id] = db.run_by_id(batch_id)
        result = next((r for r in (runs[batch_id] or {}).get("results", []) if r["test_id"] == test_id), None)
        if result is None:
            continue
        items.append({
            "test_id": test_id,
            "batch_id": batch_id,
            "pack_id": (runs[batch_id] or {}).get("pack_id"),
            "question": result["query"],
            "ground_truth": result.get("ground_truth"),
            "expected_abstain": result.get("expected_abstain", False),
            "generated_answer": result["generated_answer"],
            "retrieved_chunks": [{"chunk_id": c["chunk_id"], "document_id": c.get("document_id"), "filename": c.get("filename"), "text": c["text"]}
                                 for c in result.get("retrieved_chunks", [])],
            "labels": {name: {"correct": v["correct"], "failure_type": v.get("failure_type"), "note": v.get("note")} for name, v in votes.items()},
        })
    return {"items": items, "total": len(items)}
