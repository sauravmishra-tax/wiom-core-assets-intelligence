"""Fixed-asset-register style cuts: purchase/write-off by fiscal year,
cumulative write-off %, purchase-year cohort write-off mapping, and a
location-wise write-off view.

IMPORTANT COVERAGE CAVEAT: INVENTORY_MODEL only has GRN/invoice data from
2024-04-27 onwards (verified against Snowflake directly) - there is no
device-level history back to company incorporation (FY15-16) in this table.
A manually-maintained asset register with older cohorts is a separate source
that this endpoint cannot reconstruct; these cuts are real and live, but
scoped to FY24-25 onwards only. Every response includes a `coverage` block
saying so explicitly - don't drop that from the UI.

Fiscal year = India convention, April-March (e.g. "25-26" = 1 Apr 2025 to
31 Mar 2026), derived from INVOICE_DATE (purchase) and WRITE_OFF_DATE
(write-off), both already computed by enriched_cte().

Device types: Router and ONT only. There is no "ONU" category in
DEVICE_TYPE_NORMALIZED (verified: raw DEVICE_TYPE only ever has
'Router' / 'ONT' / 'Invalid') - if a separate asset register distinguishes
ONU from ONT, that split doesn't exist in this warehouse table.
"""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends

from app.services.sql_fragments import enriched_cte
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

router = APIRouter(prefix="/api/asset-register", tags=["asset-register"])

_DEVICE_TYPES = ("Router", "ONT")

# First calendar date any GRN/invoice record exists in INVENTORY_MODEL, per
# direct Snowflake check - the coverage banner uses this, not a guess.
_DATA_START = date(2024, 4, 27)


def _fy_expr(date_col: str) -> str:
    return f"""
CASE
    WHEN {date_col} IS NULL THEN NULL
    WHEN MONTH({date_col}) >= 4
        THEN CONCAT(RIGHT(YEAR({date_col})::string, 2), '-', RIGHT((YEAR({date_col}) + 1)::string, 2))
    ELSE CONCAT(RIGHT((YEAR({date_col}) - 1)::string, 2), '-', RIGHT(YEAR({date_col})::string, 2))
END
""".strip()


def _fy_key(fy_label: str) -> int:
    """Sort key for 'YY-YY' labels, chronological not alphabetical."""
    start_yy = int(fy_label.split("-")[0])
    return 2000 + start_yy if start_yy < 50 else 1900 + start_yy


def _fy_end_date(fy_label: str) -> date:
    """31 March of the FY's second year, e.g. '24-25' -> 2025-03-31."""
    start_year = _fy_key(fy_label)
    return date(start_year + 1, 3, 31)


def _fy_range_from_today(start_fy_key: int) -> list[str]:
    today = datetime.now().date()
    current_fy_start = today.year if today.month >= 4 else today.year - 1
    labels = []
    y = start_fy_key
    while y <= current_fy_start:
        labels.append(f"{y % 100:02d}-{(y + 1) % 100:02d}")
        y += 1
    return labels


def _coverage() -> dict:
    return {
        "data_starts": _DATA_START.isoformat(),
        "note": (
            "INVENTORY_MODEL only has GRN/invoice records from "
            f"{_DATA_START.isoformat()} onwards - there is no device-level "
            "history back to company incorporation in this table. Older "
            "fiscal years (pre FY24-25) will show as empty here; they live "
            "only in a separately-maintained asset register, if one exists."
        ),
    }


@router.get("/purchase-writeoff")
def get_purchase_writeoff(client: WarehouseClient = Depends(get_warehouse_client)) -> dict:
    """Purchase quantity and write-off quantity by fiscal year x device type."""
    sql = f"""
WITH {enriched_cte()},
fy AS (
    SELECT
        DEVICE_TYPE_NORMALIZED,
        {_fy_expr("INVOICE_DATE")} AS PURCHASE_FY,
        {_fy_expr("WRITE_OFF_DATE")} AS WRITEOFF_FY
    FROM enriched
    WHERE DEVICE_TYPE_NORMALIZED IN ('Router', 'ONT')
)
SELECT 'purchase' AS KIND, DEVICE_TYPE_NORMALIZED, PURCHASE_FY AS FY, COUNT(*) AS DEVICE_COUNT
FROM fy WHERE PURCHASE_FY IS NOT NULL GROUP BY 1, 2, 3
UNION ALL
SELECT 'write_off' AS KIND, DEVICE_TYPE_NORMALIZED, WRITEOFF_FY AS FY, COUNT(*) AS DEVICE_COUNT
FROM fy WHERE WRITEOFF_FY IS NOT NULL GROUP BY 1, 2, 3
"""
    rows = client.query(sql)
    return {"coverage": _coverage(), "device_types": list(_DEVICE_TYPES), "rows": rows}


