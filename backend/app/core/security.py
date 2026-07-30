"""FastAPI dependencies enforcing auth server-side.

Previously login was a frontend-only sessionStorage flag - any endpoint
could be called directly (curl/Postman) with zero auth. These dependencies
require a valid bearer token (issued by /api/auth/login) on every protected
route, and require_admin further requires the admin role."""

from __future__ import annotations

from fastapi import Header, HTTPException

from app.services import session_store


def require_auth(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")
    token = authorization.removeprefix("Bearer ").strip()
    session = session_store.get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired or invalid - please sign in again.")
    return session


def require_admin(authorization: str | None = Header(default=None)) -> dict:
    session = require_auth(authorization)
    if session["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin role required for this action.")
    return session
