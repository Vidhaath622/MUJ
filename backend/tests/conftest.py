import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Importing app.main builds a module-level app; keep its data out of backend/data.
os.environ["RAGSEAL_BACKEND_DATA"] = tempfile.mkdtemp(prefix="ragseal-test-")

# During development the engine lives in a sibling worktree; after the merge it is at the repo root.
if not os.environ.get("RAGSEAL_ENGINE_PATH") and not (BACKEND_DIR.parent / "engine").is_dir():
    sibling = BACKEND_DIR.parent.parent / "MUJ-engine"
    if (sibling / "engine").is_dir():
        os.environ["RAGSEAL_ENGINE_PATH"] = str(sibling)

sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient  # noqa: E402

from app.deps import get_engine  # noqa: E402
from app.main import create_app  # noqa: E402

from .fake_engine import FakeEngine  # noqa: E402


@pytest.fixture
def fake_engine():
    return FakeEngine()


@pytest.fixture
def app(tmp_path, monkeypatch, fake_engine):
    monkeypatch.setenv("RAGSEAL_BACKEND_DATA", str(tmp_path))
    monkeypatch.delenv("JWT_SECRET", raising=False)
    application = create_app()
    application.dependency_overrides[get_engine] = lambda: fake_engine
    return application


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


def register(client, email, password="secret123"):
    resp = client.post("/api/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def alice(client):
    body = register(client, "alice@example.com")
    return auth_headers(body["access_token"])


@pytest.fixture
def bob(client):
    body = register(client, "bob@example.com")
    return auth_headers(body["access_token"])
