from fastapi import APIRouter, Depends

from app.core.security import require_auth
from app.services import audit_log, cache_sync

router = APIRouter(prefix="/api/cache", tags=["cache"])


@router.get("/status")
def get_cache_status(_session: dict = Depends(require_auth)) -> dict:
    return cache_sync.get_status()


@router.post("/refresh")
def refresh_cache(session: dict = Depends(require_auth)) -> dict:
    """Manual refresh - any logged-in user can pull fresh numbers on demand,
    not just admins (it's non-destructive, just clears the query cache)."""
    ts = cache_sync.refresh_now(reason=f"manual by {session['email']}")
    audit_log.log_event(session["email"], "cache_refreshed")
    return {"refreshed_at": ts.isoformat()}
