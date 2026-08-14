from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.services import query_store
from app.services.csv_export import rows_to_csv_response
from app.services.filter_utils import _build_filter_clause, where_or_and
from app.services.sql_fragments import AGING_BUCKET_ORDER, enriched_cte
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/ageing", tags=["ageing"])


def _matrix_sql(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status)
    where = where_or_and(fc, existing_where=False)
    return f"""
WITH {enriched_cte()},
filtered AS (SELECT * FROM enriched{where})
SELECT AGING_BUCKET, STATUS_NORMALIZED, HOLDER_BUCKET, COUNT(*) AS device_count
FROM filtered GROUP BY 1, 2, 3
UNION ALL
SELECT AGING_BUCKET, 'FINANCIAL_WO' AS STATUS_NORMALIZED, HOLDER_BUCKET, COUNT(*) AS device_count
FROM filtered WHERE WRITE_OFF_DATE IS NOT NULL GROUP BY 1, 3
UNION ALL
SELECT AGING_BUCKET, 'NON_FINANCIAL_WO' AS STATUS_NORMALIZED, HOLDER_BUCKET, COUNT(*) AS device_count
FROM filtered WHERE STATUS_NORMALIZED = 'WRITTEN_OFF' AND WRITE_OFF_DATE IS NULL GROUP BY 1, 3
"""


def _ordered_rows(
    client: WarehouseClient,
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
) -> list[dict]:
    rows = client.query(_matrix_sql(device_type, holder_bucket, status))
    bucket_order = {b: i for i, b in enumerate(AGING_BUCKET_ORDER)}
    rows.sort(key=lambda r: bucket_order.get(r["AGING_BUCKET"], len(bucket_order)))
    return rows


@router.get("/matrix")
def get_ageing_matrix(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    """Ageing bucket x status cross-tab. Ageing = CURRENT_DATE - LAST_RECHARGE_EXPIRY,
    computed at query time every call - never stored, always current."""
    rows = _ordered_rows(client, device_type, holder_bucket, status)

    totals: dict[str, int] = {b: 0 for b in AGING_BUCKET_ORDER}
    for row in rows:
        totals[row["AGING_BUCKET"]] = totals.get(row["AGING_BUCKET"], 0) + row["DEVICE_COUNT"]

    return {"bucket_order": AGING_BUCKET_ORDER, "totals_by_bucket": totals, "detail": rows}


@router.get("/matrix.csv")
def export_ageing_matrix_csv(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> Response:
    return rows_to_csv_response(_ordered_rows(client, device_type, holder_bucket, status), "ageing_matrix.csv")


# SEGMENT rule, per business definition:
#   WIOM   = device's current location is WIOM (wiom_warehouse or returned_to_wiom)
#            - this wins regardless of partner history, since "current status"
#            takes priority once it's back with WIOM.
#   CSP    = not at WIOM, and PARTNER_ACCOUNT_ID has a live/verified row in
#            CSP_GATEWAY_SERVICE_CSP_GATEWAY_SERVICE.CSP_ACCOUNT (csp_active_partners)
#   EX_CSP = not at WIOM, has a PARTNER_ACCOUNT_ID, but that partner has no
#            matching active csp_id (churned/never-onboarded-to-gateway partner)
_SEGMENT_STATUSES = ["DEPLOYED", "CUSTOMER_RECOVERY_PENDING", "LOST", "WRITTEN_OFF", "IDLE", "CUSTODIED", "RETRIEVAL_PENDING"]
# "active" and "no_recharge_history" used to be silently excluded here - the
# table only ever showed the "expired" subset (10 buckets below), hiding
# ~60% of CSP/EX_CSP devices (recharge-active + never-recharged) with no
# indication they existed. Now exhaustive: every device shows up somewhere.
_PIVOT_BUCKETS = ["active", "0-15", "15-30", "30-45", "45-60", "60-90", "90-120", "120-180", "180-240", "240-365", "365+", "no_recharge_history"]


def _segment_matrix_sql(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status)
    csp_active_sql = query_store.get("csp_active_partners")
    return f"""
WITH {enriched_cte()},
csp_active AS (
    {csp_active_sql}
)
SELECT
    CASE
        WHEN e.HOLDER_BUCKET IN ('wiom_warehouse', 'returned_to_wiom') THEN 'WIOM'
        WHEN e.PARTNER_ACCOUNT_ID IS NOT NULL AND ca.partner_id IS NOT NULL THEN 'CSP'
        WHEN e.PARTNER_ACCOUNT_ID IS NOT NULL THEN 'EX_CSP'
        ELSE 'WIOM'
    END AS SEGMENT,
    e.STATUS_NORMALIZED,
    e.AGING_BUCKET,
    COUNT(*) AS device_count
FROM enriched e
LEFT JOIN csp_active ca ON ca.partner_id = e.PARTNER_ACCOUNT_ID{where_or_and(fc, existing_where=False)}
GROUP BY 1, 2, 3
"""


@router.get("/segment-matrix")
def get_ageing_segment_matrix(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    """CSP / EX_CSP / WIOM segment x status x ageing-bucket pivot.
    WIOM = currently at wiom_warehouse/returned_to_wiom (wins regardless of
    partner history). CSP = has a partner with a live CSP_ACCOUNT row.
    EX_CSP = has a partner but no matching active CSP_ACCOUNT row."""
    rows = client.query(_segment_matrix_sql(device_type, holder_bucket, status))
    return {
        "segments": ["CSP", "EX_CSP", "WIOM"],
        "statuses": _SEGMENT_STATUSES,
        "buckets": _PIVOT_BUCKETS,
        "detail": rows,
    }


@router.get("/segment-matrix.csv")
def export_ageing_segment_matrix_csv(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> Response:
    rows = client.query(_segment_matrix_sql(device_type, holder_bucket, status))
    return rows_to_csv_response(rows, "ageing_segment_matrix.csv")
