"""RAGSeal backend. Run from backend/: uvicorn app.main:app --port 8000"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Database
from .errors import register_error_handlers
from .jobs import BatchJobs
from .routers import auth, documents, evaluate, health, packs, rag, runs, synthetic
from .security import DEMO_EMAIL, DEMO_PASSWORD, hash_password
from .settings import load_settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def _seed_demo_user(db: Database) -> None:
    if db.user_by_email(DEMO_EMAIL) is None:
        db.create_user(DEMO_EMAIL, hash_password(DEMO_PASSWORD))


def create_app() -> FastAPI:
    settings = load_settings()
    db = Database(settings.db_path)
    _seed_demo_user(db)
    db.fail_interrupted_runs()

    app = FastAPI(title="RAGSeal API", version="2.0.0")
    app.state.settings = settings
    app.state.db = db
    app.state.engine = None  # built lazily by deps.get_engine
    app.state.jobs = BatchJobs()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    for module in (health, auth, documents, rag, evaluate, synthetic, packs, runs):
        app.include_router(module.router, prefix="/api")
    return app


app = create_app()