@router.get("/cumulative")
def get_cumulative(client: WarehouseClient = Depends(get_warehouse_client)) -> dict:
    """Cumulative purchased/written-off by FY closure, plus both write-off %
    formulas (of same-year cumulative purchased, and of prior-year cumulative
    purchased - the two variants seen in finance-style asset registers)."""
    sql = f"""
WITH {enriched_cte()},
fy AS (
    SELECT
        DEVICE_TYPE_NORMALIZED,
        {_fy_expr("INVOICE_DATE")} AS PURCHASE_FY,
        {_fy_expr("WRITE_OFF_DATE")} AS WRITEOFF_FY
    FROM enriched
    WHERE DEVICE_TYPE_NORMALIZED IN ('Router', 'ONT')
)
SELECT 'purchase' AS KIND, DEVICE_TYPE_NORMALIZED, PURCHASE_FY AS FY, COUNT(*) AS DEVICE_COUNT
FROM fy WHERE PURCHASE_FY IS NOT NULL GROUP BY 1, 2, 3
UNION ALL
SELECT 'write_off' AS KIND, DEVICE_TYPE_NORMALIZED, WRITEOFF_FY AS FY, COUNT(*) AS DEVICE_COUNT
FROM fy WHERE WRITEOFF_FY IS NOT NULL GROUP BY 1, 2, 3
"""
    rows = client.query(sql)

    all_fys = sorted({r["FY"] for r in rows}, key=_fy_key)
    result = {}
    for device_type in _DEVICE_TYPES:
        purchase_by_fy = {r["FY"]: r["DEVICE_COUNT"] for r in rows if r["KIND"] == "purchase" and r["DEVICE_TYPE_NORMALIZED"] == device_type}
        writeoff_by_fy = {r["FY"]: r["DEVICE_COUNT"] for r in rows if r["KIND"] == "write_off" and r["DEVICE_TYPE_NORMALIZED"] == device_type}

        cum_purchased = 0
        cum_writeoff = 0
        prev_cum_purchased = 0
        fy_rows = []
        for fy in all_fys:
            cum_purchased += purchase_by_fy.get(fy, 0)
            cum_writeoff += writeoff_by_fy.get(fy, 0)
            pct_of_same_year = round(100 * cum_writeoff / cum_purchased, 1) if cum_purchased else 0.0
            pct_of_prior_year = round(100 * cum_writeoff / prev_cum_purchased, 1) if prev_cum_purchased else 0.0
            fy_rows.append({
                "fy": fy,
                "purchased_this_year": purchase_by_fy.get(fy, 0),
                "written_off_this_year": writeoff_by_fy.get(fy, 0),
                "cumulative_purchased": cum_purchased,
                "cumulative_written_off": cum_writeoff,
                "pct_of_cumulative": pct_of_same_year,
                "pct_of_cumulative_vs_prior_year": pct_of_prior_year,
            })
            prev_cum_purchased = cum_purchased
        result[device_type] = fy_rows

    return {"coverage": _coverage(), "fiscal_years": all_fys, "by_device_type": result}


