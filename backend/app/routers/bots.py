"""Your own bot: test the connection, and a reference bot that speaks the same contract."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from ..db import User
from ..deps import get_current_user, get_engine, request_hosts
from ..engine_bridge import Engine
from ..schemas import BotTestRequest, BuiltinBotRequest

router = APIRouter(prefix="/bots", tags=["bots"])


@router.post("/test")
def test_bot(
    body: BotTestRequest, request: Request, user: User = Depends(get_current_user), engine: Engine = Depends(get_engine)
) -> dict:
    """One sample question round trip (with latency), plus a check of the contexts override if the bot claims one.

    Our own /api/bots/builtin URL is answered in-process for this user (bot.in_process = true)."""
    return engine.test_bot(body.bot.model_dump(), body.question, owner_id=user.id, self_hosts=request_hosts(request))


@router.post("/builtin")
def builtin_bot(
    body: BuiltinBotRequest,
    pack_id: str | None = Query(default=None),
    document_ids: list[str] = Query(default=[]),
    user: User = Depends(get_current_user),
    engine: Engine = Depends(get_engine),
) -> dict:
    """RAGSeal's own RAG behind the bot contract: {question[, contexts]} -> {answer, contexts}.

    Point the "your own bot" settings here (with an Authorization header) to see the adapter work end to end.
    """
    if pack_id:
        document_ids = list(dict.fromkeys([*engine.load_pack(user.id, pack_id)["document_ids"], *document_ids]))
    return engine.builtin_bot_answer(user.id, body.question, document_ids, body.contexts)
