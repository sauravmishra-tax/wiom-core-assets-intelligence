"""Snowflake access via the Metabase REST API.

Kept behind this single class so the rest of the app never imports httpx or
knows about Metabase at all. Swapping to a native Snowflake connector later
means rewriting only `_execute_raw` here.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import time
from dataclasses import dataclass
from threading import Lock
from typing import Any

import httpx

from app.core.config import get_settings


class WarehouseQueryError(RuntimeError):
    """Raised when the underlying Metabase/Snowflake query fails."""


@dataclass
class _CacheEntry:
    expires_at: float
    rows: list[dict[str, Any]]


class WarehouseClient:
    def __init__(self) -> None:
        settings = get_settings()
        self._settings = settings
        self._client = httpx.Client(
            base_url=settings.metabase_url,
            timeout=settings.request_timeout_seconds,
        )
        self._cache: dict[str, _CacheEntry] = {}
        self._cache_lock = Lock()

    def _headers(self) -> dict[str, str]:
        return {
            "X-Api-Key": self._settings.metabase_api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _cache_key(self, sql: str) -> str:
        return hashlib.sha256(sql.encode()).hexdigest()

    def query(self, sql: str, *, use_cache: bool = True) -> list[dict[str, Any]]:
        """Run a single read-only SQL statement, return rows as dicts."""
        key = self._cache_key(sql)

        if use_cache:
            with self._cache_lock:
                entry = self._cache.get(key)
                if entry and entry.expires_at > time.monotonic():
                    return entry.rows

        rows = self._execute_raw(sql)

        if use_cache:
            with self._cache_lock:
                self._cache[key] = _CacheEntry(
                    expires_at=time.monotonic() + self._settings.query_cache_ttl_seconds,
                    rows=rows,
                )
        return rows

    def _execute_raw(self, sql: str) -> list[dict[str, Any]]:
        resp = self._client.post(
            "/api/dataset",
            headers=self._headers(),
            json={
                "type": "native",
                "native": {"query": sql},
                "database": self._settings.metabase_database_id,
            },
        )
        if resp.status_code >= 400:
            raise WarehouseQueryError(f"Metabase HTTP {resp.status_code}: {resp.text[:600]}")

        payload = resp.json()
        if payload.get("status") == "failed" or payload.get("error"):
            raise WarehouseQueryError(payload.get("error") or "unknown query error")

        data = payload.get("data") or {}
        cols = [c.get("name") for c in data.get("cols") or []]
        rows = data.get("rows") or []
        return [dict(zip(cols, row)) for row in rows]

    def invalidate_all(self) -> None:
        with self._cache_lock:
            self._cache.clear()

    def query_csv(self, sql: str) -> str:
        """Run SQL via Metabase's dedicated CSV export endpoint.

        Unlike /api/dataset (used by `query`), this bypasses Metabase's
        ~2000-row display cap and returns the full result set - the right
        tool for bulk device-level exports.

        Uses its own (much longer) timeout, not the client's default
        request_timeout_seconds (60s): a full device-level export (~375k
        rows) measurably takes ~100s to generate, so the default timeout was
        firing mid-request and surfacing as a 500 to the user every time -
        not an actual server error, just this call giving up too early.
        """
        resp = self._client.post(
            "/api/dataset/csv",
            headers={"X-Api-Key": self._settings.metabase_api_key},
            data={
                "query": json.dumps(
                    {
                        "type": "native",
                        "native": {"query": sql},
                        "database": self._settings.metabase_database_id,
                    }
                )
            },
            timeout=self._settings.bulk_export_timeout_seconds,
        )
        if resp.status_code >= 400:
            raise WarehouseQueryError(f"Metabase CSV export HTTP {resp.status_code}: {resp.text[:600]}")
        return resp.text

    def query_rows_unbounded(self, sql: str) -> list[dict[str, Any]]:
        """Like `query`, but via the CSV endpoint so results aren't capped at
        ~2000 rows. Use for any listing whose row count can plausibly grow
        past that cap (e.g. the partner leaderboard) - `query` is fine for
        single-row aggregates, which Metabase never truncates."""
        reader = csv.DictReader(io.StringIO(self.query_csv(sql)))
        rows: list[dict[str, Any]] = []
        for raw_row in reader:
            row: dict[str, Any] = {}
            for key, value in raw_row.items():
                if value == "" or value is None:
                    row[key] = None
                    continue
                try:
                    row[key] = int(value)
                except ValueError:
                    try:
                        row[key] = float(value)
                    except ValueError:
                        row[key] = value
            rows.append(row)
        return rows


_client: WarehouseClient | None = None


def get_warehouse_client() -> WarehouseClient:
    global _client
    if _client is None:
        _client = WarehouseClient()
    return _client
