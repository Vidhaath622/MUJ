from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..db import Database, User
from ..deps import get_current_user, get_db, get_engine, get_jobs, get_showcase
from ..engine_bridge import Engine
from ..jobs import BatchJobs
from ..showcase import Showcase

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("")
def list_runs(
    samples: bool = True,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    showcase: Showcase = Depends(get_showcase),
) -> list[dict]:
    """The user's runs (sample=false), plus a read-only sample run (sample=true) for each pack they
    have not run yet. samples=false lists only the user's own runs."""
    own = db.list_runs(user.id)
    return showcase.runs_for(user, own) if samples else [{**run, "sample": False} for run in own]


@router.get("/samples")
def list_samples(user: User = Depends(get_current_user), showcase: Showcase = Depends(get_showcase)) -> list[dict]:
    """Every sample run: the demo account's latest baseline run of each pack, read-only."""
    return showcase.samples(user)


def _progress(batch_id: str, user: User, db: Database, jobs: BatchJobs, showcase: Showcase) -> dict:
    job = jobs.get(user.id, batch_id)
    if job is not None:
        return job.to_dict()
    row = db.run_status(user.id, batch_id)
    if row is None and (sample := showcase.run(user, batch_id)) is not None:
        row = {"status": "done", "total_evaluated": sample.get("total_evaluated", 0), "error": None}
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
    batch_id: str,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    jobs: BatchJobs = Depends(get_jobs),
    showcase: Showcase = Depends(get_showcase),
) -> dict:
    return _progress(batch_id, user, db, jobs, showcase)


@router.get("/{batch_id}")
def get_run(
    batch_id: str,
    response: Response,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    jobs: BatchJobs = Depends(get_jobs),
    showcase: Showcase = Depends(get_showcase),
) -> dict:
    row = db.run_status(user.id, batch_id)
    if row is None:
        sample = showcase.run(user, batch_id)
        if sample is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"run {batch_id} not found")
        return sample
    if row["status"] == "running":
        response.status_code = status.HTTP_202_ACCEPTED
        return _progress(batch_id, user, db, jobs, showcase)
    if row["status"] == "failed":
        return {"batch_id": batch_id, "status": "failed", "error": row["error"], "sample": False}
    return {**db.get_run(user.id, batch_id), "status": "done", "sample": False}


@router.post("/{batch_id}/rejudge", status_code=status.HTTP_202_ACCEPTED)
def rejudge_run(
    batch_id: str,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    engine: Engine = Depends(get_engine),
    jobs: BatchJobs = Depends(get_jobs),
    showcase: Showcase = Depends(get_showcase),
) -> dict:
    """Re-score a finished run with the primary judge only; the run keeps its id, so labels stay attached."""
    row = db.run_status(user.id, batch_id)
    if row is None and showcase.run(user, batch_id) is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "sample runs are read-only; run the pack to get your own")
    if row is None or row["status"] != "done":
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"finished run {batch_id} not found")
    job_id = f"{batch_id}:rejudge"
    current = jobs.get(user.id, job_id)
    if current is not None and current.status == "running":
        raise HTTPException(status.HTTP_409_CONFLICT, f"run {batch_id} is already being re-judged")
    batch = db.get_run(user.id, batch_id)
    jobs.submit(
        job_id,
        user.id,
        batch.get("total_evaluated", 0),
        work=lambda report: engine.rejudge(user.id, batch, progress=report),
        on_done=lambda result: db.save_run(user.id, result),
        on_error=lambda error: None,  # the original result stays in place
    )
    return {"job_id": job_id, "batch_id": batch_id, "status": "running"}


@router.get("/{batch_id}/rejudge")
def rejudge_progress(batch_id: str, user: User = Depends(get_current_user), jobs: BatchJobs = Depends(get_jobs)) -> dict:
    job = jobs.get(user.id, f"{batch_id}:rejudge")
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no re-judge of {batch_id} in this server session")
    return job.to_dict()
