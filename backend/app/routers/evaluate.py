import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..db import Database, User
from ..deps import get_current_user, get_db, get_engine, get_jobs
from ..engine_bridge import Engine
from ..jobs import BatchJobs
from ..schemas import EvaluateBatchRequest, EvaluateQueryRequest
from .common import require_document_ids

router = APIRouter(prefix="/evaluate", tags=["evaluate"])


@router.post("/query")
def evaluate_query(
    body: EvaluateQueryRequest,
    user: User = Depends(get_current_user),
    engine: Engine = Depends(get_engine),
    db: Database = Depends(get_db),
) -> dict:
    document_ids = body.ids()
    case: dict = {}
    if body.pack_id:
        pack = engine.load_pack(user.id, body.pack_id)
        document_ids = list(dict.fromkeys([*pack["document_ids"], *document_ids]))
        if body.test_id:
            case = next((c for c in pack["test_cases"] if c["test_id"] == body.test_id), None)
            if case is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"test case {body.test_id} not found in pack {body.pack_id}")
    if not document_ids:
        document_ids = require_document_ids(body)
    # Fields the client sent win; the pack fills in what it left out.
    result = engine.evaluate_query(
        user.id,
        body.query,
        document_ids,
        ground_truth=body.optional_ground_truth or case.get("ground_truth_answer"),
        manual_answer=body.optional_manual_answer,
        gold_chunk_ids=body.gold_chunk_ids or case.get("gold_chunk_ids"),
        case_type=body.type if "type" in body.model_fields_set else case.get("type", body.type),
        stale_chunk_ids=body.stale_chunk_ids or case.get("stale_chunk_ids"),
        test_id=body.test_id,
    )
    db.save_evaluation(user.id, result)
    return result


@router.post("/batch")
def evaluate_batch(
    body: EvaluateBatchRequest,
    response: Response,
    user: User = Depends(get_current_user),
    engine: Engine = Depends(get_engine),
    db: Database = Depends(get_db),
    jobs: BatchJobs = Depends(get_jobs),
) -> dict:
    document_ids = body.ids()
    test_cases = [case.model_dump(exclude_none=True) for case in body.test_cases]
    if body.pack_id:
        # Loading is idempotent: documents already embedded for this user are skipped.
        pack = engine.load_pack(user.id, body.pack_id)
        # A pack run searches all of the pack's documents, whatever single document_id the client sent.
        document_ids = list(dict.fromkeys([*pack["document_ids"], *document_ids]))
        if not test_cases:
            test_cases = pack["test_cases"]
        else:
            # Restore trap metadata (gold/stale chunks, type) that the client may have dropped.
            by_id = {case["test_id"]: case for case in pack["test_cases"]}
            test_cases = [{**by_id.get(case.get("test_id"), {}), **case} for case in test_cases]
    if not document_ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "document_id, document_ids or pack_id is required")
    if not test_cases:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "test_cases is empty")

    if not body.run_async:
        result = engine.evaluate_batch(user.id, document_ids, test_cases, pack_id=body.pack_id, concurrency=body.concurrency)
        db.save_run(user.id, result)
        return result

    batch_id = "batch_" + uuid.uuid4().hex[:10]
    created_at = db.start_run(user.id, batch_id, body.pack_id, len(test_cases))
    jobs.submit(
        batch_id,
        user.id,
        len(test_cases),
        work=lambda report: engine.evaluate_batch(
            user.id, document_ids, test_cases, pack_id=body.pack_id, progress=report, batch_id=batch_id, concurrency=body.concurrency
        ),
        on_done=lambda result: db.save_run(user.id, {**result, "created_at": created_at}),
        on_error=lambda error: db.fail_run(batch_id, error),
    )
    response.status_code = status.HTTP_202_ACCEPTED
    return {"batch_id": batch_id, "status": "running", "total": len(test_cases), "pack_id": body.pack_id, "created_at": created_at}
