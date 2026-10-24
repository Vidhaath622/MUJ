"""Change impact radar (USP-3): what updating a document breaks for users today."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from ..db import Database, User
from ..deps import get_current_user, get_db, get_engine, get_jobs
from ..engine_bridge import Engine
from ..jobs import BatchJobs
from .trust import analysis_response

router = APIRouter(prefix="/impact", tags=["impact"])


class ImpactRequest(BaseModel):
    old_document_id: str
    new_document_id: str
    max_tests: int = Field(default=10, ge=1, le=20)


@router.post("", status_code=status.HTTP_202_ACCEPTED)
def start_impact(
    body: ImpactRequest,
    user: User = Depends(get_current_user),
    engine: Engine = Depends(get_engine),
    db: Database = Depends(get_db),
    jobs: BatchJobs = Depends(get_jobs),
) -> dict:
    if body.old_document_id == body.new_document_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "old and new document must differ")
    owned = {d["document_id"] for d in engine.list_documents(user.id)}
    if missing := [d for d in (body.old_document_id, body.new_document_id) if d not in owned]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"documents not found: {', '.join(missing)}")
    impact_id = "imp_" + uuid.uuid4().hex[:10]
    db.start_analysis(user.id, impact_id, "impact")
    jobs.submit(
        impact_id,
        user.id,
        body.max_tests,
        work=lambda report: engine.impact(user.id, body.old_document_id, body.new_document_id, body.max_tests, progress=report),
        on_done=lambda result: db.finish_analysis(impact_id, result),
        on_error=lambda error: db.fail_analysis(impact_id, error),
    )
    return {"impact_id": impact_id, "status": "running"}


@router.get("/{impact_id}")
def get_impact(
    impact_id: str,
    response: Response,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    jobs: BatchJobs = Depends(get_jobs),
) -> dict:
    if impact_id == "latest":
        impact_id = db.latest_analysis(user.id, "impact")
        if impact_id is None:
            return {"impact_id": None, "status": "none"}
    return analysis_response(response, db.get_analysis(user.id, impact_id, "impact"), jobs, user, "impact_id")
