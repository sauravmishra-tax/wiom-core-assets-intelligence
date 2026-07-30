"""Append-only audit log for the actions that actually matter on a
multi-editor ops tool: who changed the live SQL that drives every dashboard
number, and who added/removed a login. Previously neither had any record at
all - a bad schema-config edit or a malicious user deletion was untraceable."""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

_STORE_PATH = Path(__file__).resolve().parent.parent / "data" / "audit_log.json"
_lock = threading.Lock()
_MAX_ENTRIES = 2000


def _load() -> list[dict]:
    if not _STORE_PATH.exists():
        return []
    with open(_STORE_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save(entries: list[dict]) -> None:
    _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(entries[-_MAX_ENTRIES:], f, indent=2)


def log_event(actor: str, action: str, details: str = "") -> None:
    with _lock:
        entries = _load()
        entries.append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "actor": actor,
                "action": action,
                "details": details,
            }
        )
        _save(entries)


def list_events(limit: int = 200) -> list[dict]:
    entries = _load()
    return list(reversed(entries))[:limit]
