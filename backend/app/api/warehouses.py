from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.services.csv_export import rows_to_csv_response
from app.services.filter_utils import _build_filter_clause, where_or_and
from app.services.sql_fragments import enriched_cte
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/warehouses", tags=["warehouses"])


def _breakdown_sql(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status)
    return f"""
WITH {enriched_cte()}
SELECT
    COALESCE(NULLIF(TRIM(PYROPS_LOCATION), ''), 'UNKNOWN') AS warehouse,
    COUNT(*) AS total_devices,
    SUM(CASE WHEN STATUS_NORMALIZED = 'IN_WAREHOUSE' THEN 1 ELSE 0 END) AS in_warehouse,
    SUM(CASE WHEN STATUS_NORMALIZED = 'IDLE' THEN 1 ELSE 0 END) AS idle,
    SUM(CASE WHEN STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS lost,
    SUM(CASE WHEN STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS written_off,
    SUM(CASE WHEN AGING_BUCKET = '365+' THEN 1 ELSE 0 END) AS aged_365_plus,
    SUM(CASE WHEN HOLDER_BUCKET = 'wiom_warehouse' THEN 1 ELSE 0 END) AS currently_in_wiom_custody
FROM enriched{where_or_and(fc, existing_where=False)}
GROUP BY 1
ORDER BY total_devices DESC
"""


@router.get("/breakdown")
def get_warehouse_breakdown(
    limit: int = 100,
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    """PYROPS_LOCATION-wise device health - which warehouse is sitting on the
    most idle/aged stock."""
    rows = client.query(_breakdown_sql(device_type, holder_bucket, status))
    return {"rows": rows[:limit], "total_warehouses": len(rows)}


@router.get("/breakdown.csv")
def export_warehouse_breakdown_csv(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> Response:
    rows = client.query(_breakdown_sql(device_type, holder_bucket, status))
    return rows_to_csv_response(rows, "warehouse_breakdown.csv")
