"""API tokens for CI (the release gate): create, list, revoke. A token is shown once, at creation."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..db import Database, User
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/tokens", tags=["tokens"])


class TokenRequest(BaseModel):
    name: str = Field(default="CI", min_length=1, max_length=60)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_token(body: TokenRequest, user: User = Depends(get_current_user), db: Database = Depends(get_db)) -> dict:
    """{id, name, prefix, created_at, token}: store `token` as a CI secret (RAGSEAL_TOKEN); it is not shown again."""
    if len(db.list_api_tokens(user.id)) >= 10:
        raise HTTPException(status.HTTP_409_CONFLICT, "at most 10 API tokens; revoke one first")
    return db.create_api_token(user.id, body.name)


@router.get("")
def list_tokens(user: User = Depends(get_current_user), db: Database = Depends(get_db)) -> list[dict]:
    return db.list_api_tokens(user.id)


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_token(token_id: str, user: User = Depends(get_current_user), db: Database = Depends(get_db)) -> None:
    if not db.delete_api_token(user.id, token_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"token {token_id} not found")
