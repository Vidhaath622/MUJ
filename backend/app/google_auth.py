"""Verifying Google Sign-In ID tokens (the `credential` the Google button returns to the browser)."""

from __future__ import annotations


class GoogleTokenError(ValueError):
    pass


def verify_google_token(credential: str, client_id: str) -> dict:
    """Claims of a valid Google ID token issued for our client ID; raises GoogleTokenError otherwise.

    google-auth checks the signature against Google's public keys, the audience, the issuer
    and the expiry. Tests replace this function.
    """
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        claims = id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)
    except ValueError as exc:
        raise GoogleTokenError(f"invalid Google credential: {exc}") from exc
    if not claims.get("email") or not claims.get("sub"):
        raise GoogleTokenError("the Google token has no email or subject")
    if claims.get("email_verified") is not True:
        raise GoogleTokenError("the Google account's email is not verified")
    return claims
