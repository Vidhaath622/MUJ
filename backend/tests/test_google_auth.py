import dataclasses

import pytest

from app import google_auth

CLIENT_ID = "test-client.apps.googleusercontent.com"


@pytest.fixture
def google(client, monkeypatch):
    """Google sign-in configured, with the token verifier replaced by a table of fake credentials."""
    client.app.state.settings = dataclasses.replace(client.app.state.settings, google_client_id=CLIENT_ID)
    tokens = {}

    def fake_verify(credential, client_id):
        assert client_id == CLIENT_ID
        if credential not in tokens:
            raise google_auth.GoogleTokenError("invalid Google credential: bad signature")
        return tokens[credential]

    monkeypatch.setattr(google_auth, "verify_google_token", fake_verify)
    return tokens


def _login(client, credential):
    return client.post("/api/auth/google", json={"credential": credential})


def test_not_configured_is_503(client):
    assert _login(client, "x" * 20).status_code == 503


def test_new_google_user_then_same_user_again(client, google):
    google["tok-alice-1"] = {"sub": "g-111", "email": "Alice@Example.com", "email_verified": True}
    first = _login(client, "tok-alice-1")
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["token_type"] == "bearer" and body["user"]["email"] == "alice@example.com"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json() == body["user"]
    google["tok-alice-2"] = {"sub": "g-111", "email": "alice@example.com", "email_verified": True}
    assert _login(client, "tok-alice-2").json()["user"]["id"] == body["user"]["id"]
    # A Google-only account has no password.
    resp = client.post("/api/auth/login", json={"email": "alice@example.com", "password": "anything123"})
    assert resp.status_code == 401 and "Google" in resp.json()["detail"]


def test_existing_password_account_is_linked(client, google):
    resp = client.post("/api/auth/register", json={"email": "bob@example.com", "password": "secret123"})
    assert resp.status_code == 200, resp.text
    registered = resp.json()
    google["tok-bob-001"] = {"sub": "g-222", "email": "bob@example.com", "email_verified": True}
    resp = _login(client, "tok-bob-001")
    assert resp.status_code == 200, resp.text
    linked = resp.json()
    assert linked["user"]["id"] == registered["user"]["id"]
    assert client.post("/api/auth/login", json={"email": "bob@example.com", "password": "secret123"}).status_code == 200
    assert client.app.state.db.google_sub_of(registered["user"]["id"]) == "g-222"


def test_email_linked_to_another_google_account_is_refused(client, google):
    google["tok-carol-a"] = {"sub": "g-333", "email": "carol@example.com", "email_verified": True}
    google["tok-carol-b"] = {"sub": "g-999", "email": "carol@example.com", "email_verified": True}
    assert _login(client, "tok-carol-a").status_code == 200
    assert _login(client, "tok-carol-b").status_code == 409


def test_invalid_credential_is_401(client, google):
    resp = _login(client, "not-a-real-token-123")
    assert resp.status_code == 401 and "invalid Google credential" in resp.json()["detail"]
    assert client.post("/api/auth/google", json={}).status_code == 422


def test_verifier_checks_audience_and_verified_email(monkeypatch):
    from google.oauth2 import id_token

    seen = {}

    def fake(credential, request, audience):
        seen["audience"] = audience
        return claims

    monkeypatch.setattr(id_token, "verify_oauth2_token", fake)
    claims = {"sub": "g-1", "email": "a@example.com", "email_verified": True}
    assert google_auth.verify_google_token("cred", CLIENT_ID)["sub"] == "g-1" and seen["audience"] == CLIENT_ID
    claims = {"sub": "g-1", "email": "a@example.com", "email_verified": False}
    with pytest.raises(google_auth.GoogleTokenError, match="not verified"):
        google_auth.verify_google_token("cred", CLIENT_ID)

    def rejects(credential, request, audience):
        raise ValueError("Token has wrong audience")

    monkeypatch.setattr(id_token, "verify_oauth2_token", rejects)
    with pytest.raises(google_auth.GoogleTokenError, match="wrong audience"):
        google_auth.verify_google_token("cred", CLIENT_ID)
