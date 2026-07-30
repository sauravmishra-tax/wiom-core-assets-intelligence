from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.services import query_store
from app.services.filter_utils import _build_filter_clause
from app.services.sql_fragments import enriched_cte
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/partners", tags=["partners"])

_VALID_CSP_STATUSES = ("CSP", "EX_CSP")

# Attribution, not current custody: PARTNER_ACCOUNT_ID stays set on a device
# even after it's dispatched onward and installed at a customer (status
# DEPLOYED, holder_bucket='customer') - the partner is who fielded it. Filtering
# to HOLDER_BUCKET='partner' alone undercounts massively (16K vs the correct
# ~2.77L) because it only caught devices currently sitting idle/custodied at
# the partner, not the bulk that are out and deployed.
#
# This module used to be split across two tabs (Partners + CSP Devices) that
# showed almost the same partner population from two angles - merged into
# one here: KPIs, device-type breakdown, and the partner leaderboard all take
# the same filter set (device_type, holder_bucket, status, grn_source_bucket),
# plus a CSP/EX_CSP filter specific to the leaderboard.


def _kpi_sql(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    grn_source_bucket: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status, grn_source_bucket)
    extra = f" {fc}" if fc else ""
    return f"""
WITH {enriched_cte()}
SELECT
    COUNT(*) AS total_devices,
    SUM(CASE WHEN STATUS_NORMALIZED = 'DEPLOYED' THEN 1 ELSE 0 END) AS deployed,
    SUM(CASE WHEN STATUS_NORMALIZED = 'INSTALLED' THEN 1 ELSE 0 END) AS installed,
    SUM(CASE WHEN STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS lost,
    SUM(CASE WHEN STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS written_off,
    SUM(CASE WHEN STATUS_NORMALIZED = 'IDLE' THEN 1 ELSE 0 END) AS idle,
    SUM(CASE WHEN STATUS_NORMALIZED = 'CUSTODIED' THEN 1 ELSE 0 END) AS custodied,
    SUM(CASE WHEN AGING_BUCKET = 'active' THEN 1 ELSE 0 END) AS recharge_active,
    SUM(CASE WHEN AGING_BUCKET NOT IN ('active', 'no_recharge_history') THEN 1 ELSE 0 END) AS recharge_expired,
    -- Without this, active+expired alone silently undercounts total_devices -
    -- same gap fixed on the Executive dashboard (see executive.py group 5).
    SUM(CASE WHEN AGING_BUCKET = 'no_recharge_history' THEN 1 ELSE 0 END) AS no_recharge_history,
    SUM(CASE WHEN HOLDER_BUCKET = 'customer' THEN 1 ELSE 0 END) AS at_customer,
    SUM(CASE WHEN HOLDER_BUCKET = 'partner' THEN 1 ELSE 0 END) AS with_partner,
    SUM(CASE WHEN HOLDER_BUCKET = 'returned_to_wiom' THEN 1 ELSE 0 END) AS returned_to_wiom,
    SUM(CASE WHEN HOLDER_BUCKET = 'wiom_warehouse' THEN 1 ELSE 0 END) AS in_warehouse
FROM enriched
WHERE PARTNER_ACCOUNT_ID IS NOT NULL{extra}
"""


def _by_device_type_sql(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    grn_source_bucket: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status, grn_source_bucket)
    extra = f" {fc}" if fc else ""
    return f"""
WITH {enriched_cte()}
SELECT
    DEVICE_TYPE_NORMALIZED,
    COUNT(*) AS DEVICE_COUNT,
    SUM(CASE WHEN STATUS_NORMALIZED = 'DEPLOYED' THEN 1 ELSE 0 END) AS DEPLOYED,
    SUM(CASE WHEN STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS LOST,
    SUM(CASE WHEN STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS WRITTEN_OFF
FROM enriched
WHERE PARTNER_ACCOUNT_ID IS NOT NULL{extra}
GROUP BY 1
ORDER BY DEVICE_COUNT DESC
"""


