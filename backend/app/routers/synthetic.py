from fastapi import APIRouter, Depends

from ..db import User
from ..deps import get_current_user, get_engine
from ..engine_bridge import Engine
from ..schemas import SyntheticRequest
from ..settings import MAX_SYNTHETIC_COUNT

router = APIRouter(prefix="/synthetic", tags=["synthetic"])


@router.post("/generate")
def generate(body: SyntheticRequest, user: User = Depends(get_current_user), engine: Engine = Depends(get_engine)) -> dict:
    count = min(body.count, MAX_SYNTHETIC_COUNT)
    return engine.synthetic(user.id, body.document_id, count=count, include_traps=body.include_traps)
