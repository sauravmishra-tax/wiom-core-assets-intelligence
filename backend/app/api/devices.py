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
    # This scans the full enriched CTE (every join) with 5 leading-wildcard
    # ILIKE conditions, always live (use_cache=False - a search box can't be
    # cached by query text the way a fixed dashboard query can). That's
    # inherently slower than a typical dashboard query and occasionally
    # exceeded the default 60s timeout - bump it here rather than for every
    # other query on the client.
    rows = client.query(sql, use_cache=False, timeout=120.0)
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


@router.get("/{device_id}/history")
def get_device_history(
    device_id: str,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    safe_id = escape_literal(device_id)
    # Custody state changes (write-offs, reversals, etc.)
    custody_sql = f"""
    SELECT
        CREATED_AT AS event_at,
        'custody' AS source,
        EVENT_TYPE AS event_type,
        FROM_STATE AS from_state,
        TO_STATE AS to_state,
        REASON AS reason,
        TRIGGERED_BY AS triggered_by,
        PROVENANCE AS note,
        CSP_ID AS csp_id,
        CUSTOMER_ID AS customer_id,
        EPISODE_ID AS episode_id
    FROM CSP_ASSET_CUSTODY_SERVICE_CSP_ASSET_CUSTODY_SERVICE.CUSTODY_AUDIT_LOG
    WHERE DEVICE_ID = '{safe_id}'
    ORDER BY CREATED_AT ASC
    """
    # Inventory-level status changes
    inventory_sql = f"""
    SELECT
        MODIFIED_TIME AS event_at,
        'inventory' AS source,
        ACTION AS event_type,
        NULL AS from_state,
        STATUS AS to_state,
        NULL AS reason,
        NULL AS triggered_by,
        NULL AS note,
        NULL AS csp_id,
        NULL AS customer_id,
        NULL AS episode_id
    FROM POSTGRES_RDS_INVENTORY_INVENTORY.T_DEVICE_AUDIT
    WHERE DEVICE_ID = '{safe_id}'
    ORDER BY MODIFIED_TIME ASC
    """
    # Netbox custody snapshot changes — parse JSON, show only rows where
    # status OR carry_fee_state OR connection_deactivated changes.
    netbox_sql = f"""
    SELECT
        CREATED_AT AS event_at,
        'netbox' AS source,
        OPERATION AS event_type,
        PARSE_JSON(AUDIT_DATA):status::STRING AS to_state,
        PARSE_JSON(AUDIT_DATA):carry_fee_state::STRING AS carry_fee_state,
        PARSE_JSON(AUDIT_DATA):connection_deactivated::STRING AS connection_deactivated,
        PARSE_JSON(AUDIT_DATA):connection_id::STRING AS connection_id,
        PARSE_JSON(AUDIT_DATA):customer_id::STRING AS customer_id,
        PARSE_JSON(AUDIT_DATA):csp_id::STRING AS csp_id,
        PARSE_JSON(AUDIT_DATA):idle_days::INTEGER AS idle_days,
        PARSE_JSON(AUDIT_DATA):causation_id::STRING AS causation_id,
        PARSE_JSON(AUDIT_DATA):version::INTEGER AS version
    FROM CSP_ASSET_CUSTODY_SERVICE_CSP_ASSET_CUSTODY_SERVICE.AUDIT_LOG
    WHERE RECORD_ID = '{safe_id}'
    ORDER BY CREATED_AT ASC
    """
    netbox_raw = client.query(netbox_sql, use_cache=False)

    # Keep only rows where something meaningful changed vs previous row
    netbox_rows = []
    prev: dict = {}
    for row in netbox_raw:
        changed = (
            row.get("TO_STATE") != prev.get("TO_STATE")
            or row.get("CARRY_FEE_STATE") != prev.get("CARRY_FEE_STATE")
            or row.get("CONNECTION_DEACTIVATED") != prev.get("CONNECTION_DEACTIVATED")
        )
        if changed:
            # Map to common shape
            netbox_rows.append({
                "EVENT_AT": row.get("EVENT_AT"),
                "SOURCE": "netbox",
                "EVENT_TYPE": row.get("EVENT_TYPE"),
                "FROM_STATE": prev.get("TO_STATE"),
                "TO_STATE": row.get("TO_STATE"),
                "REASON": row.get("CAUSATION_ID"),
                "TRIGGERED_BY": None,
                "NOTE": f"Carry fee: {row['CARRY_FEE_STATE']}" if row.get("CARRY_FEE_STATE") else None,
                "CSP_ID": row.get("CSP_ID"),
                "CUSTOMER_ID": row.get("CUSTOMER_ID"),
                "EPISODE_ID": None,
                "IDLE_DAYS": row.get("IDLE_DAYS"),
                "CONNECTION_ID": row.get("CONNECTION_ID"),
            })
        prev = row

    custody_rows = client.query(custody_sql, use_cache=False)
    inventory_rows = client.query(inventory_sql, use_cache=False)
    combined = sorted(
        custody_rows + inventory_rows + netbox_rows,
        key=lambda r: r.get("EVENT_AT") or "",
    )
    return {"device_id": device_id, "events": combined}


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
