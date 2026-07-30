from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import require_admin
from app.services import audit_log, query_store
from app.services.warehouse_client import get_warehouse_client

router = APIRouter(prefix="/api/schema-config", tags=["schema-config"])


class QueryUpdate(BaseModel):
    sql: str


@router.get("")
def list_queries(_admin: dict = Depends(require_admin)) -> dict:
    return query_store.get_all()


@router.put("/{name}")
def update_query(name: str, body: QueryUpdate, admin: dict = Depends(require_admin)) -> dict:
    try:
        query_store.set_query(name, body.sql)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    get_warehouse_client().invalidate_all()
    audit_log.log_event(admin["email"], "schema_query_updated", name)
    return query_store.get_all()[name]


@router.post("/{name}/reset")
def reset_query(name: str, admin: dict = Depends(require_admin)) -> dict:
    try:
        query_store.reset_query(name)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    get_warehouse_client().invalidate_all()
    audit_log.log_event(admin["email"], "schema_query_reset", name)
    return query_store.get_all()[name]


@router.post("/{name}/test")
def test_query(name: str, body: QueryUpdate, _admin: dict = Depends(require_admin)) -> dict:
    """Dry-run a candidate query (without saving) so the UI can show row count
    / errors before committing it. Only meaningful for "statement" fragments -
    "expression" fragments (CASE snippets) reference join aliases (sl., re.,
    d.) that only exist inside the full enriched CTE, so they can't be
    tested in isolation; save and check a dashboard page instead.
    """
    try:
        kind = query_store.kind_of(name)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    try:
        query_store._assert_read_only(body.sql, kind)  # noqa: SLF001 - intentional reuse
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if kind != "statement":
        raise HTTPException(
            status_code=400,
            detail="Expressions can't be dry-run standalone - save, then check a dashboard page.",
        )

    client = get_warehouse_client()
    try:
        rows = client.query(f"SELECT COUNT(*) AS row_count FROM ({body.sql}) t", use_cache=False)
    except Exception as e:  # noqa: BLE001 - surface the Snowflake error to the UI
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"row_count": rows[0]["ROW_COUNT"] if rows else 0}
