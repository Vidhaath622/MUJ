"""Engine settings. Everything can be overridden with environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
REPO_ROOT = ENGINE_DIR.parent


def _env(name: str, default: str) -> str:
    value = (os.environ.get(name) or "").strip()
    return value or default


PROVIDERS = ("nvidia", "groq", "ollama")

# Model per role and provider; each can be overridden with the env var named here.
MODEL_DEFAULTS = {
    ("generator", "ollama"): ("RAGSEAL_GENERATOR_MODEL", "llama3.2:3b"),
    ("generator", "nvidia"): ("NVIDIA_GENERATOR_MODEL", "google/gemma-3-4b-it"),
    ("generator", "groq"): ("RAGSEAL_GROQ_GENERATOR_MODEL", "openai/gpt-oss-20b"),
    ("judge", "ollama"): ("RAGSEAL_JUDGE_MODEL", "qwen3:8b"),
    ("judge", "nvidia"): ("NVIDIA_JUDGE_MODEL", "mistralai/mistral-large-2-instruct"),
    ("judge", "groq"): ("RAGSEAL_GROQ_MODEL", "openai/gpt-oss-120b"),
    ("embeddings", "ollama"): ("RAGSEAL_EMBED_MODEL", "nomic-embed-text"),
    ("embeddings", "nvidia"): ("NVIDIA_EMBED_MODEL", "nvidia/llama-3.2-nv-embedqa-1b-v1"),
}

# "auto" picks the first provider in this order that is configured (Ollama always is).
# The generator under test and the embeddings stay local by default: llama3.2:3b is
# small on purpose, and local vectors never depend on a hosted catalog. The judge
# prefers a large hosted model. Hosted catalogs retire models (NIM retired the Llama
# 3.x models in Aug 2026), so every default can be overridden from .env.
AUTO_ORDER = {
    "generator": ("ollama",),
    "judge": ("groq", "nvidia", "ollama"),
    "embeddings": ("ollama",),
}
PROVIDER_ENV = {"generator": "RAGSEAL_GENERATOR_PROVIDER", "judge": "RAGSEAL_JUDGE_PROVIDER", "embeddings": "RAGSEAL_EMBED_PROVIDER"}


@dataclass(frozen=True)
class Settings:
    ollama_host: str = field(
        default_factory=lambda: _env("OLLAMA_HOST_URL", _env("OLLAMA_BASE_URL", "http://localhost:11434"))
    )
    groq_api_key: str = field(default_factory=lambda: _env("GROQ_API_KEY", ""))
    # NVIDIA_API_KEY_2 (a newer build.nvidia.com account) wins over the old key, which most models reject.
    nvidia_api_key: str = field(default_factory=lambda: _env("NVIDIA_API_KEY_2", _env("NVIDIA_API_KEY", "")))
    nvidia_base_url: str = field(default_factory=lambda: _env("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"))
    data_dir: Path = field(default_factory=lambda: Path(_env("RAGSEAL_DATA_DIR", str(ENGINE_DIR / ".data"))))
    packs_dirs: tuple[Path, ...] = field(
        default_factory=lambda: tuple(
            Path(p)
            for p in _env(
                "RAGSEAL_PACKS_DIRS",
                os.pathsep.join([str(REPO_ROOT / "docs" / "packs"), str(ENGINE_DIR / "packs_builtin")]),
            ).split(os.pathsep)
            if p
        )
    )
    top_k: int = field(default_factory=lambda: int(_env("RAGSEAL_TOP_K", "4")))
    chunk_chars: int = field(default_factory=lambda: int(_env("RAGSEAL_CHUNK_CHARS", "700")))
    seed: int = 42
    request_timeout_s: float = field(default_factory=lambda: float(_env("RAGSEAL_TIMEOUT_S", "180")))
    batch_concurrency: int = field(default_factory=lambda: int(_env("RAGSEAL_BATCH_CONCURRENCY", "6")))
    # Extra Groq keys (GROQ_API_KEY_2, _3, _4) from other accounts: each has its own rate limit.
    groq_extra_keys: tuple[str, ...] = field(
        default_factory=lambda: tuple(k for k in (_env(f"GROQ_API_KEY_{i}", "") for i in range(2, 5)) if k)
    )
    # How long the primary judge may be waited for before a call overflows to another model.
    # 0 means overflow as soon as the primary is rate-limited.
    judge_overflow_wait_s: float = field(default_factory=lambda: float(_env("RAGSEAL_JUDGE_OVERFLOW_WAIT_S", "12")))
    # Optional separate judge model for interactive calls (live questions, synthetic), on the same
    # provider as the batch judge; empty means the batch judge serves both.
    live_judge_model: str = field(default_factory=lambda: _env("RAGSEAL_LIVE_JUDGE_MODEL", ""))

    def _has_key(self, provider: str) -> bool:
        return {"nvidia": bool(self.nvidia_api_key), "groq": bool(self.groq_api_key), "ollama": True}[provider]

    def provider_for(self, role: str) -> str:
        choice = _env(PROVIDER_ENV[role], "auto").lower()
        if choice == "auto":
            return next(p for p in AUTO_ORDER[role] if self._has_key(p))
        if choice not in PROVIDERS or (role, choice) not in MODEL_DEFAULTS:
            raise ValueError(f"{PROVIDER_ENV[role]}={choice!r} is not supported for the {role}")
        return choice

    def judge_fallback_provider(self, primary: str) -> str | None:
        """RAGSEAL_JUDGE_FALLBACK_PROVIDER: auto (local Ollama behind a hosted judge) | none | a provider name."""
        choice = _env("RAGSEAL_JUDGE_FALLBACK_PROVIDER", "auto").lower()
        if choice == "none":
            return None
        if choice == "auto":
            return "ollama" if primary != "ollama" else None
        if choice not in PROVIDERS:
            raise ValueError(f"RAGSEAL_JUDGE_FALLBACK_PROVIDER={choice!r} is not a provider")
        return choice if choice != primary else None

    def judge_overflow(self, primary: str) -> list[tuple[str, str]]:
        """RAGSEAL_JUDGE_OVERFLOW: comma-separated provider:model pairs tried when the primary judge is rate-limited.

        Default: the other Groq models behind a Groq primary (each Groq model has its own per-minute limit).
        "none" disables overflow. Pairs whose provider has no key are skipped.
        """
        # gpt-oss-20b is left out: Groq's JSON validation rejects its replies to the judge prompt.
        default = "groq:qwen/qwen3.8-27b" if primary == "groq" else "none"
        raw = _env("RAGSEAL_JUDGE_OVERFLOW", default)
        if raw.lower() == "none":
            return []
        pairs = []
        for item in raw.split(","):
            provider, _, model = item.strip().partition(":")
            if provider in PROVIDERS and model and self._has_key(provider):
                pairs.append((provider, model))
        primary_model = self.model_for("judge", primary)
        return [p for p in pairs if p != (primary, primary_model)]

    def model_for(self, role: str, provider: str) -> str:
        env_name, default = MODEL_DEFAULTS[(role, provider)]
        return _env(env_name, default)


# Pass thresholds from docs/api_contract.md section 1. Scores in the REVIEW band
# (just under the threshold) are shown amber instead of red.
THRESHOLDS = {
    "context_relevance": 0.70,
    "faithfulness": 0.75,
    "answer_accuracy": 0.70,
}
REVIEW_BAND = 0.15


def get_settings() -> Settings:
    return Settings()
