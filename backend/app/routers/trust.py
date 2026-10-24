"""Evaluator-trust endpoints: human agreement (P3), confusion matrix (P4), stability (P5)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..db import Database, User
from ..deps import get_current_user, get_db
from ..trust import agreement

router = APIRouter(prefix="/trust", tags=["trust"])


@router.get("/agreement")
def get_agreement(pack_id: str | None = None, user: User = Depends(get_current_user), db: Database = Depends(get_db)) -> dict:
    labels = db.labels(pack_id)
    runs = {batch_id: run for batch_id in {l["batch_id"] for l in labels} if (run := db.run_by_id(batch_id))}
    return {"pack_id": pack_id, **agreement(labels, runs)}
