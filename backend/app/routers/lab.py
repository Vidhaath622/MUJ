"""Chunking lab: which chunk size and retrieval setup finds a pack's gold passages best (retrieval only)."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field

from ..db import Database, User
from ..deps import get_current_user, get_db, get_engine, get_jobs
from ..engine_bridge import Engine
from ..jobs import BatchJobs
from .trust import analysis_response

router = APIRouter(prefix="/lab", tags=["lab"])


class ChunkingLabRequest(BaseModel):
    pack_id: str
    chunk_sizes: list[int] = Field(default=[300, 700, 1200], min_length=1, max_length=5)
    modes: list[Literal["dense", "hybrid"]] = Field(default=["dense", "hybrid"], min_length=1)
    rerank: list[bool] = Field(default=[False, True], min_length=1, description="rerank on costs one judge call per question")
    k: int = Field(default=4, ge=1, le=10)
    overlap: int = Field(default=0, ge=0, le=500)

    def sizes(self) -> tuple[int, ...]:
        return tuple(dict.fromkeys(min(max(s, 100), 4000) for s in self.chunk_sizes))


@router.post("/chunking", status_code=status.HTTP_202_ACCEPTED)
def start_chunking_lab(
    body: ChunkingLabRequest,
    user: User = Depends(get_current_user),
    engine: Engine = Depends(get_engine),
    db: Database = Depends(get_db),
    jobs: BatchJobs = Depends(get_jobs),
) -> dict:
    """Runs in the background: poll GET /api/lab/chunking/{lab_id} (202 with progress, then the table)."""
    engine.load_pack_summary(body.pack_id)  # 404 for an unknown pack before starting
    lab_id = "lab_" + uuid.uuid4().hex[:10]
    db.start_analysis(user.id, lab_id, "chunking_lab")
    configs = len(body.sizes()) * len(set(body.modes)) * len(set(body.rerank))
    jobs.submit(
        lab_id,
        user.id,
        configs,
        work=lambda report: engine.chunking_lab(
            user.id, body.pack_id, body.sizes(), tuple(dict.fromkeys(body.modes)), tuple(dict.fromkeys(body.rerank)),
            body.k, body.overlap, progress=report,
        ),
        on_done=lambda result: db.finish_analysis(lab_id, result),
        on_error=lambda error: db.fail_analysis(lab_id, error),
    )
    return {"lab_id": lab_id, "status": "running", "configs": configs}


@router.get("/chunking/{lab_id}")
def get_chunking_lab(
    lab_id: str,
    response: Response,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    jobs: BatchJobs = Depends(get_jobs),
) -> dict:
    if lab_id == "latest":
        lab_id = db.latest_analysis(user.id, "chunking_lab")
        if lab_id is None:
            return {"lab_id": None, "status": "none"}
    return analysis_response(response, db.get_analysis(user.id, lab_id, "chunking_lab"), jobs, user, "lab_id")
