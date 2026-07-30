from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.services.csv_export import rows_to_csv_response
from app.services.filter_utils import _build_filter_clause
from app.services.sql_fragments import enriched_cte
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/vintage", tags=["vintage"])

_MATRIX_SQL = f"""
WITH {enriched_cte()}
SELECT
    INVOICE_YEAR,
    DEVICE_TYPE_NORMALIZED,
    COUNT(*) AS total_purchased,
    SUM(CASE WHEN STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS written_off,
    SUM(CASE WHEN STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS lost,
    SUM(CASE WHEN STATUS_NORMALIZED IN ('WRITTEN_OFF', 'LOST') THEN 1 ELSE 0 END) AS written_off_or_lost,
    SUM(CASE WHEN STATUS_NORMALIZED = 'DEPLOYED' THEN 1 ELSE 0 END) AS still_deployed,
    SUM(CASE WHEN STATUS_NORMALIZED = 'INSTALLED' THEN 1 ELSE 0 END) AS still_installed,
    SUM(CASE WHEN AGING_BUCKET = '365+' THEN 1 ELSE 0 END) AS aged_365_plus
FROM enriched
WHERE INVOICE_YEAR IS NOT NULL
GROUP BY 1, 2
ORDER BY 1 DESC, 2
"""

_COVERAGE_SQL = f"""
WITH {enriched_cte()}
SELECT
    COUNT(*) AS total_devices,
    SUM(CASE WHEN INVOICE_YEAR IS NOT NULL THEN 1 ELSE 0 END) AS with_invoice_date
FROM enriched
"""


def _with_rates(rows: list[dict]) -> list[dict]:
    out = []
    for row in rows:
        total = row["TOTAL_PURCHASED"] or 0
        wo_or_lost = row["WRITTEN_OFF_OR_LOST"] or 0
        out.append(
            {
                **row,
                "written_off_or_lost_rate_pct": round(100 * wo_or_lost / total, 1) if total else 0,
            }
        )
    return out


@router.get("/writeoff-matrix")
def get_writeoff_vintage_matrix(
    device_type: str | None = Query(None),
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    """Purchase-year (invoice_date) x device-type cut of write-off/lost rates.

    Only covers devices with FIRST_GRN_DETAIL populated (~61% of the fleet as
    of last check) - invoice_date lives inside that JSON blob and isn't
    captured for older/other-source records.
    """
    extra = _build_filter_clause(device_type=device_type)
    # Append filter after the existing WHERE clause
    matrix_sql = _MATRIX_SQL.replace(
        "WHERE INVOICE_YEAR IS NOT NULL",
        f"WHERE INVOICE_YEAR IS NOT NULL {extra}",
    )
    coverage_sql = _COVERAGE_SQL + (f" WHERE {extra.lstrip('AND ').lstrip()}" if extra else "")
    rows = client.query(matrix_sql)
    coverage = client.query(coverage_sql)[0]
    return {
        "coverage": {
            "total_devices": coverage["TOTAL_DEVICES"],
            "with_invoice_date": coverage["WITH_INVOICE_DATE"],
            "coverage_pct": round(100 * coverage["WITH_INVOICE_DATE"] / coverage["TOTAL_DEVICES"], 1),
        },
        "rows": _with_rates(rows),
    }


@router.get("/writeoff-matrix.csv")
def export_writeoff_vintage_matrix_csv(
    device_type: str | None = Query(None),
    client: WarehouseClient = Depends(get_warehouse_client),
) -> Response:
    extra = _build_filter_clause(device_type=device_type)
    matrix_sql = _MATRIX_SQL.replace(
        "WHERE INVOICE_YEAR IS NOT NULL",
        f"WHERE INVOICE_YEAR IS NOT NULL {extra}",
    )
    rows = _with_rates(client.query(matrix_sql))
    return rows_to_csv_response(rows, "vintage_writeoff_matrix.csv")
