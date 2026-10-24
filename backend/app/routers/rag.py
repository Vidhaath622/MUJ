from fastapi import APIRouter, Depends

from ..db import User
from ..deps import get_current_user, get_engine
from ..engine_bridge import Engine
from ..schemas import AskRequest
from .common import require_document_ids

router = APIRouter(prefix="/rag", tags=["rag"])


@router.post("/ask")
def ask(body: AskRequest, user: User = Depends(get_current_user), engine: Engine = Depends(get_engine)) -> dict:
    return engine.ask(user.id, body.query, require_document_ids(body), body.k)
