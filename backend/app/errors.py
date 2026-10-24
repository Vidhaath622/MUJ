"""Map engine exceptions to HTTP status codes with a `{"detail": "..."}` body."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .engine_bridge import JudgeError, ModelUnavailable, NotFound, PackError, UnsupportedFile

log = logging.getLogger("ragseal.backend")


def _json(status_code: int, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": detail})


def register_error_handlers(app: FastAPI) -> None:
    # Starlette picks the most specific handler along the exception's MRO, so the
    # ValueError subclasses (UnsupportedFile, PackError) win over the plain ValueError one.

    @app.exception_handler(NotFound)
    async def not_found(_: Request, exc: NotFound):
        return _json(404, str(exc))

    @app.exception_handler(UnsupportedFile)
    async def unsupported_file(_: Request, exc: UnsupportedFile):
        return _json(400, str(exc))

    @app.exception_handler(PackError)
    async def pack_error(_: Request, exc: PackError):
        return _json(422, f"Pack is invalid: {exc}")

    @app.exception_handler(ValueError)
    async def value_error(_: Request, exc: ValueError):
        return _json(400, str(exc))

    @app.exception_handler(ModelUnavailable)
    async def model_unavailable(_: Request, exc: ModelUnavailable):
        log.warning("model unavailable: %s", exc)
        return _json(503, f"Local model warming up / not pulled: {exc}")

    @app.exception_handler(JudgeError)
    async def judge_error(_: Request, exc: JudgeError):
        log.warning("judge error: %s", exc)
        return _json(502, f"Judge model returned an unusable response: {exc}")

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        # Flatten pydantic's error list so every error body is {"detail": "<string>"}.
        parts = []
        for err in exc.errors():
            loc = ".".join(str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path"))
            parts.append(f"{loc}: {err.get('msg')}" if loc else str(err.get("msg")))
        return _json(422, "; ".join(parts) or "Invalid request")
