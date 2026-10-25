"""FastAPI dependencies: settings, database, the shared Engine, and the current user."""

from __future__ import annotations

import os
import threading

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import Database, User
from .engine_bridge import Engine
from .jobs import BatchJobs
from .security import decode_token
from .settings import AppSettings
from .showcase import Showcase

_engine_lock = threading.Lock()
_bearer = HTTPBearer(auto_error=False)


def get_settings(request: Request) -> AppSettings:
    return request.app.state.settings


def get_db(request: Request) -> Database:
    return request.app.state.db


def request_hosts(request: Request) -> tuple[str, ...]:
    """The hosts this request reached us on (behind Vercel and a tunnel: X-Forwarded-Host too).
    A bot URL on one of them is our own reference bot, answered in-process."""
    hosts = [request.url.hostname or "", request.headers.get("host", "").split(":")[0]]
    hosts += [h.strip().split(":")[0] for h in request.headers.get("x-forwarded-host", "").split(",")]
    return tuple(dict.fromkeys(h.lower() for h in hosts if h))


def get_jobs(request: Request) -> BatchJobs:
    return request.app.state.jobs


def get_showcase(request: Request) -> Showcase:
    return request.app.state.showcase


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
    if credentials.credentials.startswith(Database.API_TOKEN_PREFIX):
        user = db.user_by_api_token(credentials.credentials)  # a CI token from Settings > API tokens
        if user is None:
            raise unauthorized("Invalid or revoked API token")
        return user
    user_id = decode_token(credentials.credentials, settings.jwt_secret)
    user = db.user_by_id(user_id) if user_id else None
    if user is None:
        raise unauthorized("Invalid or expired token")
    return user
