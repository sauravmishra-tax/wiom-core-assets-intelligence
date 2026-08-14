"""Invoice Register — invoice-wise purchase quantity, write-off by FY, remaining, blanks.

GET /api/invoice-register/summary     — invoice list with all columns
GET /api/invoice-register/summary.csv — CSV export
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.services.csv_export import rows_to_csv_response
from app.services.sql_fragments import enriched_cte
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/invoice-register", tags=["invoice-register"])

_SUMMARY_SQL = f"""
WITH {enriched_cte()}
SELECT
    COALESCE(INVOICE_NUMBER, '(blank)') AS INVOICE_NUMBER,
    TO_VARCHAR(MIN(INVOICE_DATE)) AS INVOICE_DATE,
    CASE
        WHEN MIN(INVOICE_DATE) IS NULL THEN 'Unknown'
        WHEN MONTH(MIN(INVOICE_DATE)) >= 4
             THEN YEAR(MIN(INVOICE_DATE))::VARCHAR || '-' || LPAD((YEAR(MIN(INVOICE_DATE)) + 1 - 2000)::VARCHAR, 2, '0')
        ELSE (YEAR(MIN(INVOICE_DATE)) - 1)::VARCHAR || '-' || LPAD((YEAR(MIN(INVOICE_DATE)) - 2000)::VARCHAR, 2, '0')
    END AS INVOICE_FY,
    DEVICE_TYPE_NORMALIZED,
    COUNT(*) AS TOTAL_PURCHASED,
    SUM(CASE WHEN WRITE_OFF_DATE IS NOT NULL THEN 1 ELSE 0 END) AS TOTAL_WRITTEN_OFF,
    SUM(CASE WHEN YEAR(WRITE_OFF_DATE) = 2023 THEN 1 ELSE 0 END) AS WO_FY_2022_23,
    SUM(CASE WHEN YEAR(WRITE_OFF_DATE) = 2024 THEN 1 ELSE 0 END) AS WO_FY_2023_24,
    SUM(CASE WHEN YEAR(WRITE_OFF_DATE) = 2025 THEN 1 ELSE 0 END) AS WO_FY_2024_25,
    SUM(CASE WHEN YEAR(WRITE_OFF_DATE) = 2026 THEN 1 ELSE 0 END) AS WO_FY_2025_26,
    COUNT(*) - SUM(CASE WHEN WRITE_OFF_DATE IS NOT NULL THEN 1 ELSE 0 END) AS REMAINING,
    SUM(CASE WHEN INVOICE_NUMBER IS NULL OR TRIM(INVOICE_NUMBER) = '' THEN 1 ELSE 0 END) AS BLANK_INVOICE_COUNT
FROM enriched
GROUP BY 1, 4
ORDER BY MIN(INVOICE_DATE) ASC NULLS LAST, INVOICE_NUMBER
"""


@router.get("/summary")
def get_invoice_summary(client: WarehouseClient = Depends(get_warehouse_client)) -> dict:
    rows = client.query(_SUMMARY_SQL)
    total_purchased = sum(r["TOTAL_PURCHASED"] for r in rows)
    total_wo = sum(r["TOTAL_WRITTEN_OFF"] for r in rows)
    total_remaining = sum(r["REMAINING"] for r in rows)
    return {
        "totals": {
            "total_purchased": total_purchased,
            "total_written_off": total_wo,
            "total_remaining": total_remaining,
        },
        "rows": rows,
    }


@router.get("/summary.csv")
def export_invoice_csv(client: WarehouseClient = Depends(get_warehouse_client)) -> Response:
    return rows_to_csv_response(client.query(_SUMMARY_SQL), "invoice_register.csv")
