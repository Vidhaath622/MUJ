"""Evaluate your own RAG bot: an HTTP adapter for any endpoint that answers questions.

The bot receives POST {"question": "..."} (field names configurable) and returns JSON that
contains an answer and the passages it used. JSON paths say where they are:

    answer_path   "answer"            or "data.reply.text"
    contexts_path "contexts"          (a list of strings) or "sources[*].text" (a field of each item)

Replay (re-asking with only the gold passage) needs the bot to accept a contexts override:
POST {"question": ..., "contexts": ["gold passage"]} must answer from those passages only.
Bots that declare accepts_contexts=False get replay "unavailable", never a faked one.

Bot URLs are fetched by the server, so private, loopback and link-local addresses are refused
unless explicitly allowed (RAGSEAL_ALLOW_PRIVATE_BOT_URLS=1 for local development).
"""

from __future__ import annotations

import ipaddress
import re
import socket
import time
from dataclasses import dataclass, field
from urllib.parse import urlsplit

import httpx

from .ingest import Chunk


class BotError(RuntimeError):
    """The bot could not be reached, answered with an error, or its JSON did not match the mapping."""


@dataclass
class BotConfig:
    url: str
    headers: dict[str, str] = field(default_factory=dict)
    question_field: str = "question"
    contexts_field: str = "contexts"
    answer_path: str = "answer"
    contexts_path: str = "contexts"
    accepts_contexts: bool = False
    timeout_s: float = 30.0
    max_concurrency: int = 2
    name: str | None = None

    def public(self) -> dict:
        """What may be stored and shown: never the header values (they are usually secrets)."""
        return {
            "name": self.name,
            "host": urlsplit(self.url).hostname,
            "url": self.url,
            "header_names": sorted(self.headers),
            "answer_path": self.answer_path,
            "contexts_path": self.contexts_path,
            "accepts_contexts": self.accepts_contexts,
        }


@dataclass
class BotReply:
    answer: str
    contexts: list[str]
    latency_ms: int
    status_code: int


def check_url(url: str, allow_private: bool = False) -> None:
    """Refuse URLs the server must not call on a user's behalf."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise BotError("the bot URL must start with http:// or https:// and name a host")
    if allow_private:
        return
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise BotError(f"cannot resolve {parts.hostname}: {exc}") from exc
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if address.is_private or address.is_loopback or address.is_link_local or address.is_reserved or address.is_multicast:
            raise BotError(
                f"{parts.hostname} resolves to a private or local address ({address}); public bot URLs only "
                "(set RAGSEAL_ALLOW_PRIVATE_BOT_URLS=1 on the server for local development)"
            )


_SEGMENT = re.compile(r"([^.\[\]]+)|\[(\*|\d+)\]")


def resolve_path(data, path: str):
    """A small JSON path: "a.b", "a[0].b", "items[*].text" (maps over a list)."""
    values = [data]
    mapped = False
    for name, index in _SEGMENT.findall(path):
        next_values = []
        for value in values:
            if name:
                if not isinstance(value, dict) or name not in value:
                    raise BotError(f"the bot's JSON has no '{name}' where '{path}' expects it")
                next_values.append(value[name])
            elif index == "*":
                if not isinstance(value, list):
                    raise BotError(f"'{path}' expects a list before [*]")
                next_values.extend(value)
                mapped = True
            else:
                if not isinstance(value, list) or int(index) >= len(value):
                    raise BotError(f"'{path}' expects a list with at least {int(index) + 1} items")
                next_values.append(value[int(index)])
        values = next_values
    return values if mapped else values[0]


class ExternalBot:
    def __init__(self, config: BotConfig, client: httpx.Client | None = None, allow_private: bool = False):
        check_url(config.url, allow_private)
        self.config = config
        self._client = client or httpx.Client(timeout=config.timeout_s, follow_redirects=False)

    def ask(self, question: str, contexts: list[str] | None = None) -> BotReply:
        payload = {self.config.question_field: question}
        if contexts is not None:
            if not self.config.accepts_contexts:
                raise BotError("this bot does not accept a contexts override")
            payload[self.config.contexts_field] = contexts
        start = time.perf_counter()
        try:
            resp = self._client.post(self.config.url, json=payload, headers=self.config.headers, timeout=self.config.timeout_s)
        except httpx.HTTPError as exc:
            raise BotError(f"could not reach the bot: {type(exc).__name__}: {exc}") from exc
        latency = int((time.perf_counter() - start) * 1000)
        if resp.status_code >= 400:
            raise BotError(f"the bot answered HTTP {resp.status_code}: {resp.text[:200]}")
        try:
            data = resp.json()
        except ValueError as exc:
            raise BotError("the bot did not answer with JSON") from exc
        answer = resolve_path(data, self.config.answer_path)
        if not isinstance(answer, str):
            raise BotError(f"'{self.config.answer_path}' is not a string in the bot's JSON")
        raw_contexts = resolve_path(data, self.config.contexts_path)
        if isinstance(raw_contexts, str):
            raw_contexts = [raw_contexts]
        if not isinstance(raw_contexts, list) or not all(isinstance(c, str) for c in raw_contexts):
            raise BotError(f"'{self.config.contexts_path}' must give a list of strings (use [*].field for a list of objects)")
        return BotReply(answer=answer, contexts=raw_contexts, latency_ms=latency, status_code=resp.status_code)


def context_chunks(reply: BotReply) -> list[Chunk]:
    """The bot's passages as chunks, so the judge and the report treat them like retrieved text."""
    return [Chunk(f"ext_{i:02d}", "external", i, text, None) for i, text in enumerate(reply.contexts)]


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+(?:[.,][0-9]+)*", text.lower())


def covers(context: str, passage: str, threshold: float = 0.7) -> bool:
    """Does a bot passage contain this passage of ours? Most of its distinct words (and all its numbers) must appear."""
    want = set(_tokens(passage))
    if not want:
        return False
    have = set(_tokens(context))
    numbers = {t for t in want if t[0].isdigit()}
    return numbers <= have and len(want & have) / len(want) >= threshold
