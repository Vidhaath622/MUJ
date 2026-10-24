from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..db import Database, User
from ..deps import get_current_user, get_db, get_jobs
from ..jobs import BatchJobs

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("")
def list_runs(user: User = Depends(get_current_user), db: Database = Depends(get_db)) -> list[dict]:
    return db.list_runs(user.id)


def _progress(batch_id: str, user: User, db: Database, jobs: BatchJobs) -> dict:
    job = jobs.get(user.id, batch_id)
    if job is not None:
        return job.to_dict()
    row = db.run_status(user.id, batch_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"run {batch_id} not found")
    # Finished before this process started (or synchronous): no live counters, but the outcome is known.
    total = row["total_evaluated"]
    done = total if row["status"] == "done" else 0
    return {
        "batch_id": batch_id, "status": row["status"], "done": done, "total": total, "failed": 0,
        "elapsed_ms": None, "eta_ms": 0 if row["status"] != "running" else None, "cases_per_min": None, "error": row["error"],
    }


@router.get("/{batch_id}/progress")
def run_progress(
    batch_id: str, user: User = Depends(get_current_user), db: Database = Depends(get_db), jobs: BatchJobs = Depends(get_jobs)
) -> dict:
    return _progress(batch_id, user, db, jobs)


@router.get("/{batch_id}")
def get_run(
    batch_id: str,
    response: Response,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    jobs: BatchJobs = Depends(get_jobs),
) -> dict:
    row = db.run_status(user.id, batch_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"run {batch_id} not found")
    if row["status"] == "running":
        response.status_code = status.HTTP_202_ACCEPTED
        return _progress(batch_id, user, db, jobs)
    if row["status"] == "failed":
        return {"batch_id": batch_id, "status": "failed", "error": row["error"]}
    return db.get_run(user.id, batch_id)
