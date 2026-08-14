"""Inventory Matrix — WIOM / CSP / Ex-CSP × Router/ONT × Status breakdown.

Segment classification:
  WIOM    = holder_bucket IN (wiom_warehouse, returned_to_wiom)
  CSP     = partner_account_id in active CSP partners (CSP_ACCOUNT table)
  Ex-CSP  = partner_account_id exists but NOT in active CSP partners

Endpoints:
  GET /api/inventory-matrix/status        — segment × device_type × status counts
  GET /api/inventory-matrix/writeoff-overlap — segment × device_type × Fin/Ops/Lost overlaps
  GET /api/inventory-matrix/ageing        — segment × device_type × ageing bucket
  GET /api/inventory-matrix/invoice-fy    — segment × device_type × invoice FY
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.services.csv_export import rows_to_csv_response
from app.services.sql_fragments import enriched_cte, segment_ctes
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/inventory-matrix", tags=["inventory-matrix"])

_PFX = f"""WITH {enriched_cte()},
{segment_ctes()}"""

_STATUS_SQL = f"""
{_PFX}
SELECT
    SEGMENT,
    DEVICE_TYPE_NORMALIZED,
    COALESCE(STATUS_NORMALIZED, 'UNKNOWN') AS STATUS_NORMALIZED,
    COUNT(*) AS DEVICE_COUNT
FROM segmented
GROUP BY 1, 2, 3
ORDER BY SEGMENT, DEVICE_TYPE_NORMALIZED, DEVICE_COUNT DESC
"""

_WRITEOFF_OVERLAP_SQL = f"""
{_PFX}
SELECT
    SEGMENT,
    DEVICE_TYPE_NORMALIZED,
    COUNT(*) AS TOTAL,
    SUM(CASE WHEN WRITE_OFF_DATE IS NOT NULL THEN 1 ELSE 0 END) AS FINANCIAL_WO,
    SUM(CASE WHEN STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS OPS_WO,
    SUM(CASE WHEN STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS LOST,
    SUM(CASE WHEN WRITE_OFF_DATE IS NOT NULL AND STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS FIN_AND_OPS_WO,
    SUM(CASE WHEN WRITE_OFF_DATE IS NOT NULL AND STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS FIN_AND_LOST,
    SUM(CASE WHEN WRITE_OFF_DATE IS NOT NULL AND STATUS_NORMALIZED IN ('WRITTEN_OFF','LOST') THEN 1 ELSE 0 END) AS FIN_WO_AND_ANY_OPS_FLAG,
    SUM(CASE WHEN WRITE_OFF_DATE IS NULL AND STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS OPS_WO_ONLY_NO_FIN,
    SUM(CASE WHEN WRITE_OFF_DATE IS NULL AND STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS LOST_ONLY_NO_FIN
FROM segmented
GROUP BY 1, 2
ORDER BY 1, 2
"""

_AGEING_SQL = f"""
{_PFX}
SELECT
    SEGMENT,
    DEVICE_TYPE_NORMALIZED,
    COALESCE(AGING_BUCKET, 'no_recharge_history') AS AGING_BUCKET,
    COUNT(*) AS DEVICE_COUNT
FROM segmented
GROUP BY 1, 2, 3
ORDER BY 1, 2
"""

_INVOICE_FY_SQL = f"""
{_PFX}
SELECT
    SEGMENT,
    DEVICE_TYPE_NORMALIZED,
    CASE
        WHEN INVOICE_DATE IS NULL THEN 'Unknown'
        WHEN MONTH(INVOICE_DATE) >= 4 THEN YEAR(INVOICE_DATE)::VARCHAR || '-' || (YEAR(INVOICE_DATE) + 1 - 2000)::VARCHAR
        ELSE (YEAR(INVOICE_DATE) - 1)::VARCHAR || '-' || (YEAR(INVOICE_DATE) - 2000)::VARCHAR
    END AS INVOICE_FY,
    CASE
        WHEN INVOICE_DATE IS NULL THEN 9999
        WHEN MONTH(INVOICE_DATE) >= 4 THEN YEAR(INVOICE_DATE)
        ELSE YEAR(INVOICE_DATE) - 1
    END AS INVOICE_FY_SORT,
    COUNT(*) AS DEVICE_COUNT
FROM segmented
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, INVOICE_FY_SORT
"""


@router.get("/status")
def get_status_matrix(client: WarehouseClient = Depends(get_warehouse_client)) -> dict:
    rows = client.query(_STATUS_SQL)
    return {"rows": rows}


@router.get("/writeoff-overlap")
def get_writeoff_overlap(client: WarehouseClient = Depends(get_warehouse_client)) -> dict:
    rows = client.query(_WRITEOFF_OVERLAP_SQL)
    return {"rows": rows}


@router.get("/ageing")
def get_ageing_matrix(client: WarehouseClient = Depends(get_warehouse_client)) -> dict:
    rows = client.query(_AGEING_SQL)
    return {"rows": rows}


@router.get("/invoice-fy")
def get_invoice_fy_matrix(client: WarehouseClient = Depends(get_warehouse_client)) -> dict:
    rows = client.query(_INVOICE_FY_SQL)
    return {"rows": rows}


@router.get("/status.csv")
def export_status_csv(client: WarehouseClient = Depends(get_warehouse_client)) -> Response:
    return rows_to_csv_response(client.query(_STATUS_SQL), "inventory_matrix_status.csv")


@router.get("/writeoff-overlap.csv")
def export_writeoff_csv(client: WarehouseClient = Depends(get_warehouse_client)) -> Response:
    return rows_to_csv_response(client.query(_WRITEOFF_OVERLAP_SQL), "writeoff_overlap.csv")
