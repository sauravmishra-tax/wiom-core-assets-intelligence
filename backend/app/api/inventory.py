from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.services.csv_export import rows_to_csv_response
from app.services.filter_utils import _build_filter_clause, where_or_and
from app.services.sql_fragments import enriched_cte
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


def _breakdown_sql(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status)
    return f"""
WITH {enriched_cte()}
SELECT
    GRN_SOURCE_BUCKET,
    DISPATCH_BUCKET,
    HOLDER_BUCKET,
    STATUS_NORMALIZED,
    COUNT(*) AS device_count
FROM enriched{where_or_and(fc, existing_where=False)}
GROUP BY 1, 2, 3, 4
ORDER BY device_count DESC
"""


@router.get("/breakdown")
def get_inventory_breakdown(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    """GRN source x dispatch x holder cross-tab, matching the Fresh GRN /
    SSOT & CSP / Other split from the original reconciliation SQL."""
    rows = client.query(_breakdown_sql(device_type, holder_bucket, status))

    by_source: dict[str, int] = {}
    for row in rows:
        source = row["GRN_SOURCE_BUCKET"]
        by_source[source] = by_source.get(source, 0) + row["DEVICE_COUNT"]

    return {"by_source": by_source, "detail": rows}


@router.get("/breakdown.csv")
def export_inventory_breakdown_csv(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> Response:
    rows = client.query(_breakdown_sql(device_type, holder_bucket, status))
    return rows_to_csv_response(rows, "inventory_breakdown.csv")


@router.get("/new-grn")
def get_new_grn(
    limit: int = 200,
    offset: int = 0,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    """Full record list for freshly-inbound devices (DATA_SOURCE = inbound_inward_devices)."""
    sql = f"""
    WITH {enriched_cte()}
    SELECT
        DEVICE_ID, MAC_ID, SERIAL, MODEL, DEVICE_TYPE,
        FIRST_GRN_DATE, CURRENT_LOCATION_RESOLVED, STATUS_NORMALIZED
    FROM enriched
    WHERE GRN_SOURCE_BUCKET = 'fresh_grn'
    ORDER BY FIRST_GRN_DATE DESC NULLS LAST
    LIMIT {int(limit)} OFFSET {int(offset)}
    """
    rows = client.query(sql, use_cache=False)
    return {"rows": rows, "limit": limit, "offset": offset}


@router.get("/new-grn.csv")
def export_new_grn_csv(client: WarehouseClient = Depends(get_warehouse_client)) -> Response:
    """Full (unbounded) fresh-GRN export via Metabase's native CSV path -
    bypasses the 2000-row cap that /api/dataset applies to `new-grn` above."""
    sql = f"""
    WITH {enriched_cte()}
    SELECT
        DEVICE_ID, MAC_ID, SERIAL, MODEL, DEVICE_TYPE,
        FIRST_GRN_DATE, CURRENT_LOCATION_RESOLVED, STATUS_NORMALIZED
    FROM enriched
    WHERE GRN_SOURCE_BUCKET = 'fresh_grn'
    ORDER BY FIRST_GRN_DATE DESC NULLS LAST
    """
    csv_text = client.query_csv(sql)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="fresh_grn_full.csv"'},
    )
