from fastapi import APIRouter, Depends

from ..db import User
from ..deps import get_current_user, get_engine
from ..engine_bridge import Engine

router = APIRouter(prefix="/packs", tags=["packs"])


@router.get("")
def list_packs(_: User = Depends(get_current_user), engine: Engine = Depends(get_engine)) -> list[dict]:
    return engine.list_packs()


@router.post("/{pack_id}/load")
def load_pack(pack_id: str, user: User = Depends(get_current_user), engine: Engine = Depends(get_engine)) -> dict:
    return engine.load_pack(user.id, pack_id)
