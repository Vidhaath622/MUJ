"""Password hashing (bcrypt) and JWT access tokens (HS256)."""

from __future__ import annotations

import datetime as dt

import bcrypt
import jwt

ALGORITHM = "HS256"
DEMO_EMAIL = "demo@ragseal.dev"
DEMO_PASSWORD = "demo1234"


def hash_password(password: str) -> str:
    # bcrypt only uses the first 72 bytes and bcrypt>=5 raises on longer input.
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], password_hash.encode())
    except ValueError:
        return False


def create_token(user_id: str, secret: str, ttl_hours: int) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + dt.timedelta(hours=ttl_hours)}
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def decode_token(token: str, secret: str) -> str | None:
    """Return the user id in a valid token, or None."""
    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM], options={"require": ["sub", "exp"]})
    except jwt.PyJWTError:
        return None
    return payload.get("sub")
