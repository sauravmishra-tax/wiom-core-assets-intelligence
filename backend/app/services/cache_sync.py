"""Warehouse-cache refresh: manual (button) or scheduled (daily 9 AM IST).

Replaces the old approach of every query silently going stale after a fixed
5-minute TTL with no visibility into when data was last pulled. Now:
  - the cache TTL itself is just a long-lived safety net (see config.py),
  - a background thread clears the whole cache every day at 9:00 AM
    Asia/Kolkata,
  - and a manual "Refresh data" button (POST /api/cache/refresh) clears it
    on demand, so "how current is this number" always has a real answer via
    GET /api/cache/status.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.services.warehouse_client import get_warehouse_client

IST = ZoneInfo("Asia/Kolkata")
DAILY_SYNC_HOUR = 9

_lock = threading.Lock()
_last_synced_at: datetime | None = None
_last_synced_reason: str | None = None
_scheduler_started = False


def get_status() -> dict:
    with _lock:
        return {
            "last_synced_at": _last_synced_at.isoformat() if _last_synced_at else None,
            "last_synced_reason": _last_synced_reason,
            "daily_sync_hour_ist": DAILY_SYNC_HOUR,
        }


def refresh_now(reason: str = "manual") -> datetime:
    global _last_synced_at, _last_synced_reason
    get_warehouse_client().invalidate_all()
    now = datetime.now(IST)
    with _lock:
        _last_synced_at = now
        _last_synced_reason = reason
    return now


def _seconds_until_next_9am() -> float:
    now = datetime.now(IST)
    target = now.replace(hour=DAILY_SYNC_HOUR, minute=0, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return (target - now).total_seconds()


def _scheduler_loop() -> None:
    while True:
        time.sleep(_seconds_until_next_9am())
        refresh_now(reason="scheduled_9am_ist")


def start_scheduler() -> None:
    """Idempotent - safe to call more than once (e.g. under a dev reloader)."""
    global _scheduler_started
    with _lock:
        if _scheduler_started:
            return
        _scheduler_started = True
    thread = threading.Thread(target=_scheduler_loop, daemon=True, name="cache-daily-sync")
    thread.start()
