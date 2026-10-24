"""Model clients: Ollama for generation and embeddings, Ollama or Groq for the judge.

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
    """The model server is down or the model has not been pulled."""


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
            self._db.execute(
                "INSERT OR REPLACE INTO judge_cache VALUES (?, ?, ?)", (key, json.dumps(value), time.time())
            )
            self._db.commit()


class OllamaClient:
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

    def has_model(self, name: str) -> bool:
        try:
            models = self.list_models()
        except ModelUnavailable:
            return False
        wanted = name if ":" in name else f"{name}:latest"
        return wanted in models or name in models

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
        self,
        model: str,
        messages: list[dict],
        *,
        fmt: dict | str | None = None,
        temperature: float = 0.0,
        num_predict: int = 512,
    ) -> Generation:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
            "think": False,
            "options": {"temperature": temperature, "seed": self.settings.seed, "num_predict": num_predict},
        }
        if fmt is not None:
            payload["format"] = fmt
        start = time.perf_counter()
        try:
            data = self._post("/api/chat", payload)
        except ModelUnavailable as exc:
            # Older Ollama builds reject the "think" flag; retry once without it.
            if "think" not in str(exc):
                raise
            payload.pop("think")
            data = self._post("/api/chat", payload)
        latency = int((time.perf_counter() - start) * 1000)
        return Generation(text=_strip_thinking(data["message"]["content"]), model=model, latency_ms=latency)

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        out: list[list[float]] = []
        for i in range(0, len(texts), 32):
            data = self._post("/api/embed", {"model": self.settings.embed_model, "input": texts[i : i + 32]})
            out.extend(data["embeddings"])
        return out


class GroqClient:
    URL = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self, settings: Settings):
        self.settings = settings
        self._http = httpx.Client(timeout=settings.request_timeout_s)

    def chat_json(self, model: str, messages: list[dict]) -> str:
        last_error: Exception | None = None
        for attempt in range(4):
            try:
                resp = self._http.post(
                    self.URL,
                    headers={"Authorization": f"Bearer {self.settings.groq_api_key}"},
                    json={
                        "model": model,
                        "messages": messages,
                        "temperature": 0,
                        "seed": self.settings.seed,
                        "response_format": {"type": "json_object"},
                    },
                )
            except httpx.HTTPError as exc:
                last_error = exc
            else:
                if resp.status_code == 429:
                    time.sleep(float(resp.headers.get("retry-after", 2 ** attempt)))
                    last_error = ModelUnavailable("Groq rate limit")
                    continue
                if resp.status_code >= 400:
                    raise ModelUnavailable(f"Groq error {resp.status_code}: {resp.text[:300]}")
                return resp.json()["choices"][0]["message"]["content"]
            time.sleep(2 ** attempt)
        raise ModelUnavailable(f"Groq request failed: {last_error}")


class Judge:
    """JSON-returning judge with a disk cache. Uses Groq when GROQ_API_KEY is set."""

    def __init__(self, settings: Settings, ollama: OllamaClient):
        self.settings = settings
        self.ollama = ollama
        self.groq = GroqClient(settings) if settings.groq_api_key else None
        self.cache = JudgeCache(settings.data_dir / "judge_cache.sqlite")
        self.calls = 0
        self.cache_hits = 0

    @property
    def mode(self) -> str:
        return "hosted" if self.groq else "local"

    @property
    def model(self) -> str:
        return self.settings.groq_model if self.groq else self.settings.judge_model_local

    def ask(self, system: str, user: str, schema: dict) -> dict:
        key = JudgeCache.key(self.mode, self.model, system, user, json.dumps(schema, sort_keys=True))
        cached = self.cache.get(key)
        if cached is not None:
            self.cache_hits += 1
            return cached
        self.calls += 1
        messages = [
            {"role": "system", "content": system + "\nRespond with JSON only, matching this schema: " + json.dumps(schema)},
            {"role": "user", "content": user},
        ]
        last_error: Exception | None = None
        for _ in range(2):
            if self.groq:
                raw = self.groq.chat_json(self.model, messages)
            else:
                raw = self.ollama.chat(self.model, messages, fmt=schema, num_predict=1024).text
            try:
                result = _parse_json(raw)
            except JudgeError as exc:
                last_error = exc
                continue
            if isinstance(result, dict):
                self.cache.put(key, result)
                return result
            last_error = JudgeError(f"judge returned {type(result).__name__}, expected an object")
        raise last_error or JudgeError("judge failed")
