from fastapi import APIRouter, Depends
from fastapi.responses import Response, StreamingResponse

from app.services.csv_export import rows_to_csv_response
from app.services.filter_utils import _build_filter_clause
from app.services.sql_fragments import enriched_cte
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/lost-devices", tags=["lost-devices"])

_LIST_COLUMNS = (
    "DEVICE_ID, MAC_ID, DEVICE_TYPE_NORMALIZED, STATUS_NORMALIZED, HOLDER_BUCKET, "
    "CURRENT_LOCATION, PARTNER_ACCOUNT_ID, CUSTOMER_ACCOUNT_ID, "
    "INVOICE_YEAR, AGING_BUCKET"
)


def _kpi_sql(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status)
    extra = f" {fc}" if fc else ""
    return f"""
WITH {enriched_cte()}
SELECT
    SUM(CASE WHEN STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS total_lost,
    SUM(CASE WHEN STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS total_written_off,
    SUM(CASE WHEN STATUS_NORMALIZED IN ('LOST', 'WRITTEN_OFF') THEN 1 ELSE 0 END) AS total_lost_or_wo
FROM enriched{' WHERE ' + fc.lstrip('AND ').lstrip() if fc else ''}
"""


def _by_device_type_sql(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status)
    return f"""
WITH {enriched_cte()}
SELECT
    DEVICE_TYPE_NORMALIZED,
    SUM(CASE WHEN STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS LOST,
    SUM(CASE WHEN STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS WRITTEN_OFF,
    SUM(CASE WHEN STATUS_NORMALIZED IN ('LOST', 'WRITTEN_OFF') THEN 1 ELSE 0 END) AS TOTAL
FROM enriched{' WHERE ' + fc.lstrip('AND ').lstrip() if fc else ''}
GROUP BY 1
ORDER BY TOTAL DESC
"""


def _by_holder_sql(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status)
    return f"""
WITH {enriched_cte()}
SELECT
    HOLDER_BUCKET,
    SUM(CASE WHEN STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS LOST,
    SUM(CASE WHEN STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS WRITTEN_OFF,
    SUM(CASE WHEN STATUS_NORMALIZED IN ('LOST', 'WRITTEN_OFF') THEN 1 ELSE 0 END) AS TOTAL
FROM enriched{' WHERE ' + fc.lstrip('AND ').lstrip() if fc else ''}
GROUP BY 1
HAVING LOST > 0 OR WRITTEN_OFF > 0
ORDER BY TOTAL DESC
"""


def _by_invoice_year_sql(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status)
    extra = f" {fc}" if fc else ""
    return f"""
WITH {enriched_cte()}
SELECT
    INVOICE_YEAR,
    SUM(CASE WHEN STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS LOST,
    SUM(CASE WHEN STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS WRITTEN_OFF,
    SUM(CASE WHEN STATUS_NORMALIZED IN ('LOST', 'WRITTEN_OFF') THEN 1 ELSE 0 END) AS TOTAL
FROM enriched
WHERE INVOICE_YEAR IS NOT NULL{extra}
GROUP BY 1
ORDER BY 1 DESC
"""

_EXPORT_SQL = f"""
WITH {enriched_cte()}
SELECT *
FROM enriched
WHERE STATUS_NORMALIZED IN ('LOST', 'WRITTEN_OFF')
"""


def _list_where(
    device_type: str | None,
    holder_bucket: str | None,
    status: str | None,
    search: str | None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status)
    clauses = ["STATUS_NORMALIZED IN ('LOST', 'WRITTEN_OFF')"]
    if fc:
        clauses.append(fc.lstrip("AND ").lstrip())
    if search:
        needle = search.replace("'", "''")
        clauses.append(
            f"(DEVICE_ID ILIKE '%{needle}%' OR MAC_ID ILIKE '%{needle}%' "
            f"OR PARTNER_ACCOUNT_ID ILIKE '%{needle}%' OR CUSTOMER_ACCOUNT_ID ILIKE '%{needle}%')"
        )
    return " AND ".join(clauses)


def _list_sql(
    device_type: str | None,
    holder_bucket: str | None,
    status: str | None,
    search: str | None,
    limit: int,
    offset: int,
) -> str:
    # COUNT(*) OVER() rides along on the same scan instead of a second full
    # pass over ~87k rows via a separate query - two sequential full scans
    # of `enriched` (a wide multi-join CTE) was pushing past the client's
    # default request timeout and surfacing as a 500.
    where = _list_where(device_type, holder_bucket, status, search)
    return f"""
WITH {enriched_cte()}
SELECT {_LIST_COLUMNS}, COUNT(*) OVER() AS total_count
FROM enriched
WHERE {where}
ORDER BY DEVICE_ID
LIMIT {limit} OFFSET {offset}
"""


@router.get("/summary")
def get_lost_devices_summary(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    """Lost and written-off device KPIs with breakdowns by device type, holder, and invoice year."""
    kpi_rows = client.query(_kpi_sql(device_type, holder_bucket, status))
    kpis = kpi_rows[0] if kpi_rows else {}
    by_device_type = client.query(_by_device_type_sql(device_type, holder_bucket, status))
    by_holder = client.query(_by_holder_sql(device_type, holder_bucket, status))
    by_invoice_year = client.query(_by_invoice_year_sql(device_type, holder_bucket, status))
    return {
        "total_lost": kpis.get("TOTAL_LOST"),
        "total_written_off": kpis.get("TOTAL_WRITTEN_OFF"),
        "total_lost_or_wo": kpis.get("TOTAL_LOST_OR_WO"),
        "by_device_type": by_device_type,
        "by_holder": by_holder,
        "by_invoice_year": by_invoice_year,
    }


@router.get("/list")
def get_lost_devices_list(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    search: str | None = None,
    limit: int = 100,
    offset: int = 0,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    """Paginated device-level list backing the on-screen table - export.csv
    stays the unbounded full dump, this is for browsing/searching a page at
    a time without pulling all ~87k lost/written-off rows into the browser."""
    # client.query() caches rows by reference (see WarehouseClient) - mutating
    # a returned row dict (e.g. popping a key) would corrupt the cache for
    # every subsequent identical request, so build fresh dicts here instead
    # of stripping TOTAL_COUNT from the cached ones in place.
    raw_rows = client.query(_list_sql(device_type, holder_bucket, status, search, limit, offset))
    total = raw_rows[0]["TOTAL_COUNT"] if raw_rows else 0
    rows = [{k: v for k, v in row.items() if k != "TOTAL_COUNT"} for row in raw_rows]
    return {"rows": rows, "total": total, "limit": limit, "offset": offset}


@router.get("/export.csv")
def export_lost_devices_csv(client: WarehouseClient = Depends(get_warehouse_client)) -> Response:
    """Full device-level export of all lost and written-off devices (unbounded, uses CSV endpoint)."""
    csv_text = client.query_csv(_EXPORT_SQL)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="lost_devices_export.csv"'},
    )
