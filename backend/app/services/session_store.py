"""Bearer-token sessions, backed by a JSON file so they survive a dev-server
restart (this app restarts often during development). Not JWT - just an
opaque random token mapped to {email, role, expires_at} server-side, which
is the simplest thing that lets every API route actually require auth
(previously: AuthGate.tsx was a sessionStorage flag with NO backend
enforcement at all - anyone could hit /api/* directly)."""

from __future__ import annotations

import json
import secrets
import threading
import time
from pathlib import Path

_STORE_PATH = Path(__file__).resolve().parent.parent / "data" / "sessions.json"
_lock = threading.Lock()
_TTL_SECONDS = 12 * 60 * 60  # 12h


def _load() -> dict[str, dict]:
    if not _STORE_PATH.exists():
        return {}
    with open(_STORE_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save(sessions: dict[str, dict]) -> None:
    _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(sessions, f, indent=2)


def _prune(sessions: dict[str, dict]) -> dict[str, dict]:
    now = time.time()
    return {tok: s for tok, s in sessions.items() if s["expires_at"] > now}


def create_session(email: str, role: str) -> str:
    token = secrets.token_urlsafe(32)
    with _lock:
        sessions = _prune(_load())
        sessions[token] = {"email": email, "role": role, "expires_at": time.time() + _TTL_SECONDS}
        _save(sessions)
    return token


def get_session(token: str) -> dict | None:
    sessions = _prune(_load())
    return sessions.get(token)


def delete_session(token: str) -> None:
    with _lock:
        sessions = _load()
        sessions.pop(token, None)
        _save(sessions)
