from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.services.csv_export import rows_to_csv_response
from app.services.filter_utils import _build_filter_clause, where_or_and
from app.services.sql_fragments import deduped_cte, enriched_cte
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/executive", tags=["executive"])

_KPI_SELECT = """
SELECT
    COUNT(*) AS total_devices,
    SUM(CASE WHEN GRN_SOURCE_BUCKET = 'fresh_grn' THEN 1 ELSE 0 END) AS fresh_grn,
    SUM(CASE WHEN GRN_SOURCE_BUCKET = 'ssot_csp' THEN 1 ELSE 0 END) AS ssot_csp,
    SUM(CASE WHEN GRN_SOURCE_BUCKET = 'other' THEN 1 ELSE 0 END) AS other_source,

    -- Group 1: dispatch status - exhaustive 2-way split, always sums to total_devices.
    SUM(CASE WHEN DISPATCH_BUCKET = 'never_dispatched' THEN 1 ELSE 0 END) AS never_dispatched,
    SUM(CASE WHEN DISPATCH_BUCKET = 'dispatched' THEN 1 ELSE 0 END) AS dispatched,

    -- Group 2: where DISPATCHED devices currently are (holder bucket) -
    -- exhaustive split of the "dispatched" subset above, sums to `dispatched`.
    SUM(CASE WHEN HOLDER_BUCKET = 'customer' THEN 1 ELSE 0 END) AS customer_devices,
    SUM(CASE WHEN HOLDER_BUCKET = 'partner' THEN 1 ELSE 0 END) AS partner_devices,
    SUM(CASE WHEN HOLDER_BUCKET = 'returned_to_wiom' THEN 1 ELSE 0 END) AS returned_devices,
    SUM(CASE WHEN HOLDER_BUCKET = 'wiom_warehouse' THEN 1 ELSE 0 END) AS warehouse_devices,
    SUM(CASE WHEN HOLDER_BUCKET = 'unknown' THEN 1 ELSE 0 END) AS unknown_holder,
    -- Unknown holder sub-parts (why it's unknown - no matching T_DEVICE row
    -- at all, so location/status can't resolve; splits by where it came from).
    SUM(CASE WHEN HOLDER_BUCKET = 'unknown' AND GRN_SOURCE_BUCKET = 'fresh_grn' THEN 1 ELSE 0 END) AS unknown_holder_fresh_grn,
    SUM(CASE WHEN HOLDER_BUCKET = 'unknown' AND GRN_SOURCE_BUCKET = 'other' THEN 1 ELSE 0 END) AS unknown_holder_other_source,
    SUM(CASE WHEN HOLDER_BUCKET = 'unknown' AND GRN_SOURCE_BUCKET = 'ssot_csp' THEN 1 ELSE 0 END) AS unknown_holder_ssot_csp,

    -- Group 3: current device status - ALL STATUS_NORMALIZED values, exhaustive,
    -- sums to total_devices. Named buckets are the ones worth a dashboard card;
    -- everything else rolls into other_status (composition in the docstring).
    SUM(CASE WHEN STATUS_NORMALIZED = 'INSTALLED' THEN 1 ELSE 0 END) AS installed,
    SUM(CASE WHEN STATUS_NORMALIZED = 'DEPLOYED' THEN 1 ELSE 0 END) AS deployed,
    SUM(CASE WHEN STATUS_NORMALIZED = 'RETURNED' THEN 1 ELSE 0 END) AS status_returned,
    SUM(CASE WHEN STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS lost,
    SUM(CASE WHEN STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS written_off,
    SUM(CASE WHEN STATUS_NORMALIZED = 'IDLE' THEN 1 ELSE 0 END) AS idle,
    SUM(CASE WHEN STATUS_NORMALIZED = 'CUSTODIED' THEN 1 ELSE 0 END) AS custodied,
    SUM(CASE WHEN STATUS_NORMALIZED NOT IN
        ('INSTALLED','DEPLOYED','RETURNED','LOST','WRITTEN_OFF','IDLE','CUSTODIED')
        THEN 1 ELSE 0 END) AS other_status,
    -- Other-status sub-parts, individually - these 6 exhaustively make up other_status.
    SUM(CASE WHEN STATUS_NORMALIZED = 'UNKNOWN' THEN 1 ELSE 0 END) AS status_unknown,
    SUM(CASE WHEN STATUS_NORMALIZED = 'CUSTOMER_RECOVERY_PENDING' THEN 1 ELSE 0 END) AS customer_recovery_pending,
    SUM(CASE WHEN STATUS_NORMALIZED = 'RETRIEVAL_PENDING' THEN 1 ELSE 0 END) AS retrieval_pending,
    SUM(CASE WHEN STATUS_NORMALIZED = 'PENDING_CSP_RECEIPT' THEN 1 ELSE 0 END) AS pending_csp_receipt,
    SUM(CASE WHEN STATUS_NORMALIZED = 'RTO_INITIATED' THEN 1 ELSE 0 END) AS rto_initiated,
    SUM(CASE WHEN STATUS_NORMALIZED = 'IN_WAREHOUSE' THEN 1 ELSE 0 END) AS status_in_warehouse,

    -- Group 4: recharge status - exhaustive 3-way split, sums to total_devices.
    SUM(CASE WHEN AGING_BUCKET = 'active' THEN 1 ELSE 0 END) AS recharge_active,
    SUM(CASE WHEN AGING_BUCKET NOT IN ('active', 'no_recharge_history') THEN 1 ELSE 0 END) AS recharge_expired,
    SUM(CASE WHEN AGING_BUCKET = 'no_recharge_history' THEN 1 ELSE 0 END) AS no_recharge_history,

    -- Informational subsets (NOT part of any equation above - these overlap
    -- with the groups, they don't add to them).
    SUM(CASE WHEN AGING_BUCKET IN ('180-240', '240-365', '365+') THEN 1 ELSE 0 END) AS aged_180_plus,
    SUM(CASE WHEN AGING_BUCKET = '365+' THEN 1 ELSE 0 END) AS aged_365_plus
FROM enriched"""


