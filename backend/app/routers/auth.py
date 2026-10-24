from fastapi import APIRouter, Depends, HTTPException, status

from ..db import Database, User
from ..deps import get_current_user, get_db, get_settings
from ..schemas import LoginRequest, RegisterRequest
from ..security import create_token, hash_password, verify_password
from ..settings import AppSettings

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(user: User, settings: AppSettings) -> dict:
    return {
        "access_token": create_token(user.id, settings.jwt_secret, settings.token_ttl_hours),
        "token_type": "bearer",
        "user": user.public(),
    }


@router.post("/register")
def register(
    body: RegisterRequest,
    db: Database = Depends(get_db),
    settings: AppSettings = Depends(get_settings),
) -> dict:
    if db.user_by_email(body.email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = db.create_user(body.email, hash_password(body.password))
    return _token_response(user, settings)


@router.post("/login")
def login(
    body: LoginRequest,
    db: Database = Depends(get_db),
    settings: AppSettings = Depends(get_settings),
) -> dict:
    found = db.user_by_email(body.email)
    if found is None or not verify_password(body.password, found[1]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return _token_response(found[0], settings)


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict:
    return user.public()
