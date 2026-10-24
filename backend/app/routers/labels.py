"""Human labelling: a queue of answers from one pack run, and label submission.

The queue hides the pipeline's verdict and scores so they cannot anchor the labeller.
Every labeller of a pack works on the same run (the one that already holds the most
labels), so double labels compare the same answers.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..db import Database, User
from ..deps import get_current_user, get_db

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


def _labelling_run(db: Database, user: User, pack_id: str) -> dict | None:
    batch_id = db.labelling_batch(pack_id)
    run = db.run_by_id(batch_id) if batch_id else None
    return run or db.latest_done_run(user.id, pack_id)


@router.get("/queue")
def label_queue(pack_id: str, labeler: str, user: User = Depends(get_current_user), db: Database = Depends(get_db)) -> dict:
    run = _labelling_run(db, user, pack_id)
    if run is None:
        return {"items": [], "labeled": 0, "total": 0, "batch_id": None, "failure_types": FAILURE_TYPES,
                "message": f"No finished run for pack {pack_id} yet: run the pack first."}
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
                    {"chunk_id": c["chunk_id"], "document_id": c.get("document_id"), "text": c["text"]}
                    for c in result.get("retrieved_chunks", [])
                ],
                "labeled": result["test_id"] in mine,
            }
        )
    # Unlabelled first, in pack order.
    items.sort(key=lambda item: item["labeled"])
    return {"items": items, "labeled": len(mine), "total": len(items), "batch_id": run["batch_id"], "failure_types": FAILURE_TYPES}


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
    db.save_label(
        user.id,
        {**body.model_dump(), "pack_id": run.get("pack_id"), "question": result["query"], "answer": result["generated_answer"]},
    )
    return {"ok": True, "test_id": body.test_id, "batch_id": body.batch_id, "labeler": body.labeler}
