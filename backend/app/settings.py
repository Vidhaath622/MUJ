"""Backend settings, read from the environment when the app is created."""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from .engine_bridge import BACKEND_DIR

DEFAULT_CORS_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_SYNTHETIC_COUNT = 20


@dataclass(frozen=True)
class AppSettings:
    data_dir: Path
    jwt_secret: str
    cors_origins: tuple[str, ...]
    token_ttl_hours: int = 72

    @property
    def db_path(self) -> Path:
        return self.data_dir / "app.sqlite"

    @property
    def engine_data_dir(self) -> Path:
        return self.data_dir / "engine"


def _jwt_secret(data_dir: Path) -> str:
    secret = os.environ.get("JWT_SECRET", "").strip()
    if secret:
        return secret
    path = data_dir / ".jwt_secret"
    if path.exists():
        return path.read_text().strip()
    secret = secrets.token_hex(32)
    path.write_text(secret)
    path.chmod(0o600)
    return secret


def load_settings() -> AppSettings:
    data_dir = Path(os.environ.get("RAGSEAL_BACKEND_DATA") or BACKEND_DIR / "data").expanduser().resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    extra = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
    origins = tuple(dict.fromkeys([*DEFAULT_CORS_ORIGINS, *extra]))
    return AppSettings(data_dir=data_dir, jwt_secret=_jwt_secret(data_dir), cors_origins=origins)
