"""Reconciliation API — Finance FAR vs Snowflake SSOT as of 31 Mar 2026.

Two endpoints:
  GET /api/recon/invoice-summary   — invoice-wise counts from Snowflake (fast, for pre-load)
  GET /api/recon/snapshot.csv      — full device list: DEVICE_ID, INVOICE_NUMBER,
                                     STATUS_NORMALIZED, HOLDER_BUCKET, WRITE_OFF_DATE
                                     (unbounded, via Metabase CSV path)

The frontend uploads the Excel file (parsed client-side with SheetJS), fetches the
Snowflake snapshot CSV, then does the set-comparison and invoice-wise diff entirely
in the browser — no large POST bodies needed.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.services.sql_fragments import enriched_cte
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/recon", tags=["recon"])

def _snapshot_sql() -> str:
    return f"""
WITH {enriched_cte()}
SELECT
    DEVICE_ID,
    COALESCE(INVOICE_NUMBER, '') AS INVOICE_NUMBER,
    COALESCE(STATUS_NORMALIZED, 'UNKNOWN') AS STATUS_NORMALIZED,
    COALESCE(HOLDER_BUCKET, 'unknown') AS HOLDER_BUCKET,
    TO_VARCHAR(WRITE_OFF_DATE) AS WRITE_OFF_DATE
FROM enriched
"""


def _invoice_summary_sql() -> str:
    return f"""
WITH {enriched_cte()}
SELECT
    COALESCE(INVOICE_NUMBER, '(blank)') AS INVOICE_NUMBER,
    COUNT(*) AS DEVICE_COUNT,
    SUM(CASE WHEN WRITE_OFF_DATE IS NOT NULL AND WRITE_OFF_DATE <= '2026-03-31' THEN 1 ELSE 0 END) AS WRITTEN_OFF_BY_MAR26,
    SUM(CASE WHEN STATUS_NORMALIZED = 'DEPLOYED' THEN 1 ELSE 0 END) AS DEPLOYED_COUNT,
    SUM(CASE WHEN STATUS_NORMALIZED IN ('LOST', 'WRITTEN_OFF') THEN 1 ELSE 0 END) AS LOST_WO_COUNT,
    TO_VARCHAR(MIN(INVOICE_DATE)) AS EARLIEST_DATE,
    TO_VARCHAR(MAX(INVOICE_DATE)) AS LATEST_DATE
FROM enriched
GROUP BY 1
ORDER BY DEVICE_COUNT DESC
"""


@router.get("/invoice-summary")
def get_invoice_summary(client: WarehouseClient = Depends(get_warehouse_client)) -> dict:
    rows = client.query(_invoice_summary_sql())
    total = sum(r["DEVICE_COUNT"] for r in rows)
    return {"total_devices": total, "by_invoice": rows}


@router.get("/snapshot.csv")
def get_snapshot_csv(client: WarehouseClient = Depends(get_warehouse_client)) -> Response:
    """Full device snapshot for client-side recon comparison.
    Downloads all devices with invoice number, status, write-off date.
    """
    csv_text = client.query_csv(_snapshot_sql())
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="snowflake_snapshot.csv"'},
    )