def _leaderboard_sql(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    csp_status: str | None = None,
    grn_source_bucket: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status, grn_source_bucket)
    extra = f" {fc}" if fc else ""
    partner_master_sql = query_store.get("partner_master")
    csp_active_sql = query_store.get("csp_active_partners")
    csp_status_filter = ""
    if csp_status:
        normalized = csp_status.upper()
        if normalized not in _VALID_CSP_STATUSES:
            raise ValueError(f"csp_status must be one of {_VALID_CSP_STATUSES}, got '{csp_status}'.")
        csp_status_filter = f"WHERE csp_status = '{normalized}'"
    return f"""
WITH {enriched_cte()},
partner_master AS (
    {partner_master_sql}
),
csp_active AS (
    {csp_active_sql}
),
leaderboard AS (
SELECT
    PARTNER_ACCOUNT_ID,
    COUNT(*) AS total_devices,
    SUM(CASE WHEN HOLDER_BUCKET = 'customer' THEN 1 ELSE 0 END) AS deployed_at_customer,
    SUM(CASE WHEN HOLDER_BUCKET = 'partner' THEN 1 ELSE 0 END) AS currently_with_partner,
    SUM(CASE WHEN STATUS_NORMALIZED = 'DEPLOYED' THEN 1 ELSE 0 END) AS deployed,
    SUM(CASE WHEN STATUS_NORMALIZED = 'CUSTOMER_RECOVERY_PENDING' THEN 1 ELSE 0 END) AS customer_recovery_pending,
    SUM(CASE WHEN STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS lost,
    SUM(CASE WHEN STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS written_off,
    SUM(CASE WHEN STATUS_NORMALIZED = 'IDLE' THEN 1 ELSE 0 END) AS idle,
    SUM(CASE WHEN STATUS_NORMALIZED = 'CUSTODIED' THEN 1 ELSE 0 END) AS custodied,
    SUM(CASE WHEN STATUS_NORMALIZED = 'RETRIEVAL_PENDING' THEN 1 ELSE 0 END) AS retrieval_pending,
    SUM(CASE WHEN AGING_BUCKET = '365+' THEN 1 ELSE 0 END) AS aged_365_plus,
    SUM(CASE WHEN STATUS_NORMALIZED IN ('LOST','WRITTEN_OFF') THEN 1 ELSE 0 END) AS lost_or_written_off
FROM enriched
WHERE PARTNER_ACCOUNT_ID IS NOT NULL{extra}
GROUP BY 1
),
with_csp_status AS (
SELECT
    l.*,
    ROUND(100.0 * l.lost_or_written_off / NULLIF(l.total_devices, 0), 1) AS lost_or_written_off_rate_pct,
    pm.partner_name,
    pm.partner_mobile,
    pm.partner_status,
    pm.zone,
    pm.city,
    pm.account_manager,
    -- CSP = has a live/verified row in the CSP gateway's account table.
    -- EX_CSP = has devices attributed but churned/never onboarded to the gateway.
    CASE WHEN ca.partner_id IS NOT NULL THEN 'CSP' ELSE 'EX_CSP' END AS csp_status
FROM leaderboard l
LEFT JOIN partner_master pm ON pm.partner_account_id = l.PARTNER_ACCOUNT_ID
LEFT JOIN csp_active ca ON ca.partner_id = l.PARTNER_ACCOUNT_ID
)
SELECT * FROM with_csp_status
{csp_status_filter}
ORDER BY lost_or_written_off DESC
"""


def _with_rate(rows: list[dict]) -> list[dict]:
    out = []
    for row in rows:
        total = row["TOTAL_DEVICES"] or 0
        bad = row["LOST_OR_WRITTEN_OFF"] or 0
        out.append({**row, "lost_or_written_off_rate_pct": round(100 * bad / total, 1) if total else 0})
    return out


@router.get("/summary")
def get_partner_summary(
    limit: int = 5000,
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    csp_status: str | None = Query(None, description='"CSP" or "EX_CSP"'),
    grn_source_bucket: str | None = Query(None, description="fresh_grn, ssot_csp, or other"),
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    """Merged Partners + CSP Devices view: overall KPIs, device-type
    breakdown, and the partner leaderboard, all under the same filter set.
    (Previously two separate tabs showing overlapping partner populations
    from two angles - CSP Devices' "top 50 partners" was a capped subset of
    this same leaderboard.)
    """
    try:
        leaderboard_sql = _leaderboard_sql(device_type, holder_bucket, status, csp_status, grn_source_bucket)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    kpi_rows = client.query(_kpi_sql(device_type, holder_bucket, status, grn_source_bucket))
    kpis = kpi_rows[0] if kpi_rows else {}
    by_device_type = client.query(_by_device_type_sql(device_type, holder_bucket, status, grn_source_bucket))
    # client.query() is Metabase's ad-hoc endpoint - silently caps at ~2000
    # rows regardless of how many partners actually match. query_csv() (via
    # query_rows_unbounded) hits /api/dataset/csv instead, same fix already
    # applied to the CSV export below and to customers.py's leaderboard.
    rows = _with_rate(client.query_rows_unbounded(leaderboard_sql))

    return {
        "kpis": {
            "total_devices": kpis.get("TOTAL_DEVICES"),
            "deployed": kpis.get("DEPLOYED"),
            "installed": kpis.get("INSTALLED"),
            "lost": kpis.get("LOST"),
            "written_off": kpis.get("WRITTEN_OFF"),
            "idle": kpis.get("IDLE"),
            "custodied": kpis.get("CUSTODIED"),
            "recharge_active": kpis.get("RECHARGE_ACTIVE"),
            "recharge_expired": kpis.get("RECHARGE_EXPIRED"),
            "no_recharge_history": kpis.get("NO_RECHARGE_HISTORY"),
            "at_customer": kpis.get("AT_CUSTOMER"),
            "with_partner": kpis.get("WITH_PARTNER"),
            "returned_to_wiom": kpis.get("RETURNED_TO_WIOM"),
            "in_warehouse": kpis.get("IN_WAREHOUSE"),
        },
        "by_device_type": by_device_type,
        "leaderboard": {"rows": rows[:limit], "total_partners": len(rows)},
    }


@router.get("/leaderboard")
def get_partner_leaderboard(
    limit: int = 100,
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    csp_status: str | None = None,
    grn_source_bucket: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    """Kept for backward compatibility / lighter-weight callers that only
    need the leaderboard rows, not the KPIs + device-type breakdown too -
    see /summary for the merged view."""
    try:
        sql = _leaderboard_sql(device_type, holder_bucket, status, csp_status, grn_source_bucket)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    rows = _with_rate(client.query_rows_unbounded(sql))
    return {"rows": rows[:limit], "total_partners": len(rows)}


@router.get("/leaderboard.csv")
def export_partner_leaderboard_csv(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    csp_status: str | None = None,
    grn_source_bucket: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> Response:
    """Export ALL partners as CSV - unbounded. Uses query_csv() (Metabase's
    dedicated CSV endpoint), not query() (which silently caps at ~2000 rows -
    see the customers.py leaderboard fix for what that bug looked like)."""
    try:
        sql = _leaderboard_sql(device_type, holder_bucket, status, csp_status, grn_source_bucket)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    csv_text = client.query_csv(sql)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="partner_leaderboard.csv"'},
    )
