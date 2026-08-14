"""Cohort View — Purchase FY × Write-off Year matrix.

Rows: Financial year of invoice (2015-16, 2016-17, …)
Cols: Year device was financially written off (2022-23, 2023-24, 2024-25, 2025-26, Not WO)

GET /api/cohort/matrix         — full cohort matrix raw data
GET /api/cohort/matrix.csv     — CSV export
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.services.csv_export import rows_to_csv_response
from app.services.sql_fragments import enriched_cte
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/cohort", tags=["cohort"])

def _matrix_sql() -> str:
    return f"""
WITH {enriched_cte()}
SELECT
    DEVICE_TYPE_NORMALIZED,
    CASE
        WHEN INVOICE_DATE IS NULL THEN 'Unknown'
        WHEN MONTH(INVOICE_DATE) >= 4 THEN YEAR(INVOICE_DATE)::VARCHAR || '-' || LPAD((YEAR(INVOICE_DATE) + 1 - 2000)::VARCHAR, 2, '0')
        ELSE (YEAR(INVOICE_DATE) - 1)::VARCHAR || '-' || LPAD((YEAR(INVOICE_DATE) - 2000)::VARCHAR, 2, '0')
    END AS PURCHASE_FY,
    CASE
        WHEN INVOICE_DATE IS NULL THEN 9999
        WHEN MONTH(INVOICE_DATE) >= 4 THEN YEAR(INVOICE_DATE)
        ELSE YEAR(INVOICE_DATE) - 1
    END AS PURCHASE_FY_SORT,
    CASE
        WHEN WRITE_OFF_DATE IS NULL THEN 'Not WO'
        WHEN MONTH(WRITE_OFF_DATE) >= 4
            THEN YEAR(WRITE_OFF_DATE)::VARCHAR || '-' || LPAD((YEAR(WRITE_OFF_DATE) + 1 - 2000)::VARCHAR, 2, '0')
        ELSE (YEAR(WRITE_OFF_DATE) - 1)::VARCHAR || '-' || LPAD((YEAR(WRITE_OFF_DATE) - 2000)::VARCHAR, 2, '0')
    END AS WRITEOFF_FY,
    CASE
        WHEN WRITE_OFF_DATE IS NULL THEN 9999
        WHEN MONTH(WRITE_OFF_DATE) >= 4 THEN YEAR(WRITE_OFF_DATE)
        ELSE YEAR(WRITE_OFF_DATE) - 1
    END AS WRITEOFF_FY_SORT,
    COUNT(*) AS DEVICE_COUNT
FROM enriched
GROUP BY 1, 2, 3, 4, 5
ORDER BY DEVICE_TYPE_NORMALIZED, PURCHASE_FY_SORT, WRITEOFF_FY_SORT
"""


@router.get("/matrix")
def get_cohort_matrix(client: WarehouseClient = Depends(get_warehouse_client)) -> dict:
    rows = client.query(_matrix_sql())

    # Collect all unique purchase FYs and write-off FYs (sorted)
    pfy_set: dict[str, int] = {}
    wfy_set: dict[str, int] = {}
    for row in rows:
        pfy_set[row["PURCHASE_FY"]] = row["PURCHASE_FY_SORT"]
        wfy_set[row["WRITEOFF_FY"]] = row["WRITEOFF_FY_SORT"]

    purchase_fys = [k for k, _ in sorted(pfy_set.items(), key=lambda x: x[1])]
    writeoff_fys = [k for k, _ in sorted(wfy_set.items(), key=lambda x: x[1])]

    return {
        "purchase_fys": purchase_fys,
        "writeoff_fys": writeoff_fys,
        "rows": rows,
    }


@router.get("/matrix.csv")
def export_cohort_csv(client: WarehouseClient = Depends(get_warehouse_client)) -> Response:
    return rows_to_csv_response(client.query(_matrix_sql()), "cohort_matrix.csv")
