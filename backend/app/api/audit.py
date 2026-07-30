from fastapi import APIRouter, Depends

from app.core.security import require_admin
from app.services import audit_log

router = APIRouter(prefix="/api/audit-log", tags=["audit-log"])


@router.get("")
def get_audit_log(limit: int = 200, _admin: dict = Depends(require_admin)) -> dict:
    return {"entries": audit_log.list_events(limit)}
