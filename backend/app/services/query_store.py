"""Every SQL fragment that drives the device pipeline - user-editable.

Two kinds of entries:

  "statement"  - a full SELECT/WITH producing one row per device_id, joined
                 into the pipeline (grn_dedup, status_location, recharge_expiry).
  "expression" - a scalar SQL expression (usually a CASE) spliced inline into
                 the enriched CTE (holder_bucket, status_normalized, etc).
                 These reference join aliases (sl., re., d.) that only exist
                 inside that CTE, so they aren't independently testable the
                 way statements are.

Stored as JSON on disk so they survive backend restarts and can be edited
from the Schema Config page without a code deploy. Defaults match the exact
queries/logic given for this project - nothing invented. Every fragment used
anywhere in the pipeline is listed here; none are hardcoded elsewhere.
"""

from __future__ import annotations

import json
import re
import threading
from pathlib import Path

_STORE_PATH = Path(__file__).resolve().parent.parent / "data" / "custom_queries.json"

# name -> (kind, label, default_sql)
_REGISTRY: dict[str, tuple[str, str, str]] = {
    "grn_dedup": (
        "statement",
        "GRN Dedup (base device list)",
        """
SELECT im.*
FROM PROD_DB.DBT_INVENTORY_REQUEST.INVENTORY_MODEL im
LEFT JOIN (
    SELECT im.DEVICE_ID
    FROM PROD_DB.DBT_INVENTORY_REQUEST.INVENTORY_MODEL im
    JOIN (
        SELECT mac_id, device_id
        FROM PROD_DB.DBT_INVENTORY_REQUEST.INVENTORY_MODEL td
        WHERE DEVICE_ID LIKE 'PNM%'
    ) t1 ON t1.DEVICE_ID <> im.DEVICE_ID AND t1.mac_id = im.MAC_ID
) t2 ON t2.device_id = im.DEVICE_ID
WHERE t2.device_id IS NULL
""".strip(),
    ),
    "status_location": (
        "statement",
        "Status & Location (raw T_DEVICE derivation)",
        """
SELECT
    upper(trim(t.DEVICE_ID)) AS device_id,
    t.LCO_ACCOUNT_ID,
    t.USER_ACCOUNT_ID,
    t.CONNECTION_ID,
    t."SOURCE",
    s.status1,
    CASE WHEN t.LCO_ACCOUNT_ID IS NULL THEN 'wiom'
         WHEN s.status1 IN ('RETURNED','PENDING_CSP_RECEIPT') THEN 'wiom'
         WHEN s.status1 IN ('CUSTODIED','IDLE','RETRIEVAL_PENDING') THEN 'partner'
         WHEN s.status1 IN ('CUSTOMER_RECOVERY_PENDING','DEPLOYED') THEN 'customer'
         WHEN s.status1 IN ('WRITTEN_OFF','LOST') AND t.USER_ACCOUNT_ID IS NOT NULL THEN 'customer'
         WHEN s.status1 IN ('WRITTEN_OFF','LOST') AND t.USER_ACCOUNT_ID IS NULL THEN 'partner'
         WHEN t.USER_ACCOUNT_ID IS NOT NULL THEN 'customer'
         WHEN t.LCO_ACCOUNT_ID IS NOT NULL THEN 'partner' END AS location
FROM PROD_DB.DBT_INVENTORY_REQUEST.T_DEVICE t
CROSS JOIN LATERAL (
    SELECT CASE t.status
                WHEN 'SALE_TO_PARTNER' THEN 'WRITTEN_OFF'
                WHEN 'IN_WAREHOUSE' THEN 'RETURNED'
                WHEN 'INSTALLED' THEN 'DEPLOYED'
                WHEN 'TO_BE_PICKED_UP' THEN 'CUSTOMER_RECOVERY_PENDING'
                WHEN 'IN_TRANSIT' THEN 'PENDING_CSP_RECEIPT'
                ELSE t.status END AS status1
) s
""".strip(),
    ),
    "recharge_expiry": (
        "statement",
        "Recharge Expiry",
        """
SELECT
    upper(trim(td.DEVICE_ID)) as device_id,
    td.LONG_NAS_ID,
    max(trum.OTP_EXPIRY_TIME + INTERVAL '330 minutes') AS last_expiry
FROM PROD_DB.MASTER_DB_READ_DBO.T_DEVICE td
LEFT JOIN PROD_DB.DBT.T_ROUTER_USER_MAPPING trum ON td.LONG_NAS_ID = trum.ROUTER_NAS_ID
                                                 AND trum.OTP = 'DONE'
                                                 AND trum.DEVICE_LIMIT = 10
GROUP BY ALL
""".strip(),
    ),
    "status_normalized_expr": (
        "expression",
        "Status Normalization (blank/typo cleanup)",
        """
CASE
    WHEN sl.status1 IS NULL OR TRIM(sl.status1) = '' THEN 'UNKNOWN'
    WHEN sl.status1 = 'IN_WAREHOUES' THEN 'IN_WAREHOUSE'
    ELSE sl.status1
END
""".strip(),
    ),
    "holder_bucket_expr": (
        "expression",
        "Holder Bucket (wiom_warehouse / returned_to_wiom / customer / partner)",
        """
CASE
    WHEN sl.location = 'wiom' AND FIRST_DISPATCHED_DATE IS NULL THEN 'wiom_warehouse'
    WHEN sl.location = 'wiom' AND FIRST_DISPATCHED_DATE IS NOT NULL THEN 'returned_to_wiom'
    WHEN sl.location = 'customer' THEN 'customer'
    WHEN sl.location = 'partner' THEN 'partner'
    ELSE 'unknown'
END
""".strip(),
    ),
    "dispatch_bucket_expr": (
        "expression",
        "Dispatch Bucket (never_dispatched / dispatched)",
        """
CASE
    WHEN FIRST_DISPATCHED_DATE IS NULL THEN 'never_dispatched'
    ELSE 'dispatched'
END
""".strip(),
    ),
    "grn_source_bucket_expr": (
        "expression",
        "GRN Source Bucket (fresh_grn / ssot_csp / other)",
        """
CASE
    WHEN DATA_SOURCE = 'inbound_inward_devices' THEN 'fresh_grn'
    WHEN DATA_SOURCE = 't_device_devices' THEN 'ssot_csp'
    ELSE 'other'
END
""".strip(),
    ),
    "device_type_normalized_expr": (
        "expression",
        "Device Type Normalization (ONT / Router / Unknown)",
        """
CASE
    WHEN DEVICE_TYPE IN ('ONT', 'Router') THEN DEVICE_TYPE
    ELSE 'Unknown'
END
""".strip(),
    ),
    "aging_bucket_expr": (
        "expression",
        "Ageing Bucket (0-15 ... 365+, computed from resolved recharge expiry)",
        """
CASE
    WHEN re.last_expiry IS NULL THEN 'no_recharge_history'
    WHEN re.last_expiry >= CURRENT_DATE() THEN 'active'
    WHEN DATEDIFF('day', re.last_expiry, CURRENT_DATE()) <= 15 THEN '0-15'
    WHEN DATEDIFF('day', re.last_expiry, CURRENT_DATE()) <= 30 THEN '15-30'
    WHEN DATEDIFF('day', re.last_expiry, CURRENT_DATE()) <= 45 THEN '30-45'
    WHEN DATEDIFF('day', re.last_expiry, CURRENT_DATE()) <= 60 THEN '45-60'
    WHEN DATEDIFF('day', re.last_expiry, CURRENT_DATE()) <= 90 THEN '60-90'
    WHEN DATEDIFF('day', re.last_expiry, CURRENT_DATE()) <= 120 THEN '90-120'
    WHEN DATEDIFF('day', re.last_expiry, CURRENT_DATE()) <= 180 THEN '120-180'
    WHEN DATEDIFF('day', re.last_expiry, CURRENT_DATE()) <= 240 THEN '180-240'
    WHEN DATEDIFF('day', re.last_expiry, CURRENT_DATE()) <= 365 THEN '240-365'
    ELSE '365+'
END
""".strip(),
    ),
    "invoice_date_expr": (
        "expression",
        "Invoice Date (from FIRST_GRN_DETAIL JSON)",
        "TRY_TO_TIMESTAMP_NTZ(FIRST_GRN_DETAIL:invoice_date::string)",
    ),
    "invoice_number_expr": (
        "expression",
        "Invoice Number (from FIRST_GRN_DETAIL JSON)",
        "FIRST_GRN_DETAIL:invoice_number::string",
    ),
    "partner_master": (
        "statement",
        "Partner Master (name/mobile/status/city from supply_model + t_account)",
        """
SELECT
    sm.partner_account_id AS partner_account_id,
    sm.partner_name,
    sm.partner_mobile,
    sm.partner_status,
    sm.zone,
    GetCity2(ta.logical_group) AS city,
    sm.account_manager
FROM prod_db.public.supply_model sm
LEFT JOIN prod_db.public.t_account ta ON sm.partner_account_id = ta.id
""".strip(),
    ),
    "csp_active_partners": (
        "statement",
        "CSP Active Partners (distinct partner_id with a live, verified CSP_ACCOUNT row)",
        """
SELECT DISTINCT partner_id
FROM PROD_DB.CSP_GATEWAY_SERVICE_CSP_GATEWAY_SERVICE.CSP_ACCOUNT
WHERE csp_id NOT IN ('a0a6w1', 'a0a0b1') AND partner_id IS NOT NULL AND _fivetran_active
""".strip(),
    ),
    "write_off_date_expr": (
        "expression",
        "Write-off Date (best-effort - no dedicated column exists)",
        """
CASE WHEN d.STATUS = 'WRITTEN_OFF' THEN
    COALESCE(
        d.STATUS_UPDATED_AT,
        TRY_TO_TIMESTAMP_NTZ(d.LAST_PICKUP_TICKET_DETAILS:final_resolved_time::string)
    )
ELSE NULL END
""".strip(),
    ),
}

