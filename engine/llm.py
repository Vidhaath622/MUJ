"""Model providers for the three roles: generator (system under test), judge, embeddings.

Providers: NVIDIA NIM and Groq (hosted, OpenAI-compatible) and Ollama (local).
Each role picks its provider from settings (see config.py). There is no mock or
offline fallback: if a provider is not available the call raises
ModelUnavailable, and the API reports that instead of returning made-up scores.

Every judge call goes through a SQLite cache keyed by provider, model, prompt and
schema, so re-running a batch only pays for calls it has not seen before.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from .config import Settings


class ModelUnavailable(RuntimeError):
    """The model server is down, a key is missing, or the model has not been pulled."""


class RateLimited(ModelUnavailable):
    """A hosted provider said "too many requests"; `wait` is how long its window needs."""

    def __init__(self, message: str, wait: float):
        super().__init__(message)
        self.wait = wait


class JudgeError(RuntimeError):
    """The judge returned something we could not parse."""


@dataclass
class Generation:
    text: str
    model: str
    latency_ms: int


def _strip_thinking(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def _parse_json(text: str) -> Any:
    text = _strip_thinking(text)
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    raise JudgeError(f"judge did not return JSON: {text[:200]!r}")


# ------------------------------------------------------------------ clients


class OllamaClient:
    name = "ollama"
    hosted = False

    def __init__(self, settings: Settings):
        self.settings = settings
        self._http = httpx.Client(base_url=settings.ollama_host, timeout=settings.request_timeout_s)

    def list_models(self) -> list[str]:
        try:
            resp = self._http.get("/api/tags", timeout=5)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise ModelUnavailable(f"Ollama is not reachable at {self.settings.ollama_host}: {exc}") from exc
        return [m["name"] for m in resp.json().get("models", [])]

    def has_model(self, model: str) -> bool:
        try:
            models = self.list_models()
        except ModelUnavailable:
            return False
        return model in models or f"{model}:latest" in models

    def _post(self, path: str, payload: dict) -> dict:
        try:
            resp = self._http.post(path, json=payload)
        except httpx.HTTPError as exc:
            raise ModelUnavailable(f"Ollama request failed: {exc}") from exc
        if resp.status_code == 404:
            raise ModelUnavailable(f"model '{payload.get('model')}' is not pulled in Ollama (run: ollama pull {payload.get('model')})")
        if resp.status_code >= 400:
            raise ModelUnavailable(f"Ollama error {resp.status_code}: {resp.text[:300]}")
        return resp.json()

    def chat(
        self, model: str, messages: list[dict], *, schema: dict | None = None, num_predict: int = 512, patient: bool = True
    ) -> Generation:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
            "think": False,
            "options": {"temperature": 0.0, "seed": self.settings.seed, "num_predict": num_predict},
        }
        if schema is not None:
            payload["format"] = schema
        start = time.perf_counter()
        data = self._post("/api/chat", payload)
        latency = int((time.perf_counter() - start) * 1000)
        return Generation(text=_strip_thinking(data["message"]["content"]), model=model, latency_ms=latency)

    def embed(self, model: str, texts: list[str], kind: str) -> list[list[float]]:
        # nomic-embed-text is trained with task prefixes.
        prefix = "search_query: " if kind == "query" else "search_document: "
        out: list[list[float]] = []
        for i in range(0, len(texts), 32):
            data = self._post("/api/embed", {"model": model, "input": [prefix + t for t in texts[i : i + 32]]})
            out.extend(data["embeddings"])
        return out


def _retry_wait(resp: httpx.Response, attempt: int) -> float:
    """Seconds to wait before retrying: retry-after if given, else Groq's token-window reset, else backoff."""
    for header in ("retry-after", "x-ratelimit-reset-tokens"):
        value = resp.headers.get(header)
        if not value:
            continue
        # Groq sends durations like "7.66s", "1m26.4s" or "585ms".
        match = re.fullmatch(r"(?:(\d+)m)?(?:([\d.]+)s)?|([\d.]+)ms", value.strip())
        try:
            if match and match.group(3):
                seconds = float(match.group(3)) / 1000
            elif match and (match.group(1) or match.group(2)):
                seconds = int(match.group(1) or 0) * 60 + float(match.group(2) or 0)
            else:
                seconds = float(value)
        except ValueError:
            continue
        return min(max(seconds, 1.0), 60.0)
    return float(min(2**attempt, 30))


