"""The single place the backend imports the RAGSeal engine from.

backend/.env is loaded first because the engine reads its settings (GROQ_API_KEY,
OLLAMA_HOST_URL, ...) from the environment, and RAGSEAL_ENGINE_PATH may live there too.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BACKEND_DIR / ".env", override=False)


def _add_engine_to_path() -> None:
    # Separate worktree during development; the repo root after the branches merge.
    engine_root = os.environ.get("RAGSEAL_ENGINE_PATH") or str(BACKEND_DIR.parent)
    engine_root = str(Path(engine_root).expanduser().resolve())
    if engine_root not in sys.path:
        sys.path.insert(0, engine_root)


_add_engine_to_path()

from engine import (  # noqa: E402
    Engine,
    JudgeError,
    ModelUnavailable,
    NotFound,
    PackError,
    UnsupportedFile,
)

__all__ = ["BACKEND_DIR", "Engine", "JudgeError", "ModelUnavailable", "NotFound", "PackError", "UnsupportedFile"]
