"""Engine settings. Everything can be overridden with environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
REPO_ROOT = ENGINE_DIR.parent


def _env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


@dataclass(frozen=True)
class Settings:
    ollama_host: str = field(default_factory=lambda: _env("OLLAMA_HOST_URL", "http://localhost:11434"))
    generator_model: str = field(default_factory=lambda: _env("RAGSEAL_GENERATOR_MODEL", "llama3.2:3b"))
    judge_model_local: str = field(default_factory=lambda: _env("RAGSEAL_JUDGE_MODEL", "qwen3:8b"))
    embed_model: str = field(default_factory=lambda: _env("RAGSEAL_EMBED_MODEL", "nomic-embed-text"))
    groq_api_key: str = field(default_factory=lambda: _env("GROQ_API_KEY", ""))
    groq_model: str = field(default_factory=lambda: _env("RAGSEAL_GROQ_MODEL", "llama-3.3-70b-versatile"))
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

    @property
    def judge_mode(self) -> str:
        return "hosted" if self.groq_api_key else "local"

    @property
    def judge_model(self) -> str:
        return self.groq_model if self.groq_api_key else self.judge_model_local


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