@router.get("/cohort-writeoff")
def get_cohort_writeoff(client: WarehouseClient = Depends(get_warehouse_client)) -> dict:
    """Purchase-year cohort x write-off-closure-year mapping: of the devices
    purchased in FY X, how many were written off (cumulatively) by each
    subsequent fiscal-year close. 'Active' = not written off as of today."""
    sql = f"""
WITH {enriched_cte()},
fy AS (
    SELECT
        DEVICE_TYPE_NORMALIZED,
        {_fy_expr("INVOICE_DATE")} AS PURCHASE_FY,
        WRITE_OFF_DATE
    FROM enriched
    WHERE DEVICE_TYPE_NORMALIZED IN ('Router', 'ONT')
      AND {_fy_expr("INVOICE_DATE")} IS NOT NULL
)
SELECT DEVICE_TYPE_NORMALIZED, PURCHASE_FY, COUNT(*) AS TOTAL,
       SUM(CASE WHEN WRITE_OFF_DATE IS NOT NULL THEN 1 ELSE 0 END) AS WRITTEN_OFF_TO_DATE
FROM fy
GROUP BY 1, 2
"""
    cohort_totals = client.query(sql)
    purchase_fys = sorted({r["PURCHASE_FY"] for r in cohort_totals}, key=_fy_key)
    if not purchase_fys:
        return {"coverage": _coverage(), "closures": [], "by_device_type": {}}

    closures = _fy_range_from_today(_fy_key(purchase_fys[0]))
    closure_dates = {fy: _fy_end_date(fy).isoformat() for fy in closures}

    union_parts = []
    for closure_fy, closure_date in closure_dates.items():
        union_parts.append(f"""
SELECT '{closure_fy}' AS CLOSURE_FY, DEVICE_TYPE_NORMALIZED, PURCHASE_FY, COUNT(*) AS CUM_WRITEOFF
FROM fy
WHERE WRITE_OFF_DATE IS NOT NULL AND WRITE_OFF_DATE <= '{closure_date}'
GROUP BY 2, 3
""")
    closure_sql = f"""
WITH {enriched_cte()},
fy AS (
    SELECT
        DEVICE_TYPE_NORMALIZED,
        {_fy_expr("INVOICE_DATE")} AS PURCHASE_FY,
        WRITE_OFF_DATE
    FROM enriched
    WHERE DEVICE_TYPE_NORMALIZED IN ('Router', 'ONT')
      AND {_fy_expr("INVOICE_DATE")} IS NOT NULL
)
{"UNION ALL".join(union_parts)}
"""
    closure_rows = client.query(closure_sql)

    result = {}
    for device_type in _DEVICE_TYPES:
        totals_by_cohort = {
            r["PURCHASE_FY"]: {"total": r["TOTAL"], "written_off_to_date": r["WRITTEN_OFF_TO_DATE"]}
            for r in cohort_totals if r["DEVICE_TYPE_NORMALIZED"] == device_type
        }
        cum_by_cohort_closure: dict[str, dict[str, int]] = {}
        for r in closure_rows:
            if r["DEVICE_TYPE_NORMALIZED"] != device_type:
                continue
            cum_by_cohort_closure.setdefault(r["PURCHASE_FY"], {})[r["CLOSURE_FY"]] = r["CUM_WRITEOFF"]

        cohorts = []
        for cohort_fy in purchase_fys:
            info = totals_by_cohort.get(cohort_fy, {"total": 0, "written_off_to_date": 0})
            by_closure = cum_by_cohort_closure.get(cohort_fy, {})
            total = info["total"]
            written_off_to_date = info["written_off_to_date"]
            cohorts.append({
                "cohort_fy": cohort_fy,
                "total_purchased": total,
                "cumulative_written_off_by_closure": {c: by_closure.get(c, 0) for c in closures},
                "active": total - written_off_to_date,
                "written_off_pct_to_date": round(100 * written_off_to_date / total, 1) if total else 0.0,
            })
        result[device_type] = cohorts

    return {"coverage": _coverage(), "closures": closures, "by_device_type": result}


@router.get("/location-writeoff")
def get_location_writeoff(client: WarehouseClient = Depends(get_warehouse_client)) -> dict:
    """Write-off-FY x holder location (Customer/Partner/WIOM) x recharge
    recency, using a fixed 2025-04-01 cutoff. ASSUMPTION (not a stored
    business rule): 'recency' here means the device's last resolved recharge
    expiry date relative to that cutoff; devices with no recharge history at
    all get their own 'No_Recharge_Found' bucket. Adjust the cutoff/logic in
    this file if your team defines "before/after" differently."""
    cutoff = "2025-04-01"
    sql = f"""
WITH {enriched_cte()}
SELECT
    {_fy_expr("WRITE_OFF_DATE")} AS WRITEOFF_FY,
    CASE
        WHEN HOLDER_BUCKET = 'customer' THEN 'Customer'
        WHEN HOLDER_BUCKET = 'partner' THEN 'Partner'
        ELSE 'WIOM'
    END AS LOCATION,
    CASE
        WHEN RESOLVED_RECHARGE_EXPIRY IS NULL THEN 'No_Recharge_Found'
        WHEN RESOLVED_RECHARGE_EXPIRY >= '{cutoff}' THEN 'After_2025-04-01'
        ELSE 'Before_2025-04-01'
    END AS RECENCY,
    COUNT(*) AS DEVICE_COUNT
FROM enriched
WHERE STATUS_NORMALIZED = 'WRITTEN_OFF' AND WRITE_OFF_DATE IS NOT NULL
GROUP BY 1, 2, 3
"""
    rows = client.query(sql)
    return {"coverage": _coverage(), "cutoff_date": cutoff, "rows": rows}
