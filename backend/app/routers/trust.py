"""Evaluator-trust endpoints: human agreement (P3), fault-injection confusion matrix (P4), stability (P5)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from ..db import Database, User
from ..deps import get_current_user, get_db, get_engine, get_jobs
from ..engine_bridge import Engine
from ..jobs import BatchJobs
from ..trust import agreement

router = APIRouter(prefix="/trust", tags=["trust"])

INJECTION_PACK = "injection"


@router.get("/agreement")
def get_agreement(pack_id: str | None = None, user: User = Depends(get_current_user), db: Database = Depends(get_db)) -> dict:
    labels = db.labels(pack_id)
    runs = {batch_id: run for batch_id in {l["batch_id"] for l in labels} if (run := db.run_by_id(batch_id))}
    return {"pack_id": pack_id, **agreement(labels, runs)}


class InjectionRequest(BaseModel):
    pack_id: str | None = None
    pack_ids: list[str] | None = None
    n_per_type: int = Field(default=5, ge=1, le=20)


@router.post("/injection-run", status_code=status.HTTP_202_ACCEPTED)
def start_injection_run(
    body: InjectionRequest,
    user: User = Depends(get_current_user),
    engine: Engine = Depends(get_engine),
    db: Database = Depends(get_db),
    jobs: BatchJobs = Depends(get_jobs),
) -> dict:
    pack_ids = body.pack_ids or ([body.pack_id] if body.pack_id else None)
    known = {p["pack_id"] for p in engine.list_packs()}
    if pack_ids and (unknown := [p for p in pack_ids if p not in known]):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown pack: {', '.join(unknown)}")
    run_id = "batch_" + uuid.uuid4().hex[:10]
    # The case count is only known once the faults are built; progress reports it as soon as it is.
    created_at = db.start_run(user.id, run_id, INJECTION_PACK, 0)
    jobs.submit(
        run_id,
        user.id,
        0,
        work=lambda report: engine.injection_run(user.id, pack_ids, body.n_per_type, progress=report, batch_id=run_id),
        on_done=lambda result: db.save_run(user.id, {**result, "pack_id": INJECTION_PACK, "created_at": created_at}),
        on_error=lambda error: db.fail_run(run_id, error),
    )
    return {"run_id": run_id, "batch_id": run_id, "status": "running", "created_at": created_at, "n_per_type": body.n_per_type}


@router.get("/confusion")
def get_confusion(
    response: Response,
    run_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    jobs: BatchJobs = Depends(get_jobs),
) -> dict:
    if run_id is None:
        latest = next((r for r in db.list_runs(user.id) if r["pack_id"] == INJECTION_PACK and r["status"] != "failed"), None)
        if latest is None:
            return {"run_id": None, "labels": [], "matrix": [], "per_class": {}, "accuracy": None, "n": 0,
                    "message": "No fault-injection run yet: POST /api/trust/injection-run."}
        run_id = latest["batch_id"]
    row = db.run_status(user.id, run_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"run {run_id} not found")
    if row["status"] == "running":
        response.status_code = status.HTTP_202_ACCEPTED
        job = jobs.get(user.id, run_id)
        return {"run_id": run_id, "status": "running", "progress": job.to_dict() if job else None}
    if row["status"] == "failed":
        return {"run_id": run_id, "status": "failed", "error": row["error"]}
    run = db.get_run(user.id, run_id)
    if "confusion" not in run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"run {run_id} is not a fault-injection run")
    return {
        "run_id": run_id,
        "status": "done",
        "created_at": run.get("created_at"),
        **run["confusion"],
        "n_per_type": run.get("n_per_type"),
        "injected_packs": run.get("injected_packs"),
        "judge_model": run.get("judge_model"),
        "judge_fallback_cases": run.get("judge_fallback_cases"),
        "timing": run.get("timing"),
        "cases": [
            {"test_id": r["test_id"], "question": r["query"], "true_failure_type": r.get("true_failure_type"),
             "predicted_failure_type": r["root_cause"].get("failure_type"), "category": r["root_cause"]["category"],
             "stage": r["root_cause"].get("stage"), "answer": r["generated_answer"]}
            for r in run.get("results", [])
        ],
    }