_READ_HEADS = {"select", "with"}
_MUTATION_RE = re.compile(
    r"\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke)\b", re.I
)
_lock = threading.Lock()


def _assert_read_only(sql: str, kind: str = "statement") -> None:
    stripped = sql.strip()
    if not stripped:
        raise ValueError("Query cannot be empty.")

    if kind == "statement":
        head_match = re.match(r"[(\s]*([A-Za-z_]+)", stripped)
        head = head_match.group(1).lower() if head_match else ""
        if head not in _READ_HEADS:
            raise ValueError(f"Must start with SELECT or WITH, got '{head.upper()}'.")

    found = _MUTATION_RE.search(stripped)
    if found:
        raise ValueError(f"Mutating keyword '{found.group(1).upper()}' is not allowed here.")


def _load() -> dict[str, str]:
    defaults = {name: default_sql for name, (_, _, default_sql) in _REGISTRY.items()}
    if not _STORE_PATH.exists():
        return defaults
    with open(_STORE_PATH, encoding="utf-8") as f:
        stored = json.load(f)
    return {**defaults, **{k: v for k, v in stored.items() if k in _REGISTRY}}


def _save(values: dict[str, str]) -> None:
    _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(values, f, indent=2)


def get_all() -> dict[str, dict]:
    current = _load()
    return {
        name: {
            "sql": current[name],
            "kind": kind,
            "label": label,
            "is_default": current[name] == default_sql,
        }
        for name, (kind, label, default_sql) in _REGISTRY.items()
    }


def get(name: str) -> str:
    if name not in _REGISTRY:
        raise KeyError(f"Unknown query '{name}'.")
    return _load()[name]


def kind_of(name: str) -> str:
    if name not in _REGISTRY:
        raise KeyError(f"Unknown query '{name}'.")
    return _REGISTRY[name][0]


def set_query(name: str, sql: str) -> None:
    if name not in _REGISTRY:
        raise KeyError(f"Unknown query '{name}'.")
    _assert_read_only(sql, kind_of(name))
    with _lock:
        current = _load()
        current[name] = sql.strip()
        _save(current)


def reset_query(name: str) -> None:
    if name not in _REGISTRY:
        raise KeyError(f"Unknown query '{name}'.")
    with _lock:
        current = _load()
        current.pop(name, None)
        _save(current)