class OpenAICompatClient:
    """NVIDIA NIM and Groq both speak the OpenAI chat-completions protocol."""

    hosted = True

    def __init__(self, name: str, base_url: str, api_key: str, settings: Settings, json_mode: bool):
        self.name = name
        self.settings = settings
        self.json_mode = json_mode
        self._api_key = api_key
        self._http = httpx.Client(base_url=base_url.rstrip("/"), timeout=settings.request_timeout_s)
        self._catalog: tuple[float, set[str]] | None = None

    def list_models(self) -> set[str]:
        """The provider's live catalog, cached for five minutes. Hosted catalogs retire models without notice."""
        if self._catalog and time.time() - self._catalog[0] < 300:
            return self._catalog[1]
        try:
            resp = self._http.get("/models", headers={"Authorization": f"Bearer {self._api_key}"}, timeout=15)
        except httpx.HTTPError as exc:
            raise ModelUnavailable(f"{self.name} is not reachable: {exc}") from exc
        if resp.status_code in (401, 403):
            raise ModelUnavailable(f"{self.name} rejected the API key (HTTP {resp.status_code})")
        if resp.status_code >= 400:
            raise ModelUnavailable(f"{self.name} model list failed with HTTP {resp.status_code}")
        models = {m["id"] for m in resp.json().get("data", [])}
        self._catalog = (time.time(), models)
        return models

    def has_model(self, model: str) -> bool:
        return model in self.list_models()

    def _post(self, path: str, payload: dict, patient: bool = True) -> dict:
        last_error = "no attempt made"
        for attempt in range(8 if patient else 3):
            try:
                resp = self._http.post(path, json=payload, headers={"Authorization": f"Bearer {self._api_key}"})
            except httpx.HTTPError as exc:
                last_error = str(exc)
                time.sleep(min(2**attempt, 30))
                continue
            if resp.status_code in (429, 500, 502, 503, 504):
                # Free tiers rate-limit per minute; retry-after says how long to wait.
                last_error = f"HTTP {resp.status_code}" + (" (rate limited)" if resp.status_code == 429 else "")
                if resp.status_code == 429 and not patient:
                    # The judge pool routes around the limit instead of sleeping on it.
                    raise RateLimited(f"{self.name} rate limited", _retry_wait(resp, attempt))
                time.sleep(_retry_wait(resp, attempt))
                continue
            if resp.status_code in (401, 403):
                raise ModelUnavailable(f"{self.name} rejected the API key (HTTP {resp.status_code})")
            if resp.status_code >= 400:
                raise ModelUnavailable(f"{self.name} error {resp.status_code}: {resp.text[:300]}")
            return resp.json()
        raise ModelUnavailable(f"{self.name} request failed after retries: {last_error}")

    def chat(
        self, model: str, messages: list[dict], *, schema: dict | None = None, num_predict: int = 512, patient: bool = True
    ) -> Generation:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": 0,
            "seed": self.settings.seed,
            "max_tokens": num_predict,
        }
        if schema is not None and self.json_mode:
            payload["response_format"] = {"type": "json_object"}
        if "gpt-oss" in model:
            # Grading needs little reasoning; low effort keeps calls fast and inside per-minute token limits.
            payload["reasoning_effort"] = "low"
        start = time.perf_counter()
        data = self._post("/chat/completions", payload, patient)
        latency = int((time.perf_counter() - start) * 1000)
        text = data["choices"][0]["message"].get("content") or ""
        return Generation(text=_strip_thinking(text), model=model, latency_ms=latency)

    def embed(self, model: str, texts: list[str], kind: str) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), 32):
            # NeMo retriever embedding models need input_type (query vs passage).
            data = self._post(
                "/embeddings",
                {"model": model, "input": texts[i : i + 32], "input_type": "query" if kind == "query" else "passage", "encoding_format": "float"},
            )
            out.extend(item["embedding"] for item in sorted(data["data"], key=lambda d: d["index"]))
        return out


# -------------------------------------------------------------------- roles


class ChatModel:
    """A provider plus a model name for one role."""

    def __init__(self, client, model: str):
        self.client = client
        self.model = model

    @property
    def provider(self) -> str:
        return self.client.name

    @property
    def hosted(self) -> bool:
        return self.client.hosted

    def chat(self, messages: list[dict], *, schema: dict | None = None, num_predict: int = 512, patient: bool = True) -> Generation:
        return self.client.chat(self.model, messages, schema=schema, num_predict=num_predict, patient=patient)

    def ready(self) -> tuple[bool, str | None]:
        if isinstance(self.client, UnavailableClient):
            return False, self.client.reason
        if not self.client.hosted:
            if self.client.has_model(self.model):
                return True, None
            return False, f"{self.model} is not pulled in Ollama (or Ollama is not running)"
        try:
            if self.client.has_model(self.model):
                return True, None
        except ModelUnavailable as exc:
            return False, str(exc)
        return False, f"{self.model} is not in the {self.provider} catalog (retired or misspelled); set another model in .env"


