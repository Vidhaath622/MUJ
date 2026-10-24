from fastapi import APIRouter, Depends, HTTPException, status

from ..db import Database, User
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("")
def list_runs(user: User = Depends(get_current_user), db: Database = Depends(get_db)) -> list[dict]:
    return db.list_runs(user.id)


@router.get("/{batch_id}")
def get_run(batch_id: str, user: User = Depends(get_current_user), db: Database = Depends(get_db)) -> dict:
    run = db.get_run(user.id, batch_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"run {batch_id} not found")
    return run
