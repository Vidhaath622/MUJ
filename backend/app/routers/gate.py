"""Release gate: run a pack (or take a finished run) and say pass/fail against a bar, for CI."""

from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from ..db import Database, User
from ..deps import get_current_user, get_db, get_engine, get_jobs, request_hosts
from ..engine_bridge import Engine
from ..gate import verdict
from ..jobs import BatchJobs
from ..schemas import BotConfigIn
from .trust import analysis_response

router = APIRouter(prefix="/gate", tags=["gate"])


class GateRequest(BaseModel):
    pack_id: str
    bot: BotConfigIn | None = None
    min_pass_rate: float = Field(default=0.8, ge=0, le=1)
    max_new_failures: int = Field(default=0, ge=0)
    baseline_batch_id: str | None = Field(default=None, description="default: your previous finished run of this pack")
    batch_id: str | None = Field(default=None, description="gate this finished run instead of running the pack")
    concurrency: int | None = Field(default=None, ge=1, le=16)


def _report_url(request: Request, batch_id: str) -> str:
    public = (os.environ.get("RAGSEAL_PUBLIC_URL") or "").split(",")[0].strip().rstrip("/")
    if public and "://" not in public:
        public = "https://" + public
    return f"{public or str(request.base_url).rstrip('/')}/#/runs?batch={batch_id}"


def _finished_run(db: Database, user: User, batch_id: str, what: str) -> dict:
    row = db.run_status(user.id, batch_id)
    if row is None or row["status"] != "done":
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{what} {batch_id} is not a finished run of yours")
    return db.get_run(user.id, batch_id)


@router.post("")
def start_gate(
    body: GateRequest,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    engine: Engine = Depends(get_engine),
    db: Database = Depends(get_db),
    jobs: BatchJobs = Depends(get_jobs),
) -> dict:
    """With batch_id: the verdict at once (200). Otherwise the pack runs in the background (202):
    poll GET /api/gate/{gate_id} until status is "done"."""
    baseline_id = body.baseline_batch_id
    if baseline_id is None:
        # The previous finished run of the pack: before the gated run when one is given, else the latest.
        runs = [r for r in db.list_runs(user.id) if r["pack_id"] == body.pack_id and r["status"] == "done"]  # newest first
        if body.batch_id:
            ids = [r["batch_id"] for r in runs]
            runs = runs[ids.index(body.batch_id) + 1 :] if body.batch_id in ids else []
        baseline_id = runs[0]["batch_id"] if runs else None
    baseline = _finished_run(db, user, baseline_id, "baseline") if baseline_id else None
    gate_id = "gate_" + uuid.uuid4().hex[:10]

    if body.batch_id:
        run = _finished_run(db, user, body.batch_id, "run")
        if run.get("pack_id") != body.pack_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"run {body.batch_id} is of pack {run.get('pack_id')}, not {body.pack_id}")
        result = verdict(run, baseline, body.min_pass_rate, body.max_new_failures, _report_url(request, body.batch_id))
        db.start_analysis(user.id, gate_id, "gate")
        db.finish_analysis(gate_id, result)
        return {"gate_id": gate_id, "status": "done", **result}

    pack = engine.load_pack(user.id, body.pack_id)
    batch_id = "batch_" + uuid.uuid4().hex[:10]
    created_at = db.start_run(user.id, batch_id, body.pack_id, len(pack["test_cases"]))
    db.start_analysis(user.id, gate_id, "gate")
    bot = {"bot": body.bot.model_dump(), "self_hosts": request_hosts(request)} if body.bot else {}
    report_url = _report_url(request, batch_id)

    def done(result: dict) -> None:
        db.save_run(user.id, {**result, "created_at": created_at})
        db.finish_analysis(gate_id, verdict(result, baseline, body.min_pass_rate, body.max_new_failures, report_url))

    def failed(error: str) -> None:
        db.fail_run(batch_id, error)
        db.fail_analysis(gate_id, error)

    jobs.submit(
        gate_id,
        user.id,
        len(pack["test_cases"]),
        work=lambda report: engine.evaluate_batch(
            user.id, pack["document_ids"], pack["test_cases"], pack_id=body.pack_id, progress=report, batch_id=batch_id,
            concurrency=body.concurrency, **bot,
        ),
        on_done=done,
        on_error=failed,
    )
    response.status_code = status.HTTP_202_ACCEPTED
    return {"gate_id": gate_id, "status": "running", "batch_id": batch_id, "baseline_batch_id": baseline_id,
            "total": len(pack["test_cases"]), "poll": f"/api/gate/{gate_id}", "report_url": report_url}


@router.get("/{gate_id}")
def get_gate(
    gate_id: str, response: Response, user: User = Depends(get_current_user), db: Database = Depends(get_db), jobs: BatchJobs = Depends(get_jobs)
) -> dict:
    """202 with progress while the pack runs; then the verdict: {pass, reasons, pass_rate, new_failures, fixed, ...}."""
    return analysis_response(response, db.get_analysis(user.id, gate_id, "gate"), jobs, user, "gate_id")
