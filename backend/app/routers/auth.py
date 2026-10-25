from fastapi import APIRouter, Depends, HTTPException, status

from .. import google_auth
from ..db import Database, User
from ..deps import get_current_user, get_db, get_settings
from ..schemas import GoogleLoginRequest, LoginRequest, RegisterRequest
from ..security import create_token, hash_password, verify_password
from ..settings import AppSettings

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(user: User, settings: AppSettings) -> dict:
    return {
        "access_token": create_token(user.id, settings.jwt_secret, settings.token_ttl_hours),
        "token_type": "bearer",
        "user": user.public(),
    }


@router.post("/register")
def register(
    body: RegisterRequest,
    db: Database = Depends(get_db),
    settings: AppSettings = Depends(get_settings),
) -> dict:
    if db.user_by_email(body.email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = db.create_user(body.email, hash_password(body.password))
    return _token_response(user, settings)


@router.post("/login")
def login(
    body: LoginRequest,
    db: Database = Depends(get_db),
    settings: AppSettings = Depends(get_settings),
) -> dict:
    found = db.user_by_email(body.email)
    if found is not None and found[1] is None:
        # A Google-only account has no password to check.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This account signs in with Google")
    if found is None or not verify_password(body.password, found[1]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return _token_response(found[0], settings)


@router.post("/google")
def google_login(
    body: GoogleLoginRequest,
    db: Database = Depends(get_db),
    settings: AppSettings = Depends(get_settings),
) -> dict:
    """Sign in with a Google ID token: find the user by Google subject, else by email, else create one."""
    if not settings.google_client_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in is not configured on this server")
    try:
        claims = google_auth.verify_google_token(body.credential, settings.google_client_id)
    except google_auth.GoogleTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    sub, email = claims["sub"], claims["email"].strip().lower()
    user = db.user_by_google_sub(sub)
    if user is None:
        found = db.user_by_email(email)
        if found is None:
            user = db.create_google_user(email, sub)
        else:
            user = found[0]
            linked = db.google_sub_of(user.id)
            if linked and linked != sub:
                raise HTTPException(status.HTTP_409_CONFLICT, "This email is linked to a different Google account")
            db.link_google(user.id, sub)  # an existing email/password account gains Google sign-in
    return _token_response(user, settings)


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict:
    return user.public()
