"""Version comparison (P6): run a candidate RAG profile on the same questions as the baseline."""

from __future__ import annotations

import threading
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from ..db import Database, User
from ..deps import get_current_user, get_db, get_engine, get_jobs
from ..engine_bridge import Engine
from ..jobs import BatchJobs
from .trust import analysis_response

router = APIRouter(tags=["compare"])


@router.get("/rag/profiles")
def list_profiles(user: User = Depends(get_current_user), engine: Engine = Depends(get_engine)) -> list[dict]:
    return engine.profiles()


class CompareRequest(BaseModel):
    pack_ids: list[str] = Field(min_length=1)
    base: str = "v1"
    candidate: str = "v2"
    rerun_base: bool = False


def _latest_profile_run(db: Database, user_id: str, pack_id: str, profile: str) -> dict | None:
    for item in db.list_runs(user_id):
        if item["pack_id"] != pack_id or item["status"] != "done":
            continue
        run = db.get_run(user_id, item["batch_id"])
        # Runs from before profiles existed used the v1 settings.
        if run.get("profile", "v1") == profile and not run.get("kind"):
            return run
    return None


@router.post("/compare", status_code=status.HTTP_202_ACCEPTED)
def start_compare(
    body: CompareRequest,
    user: User = Depends(get_current_user),
    engine: Engine = Depends(get_engine),
    db: Database = Depends(get_db),
    jobs: BatchJobs = Depends(get_jobs),
) -> dict:
    profiles = {p["id"] for p in engine.profiles()}
    if body.base not in profiles or body.candidate not in profiles:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown profile; available: {', '.join(sorted(profiles))}")
    packs = {p["pack_id"]: p for p in engine.list_packs()}
    if unknown := [p for p in body.pack_ids if p not in packs]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown pack: {', '.join(unknown)}")

    compare_id = "cmp_" + uuid.uuid4().hex[:10]
    db.start_analysis(user.id, compare_id, "compare")
    base_runs = {p: None if body.rerun_base else _latest_profile_run(db, user.id, p, body.base) for p in body.pack_ids}
    total = sum(packs[p]["test_case_count"] * (1 + (base_runs[p] is None)) for p in body.pack_ids)
    lock = threading.Lock()
    finished = {"done": 0, "failed": 0}

    def work(report):
        def run(pack_id: str, profile: str) -> dict:
            offset = dict(finished)

            def step(done, _total, failed):
                report(offset["done"] + done, total, offset["failed"] + failed)

            result = engine.run_profile(user.id, pack_id, profile, progress=step, batch_id="batch_" + uuid.uuid4().hex[:10])
            with lock:
                finished["done"] += result["total_evaluated"]
                finished["failed"] += result.get("failed_cases", 0)
            db.save_run(user.id, result)
            return result

        base_results, cand_results, runs = [], [], {}
        for pack_id in body.pack_ids:
            base = base_runs[pack_id] or run(pack_id, body.base)
            cand = run(pack_id, body.candidate)
            runs[pack_id] = {"base_batch_id": base["batch_id"], "candidate_batch_id": cand["batch_id"]}
            base_results += [dict(r, pack_id=pack_id) for r in base["results"]]
            cand_results += [dict(r, pack_id=pack_id) for r in cand["results"]]
        return {**engine.compare(base_results, cand_results, body.base, body.candidate), "pack_ids": body.pack_ids, "runs": runs}

    jobs.submit(compare_id, user.id, total, work=work,
                on_done=lambda result: db.finish_analysis(compare_id, result),
                on_error=lambda error: db.fail_analysis(compare_id, error))
    return {"compare_id": compare_id, "status": "running", "base": body.base, "candidate": body.candidate,
            "pack_ids": body.pack_ids, "total": total, "reused_base_runs": [p for p, r in base_runs.items() if r]}


@router.get("/compare/{compare_id}")
def get_compare(
    compare_id: str,
    response: Response,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    jobs: BatchJobs = Depends(get_jobs),
) -> dict:
    if compare_id == "latest":
        compare_id = db.latest_analysis(user.id, "compare")
        if compare_id is None:
            return {"compare_id": None, "status": "none"}
    return analysis_response(response, db.get_analysis(user.id, compare_id, "compare"), jobs, user, "compare_id")
