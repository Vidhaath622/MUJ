from fastapi import APIRouter, Depends, HTTPException, status

from ..db import Database, User
from ..deps import get_current_user, get_db, get_engine
from ..engine_bridge import Engine
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
    result = engine.evaluate_query(
        user.id,
        body.query,
        require_document_ids(body),
        ground_truth=body.optional_ground_truth,
        manual_answer=body.optional_manual_answer,
        gold_chunk_ids=body.gold_chunk_ids,
        case_type=body.type,
    )
    db.save_evaluation(user.id, result)
    return result


@router.post("/batch")
def evaluate_batch(
    body: EvaluateBatchRequest,
    user: User = Depends(get_current_user),
    engine: Engine = Depends(get_engine),
    db: Database = Depends(get_db),
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
    result = engine.evaluate_batch(user.id, document_ids, test_cases, pack_id=body.pack_id)
    db.save_run(user.id, result)
    return result
