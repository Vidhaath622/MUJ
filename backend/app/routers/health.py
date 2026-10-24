import logging

from fastapi import APIRouter, Depends

from ..db import utc_now
from ..deps import get_engine
from ..engine_bridge import Engine

router = APIRouter(tags=["health"])
log = logging.getLogger("ragseal.backend")


@router.get("/health")
def health(engine: Engine = Depends(get_engine)) -> dict:
    # Always 200: a down Ollama or missing model shows up as engine_ready=false.
    body = {"status": "ok", "engine_ready": False, "timestamp": utc_now()}
    try:
        body.update(engine.status())
    except Exception as exc:  # noqa: BLE001 - health must never fail
        log.warning("engine status failed: %s", exc)
        body["engine_ready"] = False
        body["engine_error"] = str(exc)
    return body
