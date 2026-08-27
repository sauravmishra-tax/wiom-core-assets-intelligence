"""Warms the query cache right after it's cleared, instead of leaving every
query cold until whichever user happens to open a page first.

Before this: cache_sync.refresh_now() only called invalidate_all() - the
daily 9 AM sync and the manual "Refresh data" button both *cleared* the
cache but never repopulated it. So every dashboard's first load after a
sync paid full Snowflake/Metabase latency (the heavy matrix queries go
through the CSV export path and can take real time), and the loading
skeleton sat there for seconds. Reference dashboards that feel instant are
usually serving a pre-baked snapshot, not a live query - this is the closest
equivalent without changing the app's live-query architecture: pre-run the
handful of default-filter queries that Summary, Executive, Recharge Ageing,
and CX Ageing always issue on first paint, in a background thread, so the
cache is already warm by the time a real user opens the page.

Covers every dashboard page's default (no-filter) landing query - not just
the ones reported slow - so a cold cache never surfaces on any page's
first load after a sync. Search/detail/CSV-export endpoints are excluded
on purpose: they're either dynamic (device search, device profile - no
"default" query exists) or already fast/rarely the first thing opened
(bulk CSV exports, which have their own long timeout and aren't shown as
a loading skeleton anyway).
"""

from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor

from app.api import (
    ageing,
    asset_register,
    cohort,
    customers,
    executive,
    inventory,
    inventory_matrix,
    invoice_register,
    lost_devices,
    partners,
    recon,
    vintage,
    warehouses,
)
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

logger = logging.getLogger(__name__)

# (label, callable) - each callable takes the shared client and issues
# exactly the SQL a default (no-filter) page load would, so it lands in the
# same cache slot the frontend's next request will look up.
_TASKS: list[tuple[str, "callable"]] = [
    # Summary / Executive
    ("executive kpis", lambda c: executive.get_executive_kpis(client=c)),
    ("data quality", lambda c: executive.get_data_quality(client=c)),
    ("location device matrix", lambda c: executive.get_location_device_matrix(client=c)),
    ("inventory breakdown", lambda c: inventory.get_inventory_breakdown(client=c)),
    ("partner summary", lambda c: partners.get_partner_summary(limit=5000, client=c)),
    # Recharge Ageing / CX Ageing
    ("ageing matrix (all)", lambda c: ageing.get_ageing_matrix(client=c)),
    ("ageing matrix (customer only, CX Ageing)", lambda c: ageing.get_ageing_matrix(holder_bucket="customer", client=c)),
    ("holder-device matrix", lambda c: ageing.get_holder_device_matrix(client=c)),
    ("financial write-off matrix (customer only, CX Ageing)", lambda c: ageing.get_financial_writeoff_matrix(holder_bucket="customer", client=c)),
    ("ageing segment matrix", lambda c: ageing.get_ageing_segment_matrix(client=c)),
    # Ageing Pivot / Inventory Matrix
    ("inventory matrix status", lambda c: inventory_matrix.get_status_matrix(client=c)),
    ("inventory matrix status (sub)", lambda c: inventory_matrix.get_status_matrix(sub=True, client=c)),
    ("inventory matrix writeoff-overlap", lambda c: inventory_matrix.get_writeoff_overlap(client=c)),
    ("inventory matrix ageing", lambda c: inventory_matrix.get_ageing_matrix(client=c)),
    ("inventory matrix invoice-fy", lambda c: inventory_matrix.get_invoice_fy_matrix(client=c)),
    # Vintage & Write-off
    ("vintage writeoff matrix", lambda c: vintage.get_writeoff_vintage_matrix(client=c)),
    # Asset Register
    ("asset register purchase-writeoff", lambda c: asset_register.get_purchase_writeoff(client=c)),
    ("asset register cumulative", lambda c: asset_register.get_cumulative(client=c)),
    ("asset register cohort-writeoff", lambda c: asset_register.get_cohort_writeoff(client=c)),
    ("asset register location-writeoff", lambda c: asset_register.get_location_writeoff(client=c)),
    # Partners & CSP (partner_summary above already covers this page too)
    # Warehouses
    ("warehouse breakdown", lambda c: warehouses.get_warehouse_breakdown(client=c)),
    # Lost Devices
    ("lost devices summary", lambda c: lost_devices.get_lost_devices_summary(client=c)),
    # Recon (FAR vs SSOT)
    ("recon invoice-summary", lambda c: recon.get_invoice_summary(client=c)),
    # Inventory Matrix / Cohort View
    ("cohort matrix", lambda c: cohort.get_cohort_matrix(client=c)),
    # Invoice Register
    ("invoice register summary", lambda c: invoice_register.get_invoice_summary(client=c)),
    # Customers
    ("customer summary", lambda c: customers.get_customer_summary(client=c)),
]


# Run several warm-up queries at once (not all ~28 serially, which would
# take minutes end-to-end) but capped, so a sync doesn't fire dozens of
# simultaneous requests at Metabase/Snowflake at once either.
_MAX_CONCURRENT_WARMUPS = 4


def _run(client: WarehouseClient, reason: str) -> None:
    def _warm_one(label: str, fn) -> None:
        try:
            fn(client)
        except Exception:  # noqa: BLE001 - one slow/broken query must not block the rest
            logger.exception("cache warm-up failed for %s (reason=%s)", label, reason)

    with ThreadPoolExecutor(max_workers=_MAX_CONCURRENT_WARMUPS, thread_name_prefix="cache-warm") as pool:
        futures = [pool.submit(_warm_one, label, fn) for label, fn in _TASKS]
        for f in futures:
            f.result()


def warm_cache_async(reason: str) -> None:
    """Fire-and-forget: refresh_now() already returned its response to the
    caller by the time this actually runs."""
    client = get_warehouse_client()
    thread = threading.Thread(target=_run, args=(client, reason), daemon=True, name="cache-warm")
    thread.start()