def _kpi_sql(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status)
    return f"WITH {enriched_cte()}{_KPI_SELECT}{where_or_and(fc, existing_where=False)}"


@router.get("/kpis")
def get_executive_kpis(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    rows = client.query(_kpi_sql(device_type, holder_bucket, status))
    return rows[0] if rows else {}


@router.get("/kpis.csv")
def export_executive_kpis_csv(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> Response:
    rows = client.query(_kpi_sql(device_type, holder_bucket, status))
    return rows_to_csv_response(rows, "executive_kpis.csv")


@router.get("/data-quality")
def get_data_quality(client: WarehouseClient = Depends(get_warehouse_client)) -> dict:
    """Rows dropped before counting, and why - so "is there duplication?"
    has a concrete, checkable answer instead of just a claim.

    blank_device_id: rows in the base device list with no DEVICE_ID at all
    (from audit/tracking sources, not the primary t_device_devices /
    inbound_inward_devices feeds). 16 of these shared a MAC_ID with an
    already-counted real-DEVICE_ID row - i.e. they were double-counting a
    physical device under two rows - which is why they're excluded.
    """
    sql = f"""
    WITH {deduped_cte()}
    SELECT
        COUNT(*) AS total_rows_before_id_filter,
        SUM(CASE WHEN DEVICE_ID IS NULL OR TRIM(DEVICE_ID) = '' THEN 1 ELSE 0 END) AS blank_device_id,
        COUNT(DISTINCT DEVICE_ID) AS distinct_non_blank_device_ids
    FROM deduped
    """
    rows = client.query(sql)
    row = rows[0] if rows else {}
    return {
        "total_rows_before_id_filter": row.get("TOTAL_ROWS_BEFORE_ID_FILTER"),
        "blank_device_id_rows_excluded": row.get("BLANK_DEVICE_ID"),
        "note": (
            "Rows with a blank/null DEVICE_ID are excluded from every dashboard - "
            "they come from audit/tracking sources (physical_audit_devices, "
            "warehouse_physical_tracking), not the primary inventory feeds, and a "
            "subset of them were found to share a MAC_ID with an already-counted "
            "real device (i.e. double-counting it)."
        ),
    }
