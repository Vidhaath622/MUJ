"""FastAPI dependencies: settings, database, the shared Engine, and the current user."""

from __future__ import annotations

import os
import threading

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import Database, User
from .engine_bridge import Engine
from .security import decode_token
from .settings import AppSettings

_engine_lock = threading.Lock()
_bearer = HTTPBearer(auto_error=False)


def get_settings(request: Request) -> AppSettings:
    return request.app.state.settings


def get_db(request: Request) -> Database:
    return request.app.state.db


def get_engine(request: Request) -> Engine:
    """One Engine per app, built on first use. Tests replace this via dependency_overrides."""
    state = request.app.state
    if state.engine is None:
        with _engine_lock:
            if state.engine is None:
                os.environ.setdefault("RAGSEAL_DATA_DIR", str(state.settings.engine_data_dir))
                state.engine = Engine()
    return state.engine


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: AppSettings = Depends(get_settings),
    db: Database = Depends(get_db),
) -> User:
    def unauthorized(detail: str) -> HTTPException:
        return HTTPException(status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"})

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized("Not authenticated")
    user_id = decode_token(credentials.credentials, settings.jwt_secret)
    user = db.user_by_id(user_id) if user_id else None
    if user is None:
        raise unauthorized("Invalid or expired token")
    return user
