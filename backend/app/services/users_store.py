"""Simple JSON-backed user list for app login, with a role per user.

Passwords are hashed with PBKDF2-HMAC-SHA256 (stdlib hashlib, no new
dependency) + a random per-user salt. Roles: "admin" (can manage users and
edit Schema Config) vs "viewer" (read-only on both). Session/token
enforcement lives in app/core/security.py + app/services/session_store.py.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
import threading
from pathlib import Path

from app.core.config import get_settings

_STORE_PATH = Path(__file__).resolve().parent.parent / "data" / "users.json"
_lock = threading.Lock()

_PBKDF2_ITERATIONS = 260_000
VALID_ROLES = ("admin", "viewer")

_logger = logging.getLogger("waip.users_store")


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _PBKDF2_ITERATIONS).hex()


def _seed() -> dict[str, dict]:
    settings = get_settings()
    salt = secrets.token_hex(16)
    # ADMIN_SEED_PASSWORD used to be a hardcoded literal ("Wiom@Admin123") -
    # that string is now recorded in chat history/memory files, so it can no
    # longer be treated as a secret. Falling back to a freshly generated
    # random password (logged once, here, at seed time) instead of shipping
    # a fixed known credential in the source.
    password = settings.admin_seed_password
    if not password:
        password = secrets.token_urlsafe(18)
        _logger.warning(
            "No ADMIN_SEED_PASSWORD set - generated a random first-admin "
            "password for %s. Copy it from THIS log line now, it is not "
            "shown again: %s",
            settings.admin_seed_email,
            password,
        )
    return {
        settings.admin_seed_email.strip().lower(): {
            "salt": salt,
            "password_hash": _hash_password(password, salt),
            "role": "admin",
        }
    }


def _load() -> dict[str, dict]:
    if not _STORE_PATH.exists():
        seeded = _seed()
        _save(seeded)
        return seeded
    with open(_STORE_PATH, encoding="utf-8") as f:
        users = json.load(f)
    # backfill role for records created before roles existed
    changed = False
    for record in users.values():
        if "role" not in record:
            record["role"] = "admin"
            changed = True
    if changed:
        _save(users)
    return users


def _save(users: dict[str, dict]) -> None:
    _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)


def list_users() -> list[dict]:
    users = _load()
    return [{"email": email, "role": r["role"]} for email, r in sorted(users.items())]


def get_role(email: str) -> str | None:
    users = _load()
    record = users.get(email.strip().lower())
    return record["role"] if record else None


def add_user(email: str, password: str, role: str = "viewer") -> None:
    email = email.strip().lower()
    if not email or "@" not in email:
        raise ValueError("Enter a valid email address.")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")
    if role not in VALID_ROLES:
        raise ValueError(f"Role must be one of {VALID_ROLES}.")
    with _lock:
        users = _load()
        salt = secrets.token_hex(16)
        users[email] = {"salt": salt, "password_hash": _hash_password(password, salt), "role": role}
        _save(users)


def delete_user(email: str) -> None:
    email = email.strip().lower()
    with _lock:
        users = _load()
        if email not in users:
            raise KeyError(f"No user '{email}'.")
        if len(users) <= 1:
            raise ValueError("Can't delete the last remaining user.")
        if users[email]["role"] == "admin" and sum(1 for u in users.values() if u["role"] == "admin") <= 1:
            raise ValueError("Can't delete the last remaining admin.")
        del users[email]
        _save(users)


def verify_login(email: str, password: str) -> bool:
    email = email.strip().lower()
    users = _load()
    record = users.get(email)
    if not record:
        # still hash something so a nonexistent-email response takes the same
        # time as a wrong-password one (basic timing-attack mitigation)
        _hash_password(password, secrets.token_hex(16))
        return False
    return hmac.compare_digest(_hash_password(password, record["salt"]), record["password_hash"])
