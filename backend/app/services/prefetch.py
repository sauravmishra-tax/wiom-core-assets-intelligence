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

Deliberately scoped to those 4 pages (the ones actually reported slow) -
every other page still warms lazily on first visit, same as before.
"""

from __future__ import annotations

import logging
import threading

from app.api import ageing, executive, inventory, partners
from app.services.warehouse_client import WarehouseClient, get_warehouse_client

logger = logging.getLogger(__name__)

# (label, callable) - each callable takes the shared client and issues
# exactly the SQL a default (no-filter) page load would, so it lands in the
# same cache slot the frontend's next request will look up.
_TASKS: list[tuple[str, "callable"]] = [
    ("executive kpis", lambda c: executive.get_executive_kpis(client=c)),
    ("data quality", lambda c: executive.get_data_quality(client=c)),
    ("location device matrix", lambda c: executive.get_location_device_matrix(client=c)),
    ("inventory breakdown", lambda c: inventory.get_inventory_breakdown(client=c)),
    ("partner summary", lambda c: partners.get_partner_summary(limit=5000, client=c)),
    ("ageing matrix (all)", lambda c: ageing.get_ageing_matrix(client=c)),
    ("ageing matrix (customer only, CX Ageing)", lambda c: ageing.get_ageing_matrix(holder_bucket="customer", client=c)),
    ("holder-device matrix", lambda c: ageing.get_holder_device_matrix(client=c)),
    ("financial write-off matrix (customer only, CX Ageing)", lambda c: ageing.get_financial_writeoff_matrix(holder_bucket="customer", client=c)),
]


def _run(client: WarehouseClient, reason: str) -> None:
    for label, fn in _TASKS:
        try:
            fn(client)
        except Exception:  # noqa: BLE001 - one slow/broken query must not block the rest
            logger.exception("cache warm-up failed for %s (reason=%s)", label, reason)


def warm_cache_async(reason: str) -> None:
    """Fire-and-forget: refresh_now() already returned its response to the
    caller by the time this actually runs."""
    client = get_warehouse_client()
    thread = threading.Thread(target=_run, args=(client, reason), daemon=True, name="cache-warm")
    thread.start()
