"""Request models. Responses are the engine's dicts, passed through unchanged."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CaseType = Literal["factoid", "unanswerable", "stale", "distractor"]

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(value: str) -> str:
    return value.strip().lower()


class RegisterRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=6, max_length=128)

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        value = _normalize_email(value)
        if not _EMAIL_RE.match(value):
            raise ValueError("not a valid email address")
        return value


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=10, max_length=8192)


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize(cls, value: str) -> str:
        return _normalize_email(value)


class DocumentScope(BaseModel):
    """Accepts the v1 `document_id` and the v2 `document_ids`; `ids()` merges them."""

    document_id: str | None = None
    document_ids: list[str] | None = None

    def ids(self) -> list[str]:
        merged = [*(self.document_ids or []), *([self.document_id] if self.document_id else [])]
        return list(dict.fromkeys(i for i in merged if i))


class AskRequest(DocumentScope):
    query: str = Field(min_length=1)
    k: int | None = Field(default=None, ge=1, le=20)


class BotConfigIn(BaseModel):
    """Your own RAG endpoint. Header values are used for the calls only: never stored or returned."""

    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=8, max_length=2048)
    headers: dict[str, str] = Field(default_factory=dict, max_length=5)
    question_field: str = Field(default="question", min_length=1, max_length=64)
    contexts_field: str = Field(default="contexts", min_length=1, max_length=64)
    answer_path: str = Field(default="answer", min_length=1, max_length=200)
    contexts_path: str = Field(default="contexts", min_length=1, max_length=200)
    accepts_contexts: bool = False
    timeout_s: float = Field(default=30.0, gt=0, le=120)
    max_concurrency: int = Field(default=2, ge=1, le=8)
    name: str | None = Field(default=None, max_length=80)


class BotTestRequest(BaseModel):
    bot: BotConfigIn
    question: str | None = Field(default=None, max_length=2000)


class BuiltinBotRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    contexts: list[str] | None = Field(default=None, max_length=20)


class EvaluateQueryRequest(DocumentScope):
    query: str = Field(min_length=1)
    optional_manual_answer: str | None = None
    optional_ground_truth: str | None = None
    gold_chunk_ids: list[str] | None = None
    stale_chunk_ids: list[str] | None = None
    type: CaseType = "factoid"
    # A pack case: the backend restores its documents and trap metadata (gold, stale, type, ground truth).
    pack_id: str | None = None
    test_id: str | None = None
    bot: BotConfigIn | None = None  # evaluate your own RAG endpoint instead of the built-in one


class TestCaseIn(BaseModel):
    # Unknown keys (stale_chunk_ids, context_snippet, ...) are passed through to the engine.
    model_config = ConfigDict(extra="allow")

    test_id: str | None = None
    question: str | None = None
    query: str | None = None
    ground_truth_answer: str | None = None
    gold_chunk_ids: list[str] | None = None
    source_chunk_id: str | None = None
    type: CaseType | None = None


class EvaluateBatchRequest(DocumentScope):
    model_config = ConfigDict(populate_by_name=True)

    test_cases: list[TestCaseIn] = Field(default_factory=list)
    pack_id: str | None = None
    # "async" is a Python keyword, so the field has another name.
    run_async: bool = Field(default=False, alias="async")
    concurrency: int | None = Field(default=None, ge=1, le=12)
    bot: BotConfigIn | None = None  # evaluate your own RAG endpoint instead of the built-in one


class SyntheticRequest(BaseModel):
    document_id: str
    count: int = Field(default=5, ge=1)
    include_traps: bool = True
