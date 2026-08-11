"""Shared SQL building blocks over PROD_DB.PUBLIC.INVENTORY_MODEL.

Every fragment below is pulled from query_store at call time - nothing here
is hardcoded independently of the Schema Config page. See
app/services/query_store.py for the full registry and defaults.

  deduped          - one row per physical device (MAC-keyed anti-join against
                      PNM%-prefixed shadow records) - query_store["grn_dedup"].
  status_location  - STATUS1 + LOCATION per device, from raw T_DEVICE -
                      query_store["status_location"].
  recharge_expiry  - LAST_EXPIRY per device, from T_DEVICE x
                      T_ROUTER_USER_MAPPING - query_store["recharge_expiry"].
  enriched         - deduped rows joined to the above two, plus the
                      dispatch/aging/GRN/invoice/write-off expressions
                      (all also from query_store).

Open gap: "Migrated CSP" vs "Old partner (pending FNF)" cannot be derived
from this table. All dispatched-to-partner rows share
DATA_SOURCE='t_device_devices' regardless of migration status - that
distinction lives on the partner record (see the `partner_account` dbt
model, joinable on PARTNER_ACCOUNT_ID), not on the device.
"""

from __future__ import annotations

from app.services import query_store

INVENTORY_TABLE = "PROD_DB.PUBLIC.INVENTORY_MODEL"

AGING_BUCKET_ORDER = [
    "active",
    "0-15",
    "15-30",
    "30-45",
    "45-60",
    "60-90",
    "90-120",
    "120-180",
    "180-240",
    "240-365",
    "365+",
    "no_recharge_history",
]


def deduped_cte() -> str:
    grn_dedup_sql = query_store.get("grn_dedup")
    return f"""
    deduped AS (
        {grn_dedup_sql}
    )
    """.strip()


def enriched_cte() -> str:
    status_location_sql = query_store.get("status_location")
    recharge_expiry_sql = query_store.get("recharge_expiry")

    status_normalized_expr = query_store.get("status_normalized_expr")
    holder_bucket_expr = query_store.get("holder_bucket_expr")
    dispatch_bucket_expr = query_store.get("dispatch_bucket_expr")
    grn_source_bucket_expr = query_store.get("grn_source_bucket_expr")
    device_type_normalized_expr = query_store.get("device_type_normalized_expr")
    aging_bucket_expr = query_store.get("aging_bucket_expr")
    invoice_date_expr = query_store.get("invoice_date_expr")
    invoice_number_expr = query_store.get("invoice_number_expr")
    write_off_date_expr = query_store.get("write_off_date_expr")

    return f"""
    {deduped_cte()},
    status_location AS (
        {status_location_sql}
    ),
    recharge_expiry AS (
        {recharge_expiry_sql}
    ),
    enriched AS (
        SELECT
            d.*,
            sl.status1 AS RAW_STATUS1,
            sl.location AS RAW_LOCATION,
            re.last_expiry AS RESOLVED_RECHARGE_EXPIRY,
            {status_normalized_expr} AS STATUS_NORMALIZED,
            {device_type_normalized_expr} AS DEVICE_TYPE_NORMALIZED,
            {invoice_date_expr} AS INVOICE_DATE,
            YEAR({invoice_date_expr}) AS INVOICE_YEAR,
            {invoice_number_expr} AS INVOICE_NUMBER,
            {write_off_date_expr} AS WRITE_OFF_DATE,
            YEAR({write_off_date_expr}) AS WRITE_OFF_YEAR,
            {dispatch_bucket_expr} AS DISPATCH_BUCKET,
            {holder_bucket_expr} AS HOLDER_BUCKET,
            {grn_source_bucket_expr} AS GRN_SOURCE_BUCKET,
            {aging_bucket_expr} AS AGING_BUCKET
        FROM deduped d
        LEFT JOIN status_location sl ON sl.device_id = upper(trim(d.DEVICE_ID))
        LEFT JOIN recharge_expiry re ON re.device_id = upper(trim(d.DEVICE_ID))
        WHERE d.CURRENT_LOCATION IS DISTINCT FROM 'test'
          AND d.DEVICE_ID IS NOT NULL AND TRIM(d.DEVICE_ID) <> ''
    )
    """.strip()
