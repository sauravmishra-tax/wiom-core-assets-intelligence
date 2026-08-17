from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.services.filter_utils import _build_filter_clause, where_or_and
from app.services.sql_fragments import enriched_cte
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/customers", tags=["customers"])


def _kpi_sql(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status)
    return f"""
WITH {enriched_cte()}
SELECT
    SUM(CASE WHEN HOLDER_BUCKET = 'customer' THEN 1 ELSE 0 END) AS total_customer_devices,
    SUM(CASE WHEN STATUS_NORMALIZED = 'DEPLOYED' THEN 1 ELSE 0 END) AS deployed,
    SUM(CASE WHEN STATUS_NORMALIZED = 'INSTALLED' THEN 1 ELSE 0 END) AS installed,
    SUM(CASE WHEN STATUS_NORMALIZED = 'LOST' AND HOLDER_BUCKET = 'customer' THEN 1 ELSE 0 END) AS lost,
    SUM(CASE WHEN STATUS_NORMALIZED = 'WRITTEN_OFF' AND HOLDER_BUCKET = 'customer' THEN 1 ELSE 0 END) AS written_off,
    SUM(CASE WHEN STATUS_NORMALIZED = 'IDLE' AND HOLDER_BUCKET = 'customer' THEN 1 ELSE 0 END) AS idle,
    SUM(CASE WHEN AGING_BUCKET = 'active' AND HOLDER_BUCKET = 'customer' THEN 1 ELSE 0 END) AS recharge_active,
    SUM(CASE WHEN AGING_BUCKET NOT IN ('active', 'no_recharge_history') AND HOLDER_BUCKET = 'customer' THEN 1 ELSE 0 END) AS recharge_expired,
    COUNT(DISTINCT CASE WHEN CUSTOMER_ACCOUNT_ID IS NOT NULL AND HOLDER_BUCKET = 'customer' THEN CUSTOMER_ACCOUNT_ID END) AS total_customers
FROM enriched{where_or_and(fc, existing_where=False)}
"""


def _leaderboard_sql(
    limit: int | None,
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
) -> str:
    fc = _build_filter_clause(device_type, holder_bucket, status)
    extra = f" {fc}" if fc else ""
    limit_clause = f"LIMIT {limit}" if limit else ""
    return f"""
WITH {enriched_cte()}
SELECT
    CUSTOMER_ACCOUNT_ID,
    COUNT(*) AS TOTAL_DEVICES,
    SUM(CASE WHEN STATUS_NORMALIZED = 'DEPLOYED' THEN 1 ELSE 0 END) AS DEPLOYED,
    SUM(CASE WHEN STATUS_NORMALIZED = 'INSTALLED' THEN 1 ELSE 0 END) AS INSTALLED,
    SUM(CASE WHEN STATUS_NORMALIZED = 'LOST' THEN 1 ELSE 0 END) AS LOST,
    SUM(CASE WHEN STATUS_NORMALIZED = 'WRITTEN_OFF' THEN 1 ELSE 0 END) AS WRITTEN_OFF,
    SUM(CASE WHEN STATUS_NORMALIZED = 'IDLE' THEN 1 ELSE 0 END) AS IDLE,
    SUM(CASE WHEN AGING_BUCKET = 'active' THEN 1 ELSE 0 END) AS RECHARGE_ACTIVE,
    SUM(CASE WHEN AGING_BUCKET NOT IN ('active', 'no_recharge_history') THEN 1 ELSE 0 END) AS RECHARGE_EXPIRED
FROM enriched
WHERE CUSTOMER_ACCOUNT_ID IS NOT NULL
  AND HOLDER_BUCKET = 'customer'{extra}
GROUP BY 1
ORDER BY TOTAL_DEVICES DESC
{limit_clause}
"""



@router.get("/summary")
def get_customer_summary(
    limit: int = 200,
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> dict:
    """Customer KPIs plus a leaderboard of top customers by device count.

    `total_customers` is a real COUNT(DISTINCT ...), NOT len(leaderboard_rows) -
    the latter silently equals whatever `limit` you passed (or Metabase's
    ~2000-row ad-hoc cap, whichever is smaller), which previously made
    "showing 2,000 of 2,000 customers" claim there were only 2,000 total
    when there were actually 205,000+.
    """
    kpi_rows = client.query(_kpi_sql(device_type, holder_bucket, status))
    kpis = kpi_rows[0] if kpi_rows else {}
    leaderboard_rows = client.query(_leaderboard_sql(limit, device_type, holder_bucket, status))
    total_customers = kpis.get("TOTAL_CUSTOMERS") or len(leaderboard_rows)
    return {
        "kpis": {
            "total_customer_devices": kpis.get("TOTAL_CUSTOMER_DEVICES"),
            "deployed": kpis.get("DEPLOYED"),
            "installed": kpis.get("INSTALLED"),
            "lost": kpis.get("LOST"),
            "written_off": kpis.get("WRITTEN_OFF"),
            "idle": kpis.get("IDLE"),
            "recharge_active": kpis.get("RECHARGE_ACTIVE"),
            "recharge_expired": kpis.get("RECHARGE_EXPIRED"),
        },
        "leaderboard": {
            "rows": leaderboard_rows,
            "total_customers": total_customers,
        },
    }


@router.get("/leaderboard.csv")
def export_customer_leaderboard_csv(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    client: WarehouseClient = Depends(get_warehouse_client),
) -> Response:
    """Export ALL customers by device count as CSV - unbounded, no limit.

    Uses query_csv() (Metabase's dedicated CSV export endpoint), not query()
    (which silently caps at ~2000 rows regardless of the SQL's own LIMIT -
    that's what caused exports to only ever contain 2,000 rows before this
    fix, no matter how many customers actually existed).
    """
    csv_text = client.query_csv(_leaderboard_sql(None, device_type, holder_bucket, status))
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="customer_leaderboard.csv"'},
    )
