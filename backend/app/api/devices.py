from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.services.sql_fragments import enriched_cte
from app.services.sql_safety import escape_literal
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/devices", tags=["devices"])

PROFILE_COLUMNS = """
    DEVICE_ID, MAC_ID, SERIAL, MODEL, VERSION, DEVICE_TYPE,
    DATA_SOURCE, GRN_SOURCE_BUCKET,
    INVOICE_NUMBER, INVOICE_DATE, INVOICE_YEAR,
    FIRST_GRN_DATE, FIRST_DISPATCHED_DATE, LAST_DISPATCHED_DATE, TOTAL_DISPATCHES,
    FIRST_INSTALLED_DATE, LAST_INSTALLED_DATE, TOTAL_INSTALLED_CUSTOMERS,
    CURRENT_LOCATION, CURRENT_LOCATION, PREVIOUS_LOCATION, LOCATION_UPDATED_DATE,
    HOLDER_BUCKET, DISPATCH_BUCKET,
    PARTNER_ACCOUNT_ID, CUSTOMER_ACCOUNT_ID,
    STATUS_NORMALIZED, STATUS_UPDATED_AT, WRITE_OFF_DATE, WRITE_OFF_YEAR,
    PYROPS_STATE, PYROPS_STATE_CHANGE_AT, PYROPS_LOCATION,
    LAST_RECHARGE_EXPIRY, AGING_BUCKET,
    LAST_PICKUP_TICKET_ID,
    LAST_PARTNER_RECEIVED_AT, LAST_PARTNER_RECEIVED_FROM,
    LAST_WAREHOUSE_RECEIVED_AT,
    OPS_WRITTEN_OFF, FINANCIAL_WRITE_OFF, IS_LOST, RETIRED, TRADED, E_WASTE, OBD
""".strip()


@router.get("/search")
def search_devices(
    q: str = Query(..., min_length=2, description="Device ID, MAC, serial, or customer mobile"),
    limit: int = 50,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    needle = escape_literal(q.strip())
    # Note: partner/customer *names* and phone numbers aren't in this table
    # (only PARTNER_ACCOUNT_ID / CUSTOMER_ACCOUNT_ID ids - CUSTOMER_DETAILS is
    # an OBJECT column that is unpopulated in production). Name/phone search
    # needs a join to the partner-service and customer master tables, which
    # is a Phase 2 item.
    sql = f"""
    WITH {enriched_cte()}
    SELECT
        DEVICE_ID, MAC_ID, SERIAL, MODEL, DEVICE_TYPE,
        CURRENT_LOCATION, HOLDER_BUCKET, STATUS_NORMALIZED,
        PARTNER_ACCOUNT_ID, CUSTOMER_ACCOUNT_ID, AGING_BUCKET
    FROM enriched
    WHERE DEVICE_ID ILIKE '%{needle}%'
       OR MAC_ID ILIKE '%{needle}%'
       OR SERIAL ILIKE '%{needle}%'
       OR PARTNER_ACCOUNT_ID ILIKE '%{needle}%'
       OR CUSTOMER_ACCOUNT_ID ILIKE '%{needle}%'
    LIMIT {int(limit)}
    """
    rows = client.query(sql, use_cache=False)
    return {"query": q, "results": rows}


@router.get("/export/full.csv")
def export_devices_csv(
    device_type: str | None = Query(None, description="ONT, Router, or Unknown"),
    status: str | None = Query(None, description="e.g. LOST, WRITTEN_OFF, DEPLOYED"),
    holder_bucket: str | None = Query(None, description="customer, partner, wiom_warehouse, returned_to_wiom"),
    aging_bucket: str | None = Query(None, description="e.g. 365+, 180-240, active"),
    invoice_year: int | None = Query(None, description="Purchase/invoice year, e.g. 2025"),
    grn_source_bucket: str | None = Query(None, description="fresh_grn, ssot_csp, or other"),
    partner_account_id: str | None = Query(None, description="Exact PARTNER_ACCOUNT_ID"),
    customer_account_id: str | None = Query(None, description="Exact CUSTOMER_ACCOUNT_ID"),
    warehouse: str | None = Query(None, description="Exact PYROPS_LOCATION, e.g. 001-SAKET"),
    client: WarehouseClient = Depends(get_warehouse_client),
) -> Response:
    """Full, unbounded device-level export (via Metabase's native CSV path,
    which bypasses the 2000-row cap /api/dataset applies). Filters are
    optional and AND together; with none set, this exports the entire fleet.
    """
    conditions = []
    if device_type:
        conditions.append(f"DEVICE_TYPE_NORMALIZED = '{escape_literal(device_type)}'")
    if status:
        conditions.append(f"STATUS_NORMALIZED = '{escape_literal(status.upper())}'")
    if holder_bucket:
        conditions.append(f"HOLDER_BUCKET = '{escape_literal(holder_bucket)}'")
    if aging_bucket:
        conditions.append(f"AGING_BUCKET = '{escape_literal(aging_bucket)}'")
    if invoice_year:
        conditions.append(f"INVOICE_YEAR = {int(invoice_year)}")
    if grn_source_bucket:
        conditions.append(f"GRN_SOURCE_BUCKET = '{escape_literal(grn_source_bucket)}'")
    if partner_account_id:
        conditions.append(f"PARTNER_ACCOUNT_ID = '{escape_literal(partner_account_id)}'")
    if customer_account_id:
        conditions.append(f"CUSTOMER_ACCOUNT_ID = '{escape_literal(customer_account_id)}'")
    if warehouse:
        conditions.append(f"PYROPS_LOCATION = '{escape_literal(warehouse)}'")

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
    WITH {enriched_cte()}
    SELECT {PROFILE_COLUMNS}, DEVICE_TYPE_NORMALIZED
    FROM enriched
    {where_clause}
    """
    csv_text = client.query_csv(sql)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="devices_export.csv"'},
    )


@router.get("/{device_id}")
def get_device_profile(
    device_id: str,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    safe_id = escape_literal(device_id)
    sql = f"""
    WITH {enriched_cte()}
    SELECT {PROFILE_COLUMNS}
    FROM enriched
    WHERE DEVICE_ID = '{safe_id}'
    LIMIT 1
    """
    rows = client.query(sql, use_cache=False)
    if not rows:
        raise HTTPException(status_code=404, detail=f"Device '{device_id}' not found")
    return rows[0]