class EmbedModel(ChatModel):
    def embed(self, texts: list[str], kind: str = "passage") -> list[list[float]]:
        if not texts:
            return []
        return self.client.embed(self.model, texts, kind)

    @property
    def key(self) -> str:
        """Identifies the vector space; stored vectors from another key must be re-embedded."""
        return f"{self.provider}:{self.model}"


class JudgeCache:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.execute("CREATE TABLE IF NOT EXISTS judge_cache (key TEXT PRIMARY KEY, response TEXT, created_at REAL)")
        self._db.commit()

    @staticmethod
    def key(*parts: str) -> str:
        return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()

    def get(self, key: str) -> Any | None:
        with self._lock:
            row = self._db.execute("SELECT response FROM judge_cache WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def put(self, key: str, value: Any) -> None:
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO judge_cache VALUES (?, ?, ?)", (key, json.dumps(value), time.time()))
            self._db.commit()


class Judge:
    """JSON-returning judge with a disk cache and a small pool of models.

    The primary model (gpt-oss-120b by default) judges everything it can. When it is
    rate-limited for longer than `max_wait_s`, a call overflows to the next pool member
    (other hosted models, then local Ollama as the last resort). The cache is keyed by
    model, and every call records which model answered, so each result says exactly who
    judged it and batches can report how often overflow happened.
    """

    def __init__(
        self,
        chat_model: ChatModel,
        cache_path: Path,
        fallback: ChatModel | None = None,
        overflow: tuple[ChatModel, ...] = (),
        max_inflight: int = 3,
        max_wait_s: float = 12.0,
    ):
        self.chat_model = chat_model
        self.fallback = fallback
        self.members = [chat_model, *overflow, *([fallback] if fallback is not None else [])]
        self.cache = JudgeCache(cache_path)
        self.max_wait_s = max_wait_s
        self._lock = threading.Lock()
        self._slots = {id(m): threading.BoundedSemaphore(max_inflight if m.hosted else 1) for m in self.members}
        self._cooldown: dict[int, float] = {}
        self._ready: dict[int, tuple[float, bool]] = {}
        self._local = threading.local()
        self.calls = 0
        self.cache_hits = 0
        self.fallback_calls = 0
        self.rate_limited = 0

    @property
    def mode(self) -> str:
        return "hosted" if self.chat_model.hosted else "local"

    @property
    def model(self) -> str:
        return self.chat_model.model

    @property
    def provider(self) -> str:
        return self.chat_model.provider

    # ---------------------------------------------------- per-case tracking

    def start_tracking(self) -> None:
        self._local.used = []

    def used(self) -> dict:
        """Who judged since start_tracking() on this thread."""
        models = list(dict.fromkeys(getattr(self._local, "used", []))) or [self.chat_model]
        return {
            "judge_model": " + ".join(m.model for m in models),
            "evaluation_mode": "hosted" if any(m.hosted for m in models) else "local",
            "judge_models_used": [f"{m.provider}:{m.model}" for m in models],
            "judge_fallback_used": any(m is not self.chat_model for m in models),
        }

    def _record(self, member: ChatModel) -> None:
        if not hasattr(self._local, "used"):
            self._local.used = []
        self._local.used.append(member)

    # ------------------------------------------------------------ calling

    @staticmethod
    def _key(member: ChatModel, system: str, user: str, schema: dict) -> str:
        return JudgeCache.key(member.provider, member.model, system, user, json.dumps(schema, sort_keys=True))

    def _member_ready(self, member: ChatModel) -> bool:
        if member is self.chat_model:
            return True
        now = time.time()
        cached = self._ready.get(id(member))
        if cached and now - cached[0] < 60:
            return cached[1]
        ok = member.ready()[0]
        self._ready[id(member)] = (now, ok)
        return ok

    def _call(self, member: ChatModel, system: str, user: str, schema: dict) -> dict:
        messages = [
            {"role": "system", "content": system + "\nRespond with one JSON object only, matching this JSON schema: " + json.dumps(schema)},
            {"role": "user", "content": user},
        ]
        last_error: Exception | None = None
        for _ in range(2):
            raw = member.chat(messages, schema=schema, num_predict=800, patient=False).text
            with self._lock:
                self.calls += 1
            try:
                result = _parse_json(raw)
            except JudgeError as exc:
                last_error = exc
                continue
            if isinstance(result, dict):
                return result
            last_error = JudgeError(f"judge returned {type(result).__name__}, expected an object")
        raise last_error or JudgeError("judge failed")

    def ask(self, system: str, user: str, schema: dict) -> dict:
        # A cached verdict from the primary first; overflow members' cache only if the primary never judged it.
        for member in self.members:
            cached = self.cache.get(self._key(member, system, user, schema))
            if cached is not None:
                with self._lock:
                    self.cache_hits += 1
                self._record(member)
                return cached

        deadline = time.time() + 300
        last_error: Exception | None = None
        broken: set[int] = set()  # members that failed for a reason other than a rate limit
        while time.time() < deadline:
            now = time.time()
            usable = [m for m in self.members if id(m) not in broken and self._member_ready(m)]
            if not usable:
                raise last_error or ModelUnavailable("no judge model is available")
            primary_wait = self._cooldown.get(id(self.chat_model), 0) - now
            candidates = [self.chat_model] if self.chat_model in usable and primary_wait <= self.max_wait_s else []
            candidates += [m for m in usable if m is not self.chat_model and self._cooldown.get(id(m), 0) <= now]
            if not candidates:
                # Everyone usable is rate-limited: wait for the first window to reopen.
                reopen = min(self._cooldown.get(id(m), now) for m in usable)
                time.sleep(min(2.0, max(0.2, reopen - now)))
                continue
            member = candidates[0]
            if member is self.chat_model and primary_wait > 0:
                time.sleep(primary_wait)
            slot = self._slots[id(member)]
            if not slot.acquire(timeout=1.0):
                continue
            try:
                result = self._call(member, system, user, schema)
            except RateLimited as exc:
                with self._lock:
                    self._cooldown[id(member)] = time.time() + exc.wait
                    self.rate_limited += 1
                last_error = exc
                continue
            except ModelUnavailable as exc:
                broken.add(id(member))
                last_error = exc
                continue
            finally:
                slot.release()
            self.cache.put(self._key(member, system, user, schema), result)
            if member is not self.chat_model:
                with self._lock:
                    self.fallback_calls += 1
            self._record(member)
            return result
        raise ModelUnavailable(f"no judge available within 300 s: {last_error}")


# ------------------------------------------------------------------ factory


class UnavailableClient:
    """Stands in for a provider that cannot be used, so the engine still starts and reports why."""

    hosted = False

    def __init__(self, name: str, reason: str):
        self.name = name
        self.reason = reason

    def has_model(self, model: str) -> bool:
        return False

    def chat(self, model: str, messages: list[dict], **_) -> Generation:
        raise ModelUnavailable(self.reason)

    def embed(self, model: str, texts: list[str], kind: str) -> list[list[float]]:
        raise ModelUnavailable(self.reason)


def _client(provider: str, settings: Settings, ollama: OllamaClient):
    if provider == "ollama":
        return ollama
    if provider == "nvidia":
        if not settings.nvidia_api_key:
            return UnavailableClient("nvidia", "NVIDIA NIM was selected but NVIDIA_API_KEY is not set")
        return OpenAICompatClient("nvidia", settings.nvidia_base_url, settings.nvidia_api_key, settings, json_mode=False)
    if provider == "groq":
        if not settings.groq_api_key:
            return UnavailableClient("groq", "Groq was selected but GROQ_API_KEY is not set")
        return OpenAICompatClient("groq", "https://api.groq.com/openai/v1", settings.groq_api_key, settings, json_mode=True)
    raise ValueError(f"unknown provider {provider!r}")


@dataclass
class Models:
    generator: ChatModel
    judge: ChatModel
    embedder: EmbedModel
    judge_fallback: ChatModel | None = None
    judge_overflow: tuple[ChatModel, ...] = ()


def build_models(settings: Settings) -> Models:
    ollama = OllamaClient(settings)
    clients: dict[str, Any] = {}

    def client(provider: str):
        if provider not in clients:
            clients[provider] = _client(provider, settings, ollama)
        return clients[provider]

    gen_provider = settings.provider_for("generator")
    judge_provider = settings.provider_for("judge")
    embed_provider = settings.provider_for("embeddings")
    fallback_provider = settings.judge_fallback_provider(judge_provider)
    return Models(
        generator=ChatModel(client(gen_provider), settings.model_for("generator", gen_provider)),
        judge=ChatModel(client(judge_provider), settings.model_for("judge", judge_provider)),
        embedder=EmbedModel(client(embed_provider), settings.model_for("embeddings", embed_provider)),
        judge_fallback=(
            ChatModel(client(fallback_provider), settings.model_for("judge", fallback_provider)) if fallback_provider else None
        ),
        judge_overflow=tuple(ChatModel(client(provider), model) for provider, model in settings.judge_overflow(judge_provider)),
    )
