from .conftest import auth_headers, register


def test_register_login_me(client):
    body = register(client, "Carol@Example.com")
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "carol@example.com"
    assert body["user"]["id"].startswith("usr_")

    login = client.post("/api/auth/login", json={"email": "carol@example.com", "password": "secret123"})
    assert login.status_code == 200
    token = login.json()["access_token"]

    me = client.get("/api/auth/me", headers=auth_headers(token))
    assert me.status_code == 200
    assert me.json() == body["user"]


def test_duplicate_register_is_409(client):
    register(client, "dup@example.com")
    resp = client.post("/api/auth/register", json={"email": "dup@example.com", "password": "secret123"})
    assert resp.status_code == 409
    assert isinstance(resp.json()["detail"], str)


def test_register_validation(client):
    bad_email = client.post("/api/auth/register", json={"email": "not-an-email", "password": "secret123"})
    short_pw = client.post("/api/auth/register", json={"email": "x@example.com", "password": "123"})
    assert bad_email.status_code == 422
    assert short_pw.status_code == 422
    assert "password" in short_pw.json()["detail"]


def test_bad_login_is_401(client):
    register(client, "eve@example.com")
    wrong = client.post("/api/auth/login", json={"email": "eve@example.com", "password": "nope-nope"})
    unknown = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "secret123"})
    assert wrong.status_code == 401
    assert unknown.status_code == 401


def test_demo_user_is_seeded(client):
    resp = client.post("/api/auth/login", json={"email": "demo@ragseal.dev", "password": "demo1234"})
    assert resp.status_code == 200
    assert resp.json()["user"]["email"] == "demo@ragseal.dev"


def test_protected_routes_need_token(client):
    for method, path in [
        ("get", "/api/auth/me"),
        ("get", "/api/documents"),
        ("get", "/api/packs"),
        ("get", "/api/runs"),
        ("post", "/api/rag/ask"),
        ("post", "/api/evaluate/query"),
        ("post", "/api/evaluate/batch"),
        ("post", "/api/synthetic/generate"),
    ]:
        resp = getattr(client, method)(path)
        assert resp.status_code == 401, path


def test_garbage_token_is_401(client):
    resp = client.get("/api/auth/me", headers=auth_headers("not.a.jwt"))
    assert resp.status_code == 401


def test_jwt_secret_persisted_when_env_missing(app, tmp_path):
    assert (tmp_path / ".jwt_secret").read_text().strip() == app.state.settings.jwt_secret
