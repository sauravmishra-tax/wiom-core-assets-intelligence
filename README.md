# WIOM Asset Intelligence Platform

Live device lifecycle, ageing, and recovery visibility over
`PROD_DB.DBT_INVENTORY_REQUEST.INVENTORY_MODEL` (~373K devices: Router/ONT/ONU).

## Status (verified against live production data)

Built and running end-to-end against real Snowflake data via Metabase:

- **Executive Dashboard** (`/executive`) — all top-line KPI cards + holder/status charts
- **Inventory Dashboard** (`/inventory`) — Fresh GRN / SSOT & CSP / Other breakdown, deduplicated
- **Ageing Dashboard** (`/ageing`) + **Ageing Pivot** (`/ageing-pivot`) — bucket × status cross-tab
  and CSP/EX-CSP/WIOM segment pivot, both computed live every request
- **Vintage & Write-off** (`/vintage`) — purchase-year cohort write-off/lost rates
- **Partners** (`/partners`) — leaderboard with partner name/mobile/city/status (joined from
  `supply_model`/`t_account`, not just the raw account id)
- **CSP Devices** (`/csp`), **Warehouses** (`/warehouses`), **Recharge** (`/recharge`),
  **Lost Devices** (`/lost-devices`), **Customers** (`/customers`)
- **Device Search** (`/search`) — by Device ID, MAC, Serial, Partner/Customer account id
  (partner/customer *name* search is still not wired up - see gaps below)
- **Device Profile** (`/devices/[id]`) — full record for one device
- **Auth** — email/password login with `admin`/`viewer` roles, enforced server-side via bearer
  token (`app/core/security.py`), not just a frontend flag
- **Users** (`/users`, admin-only) — add/remove logins, assign role
- **Audit Log** (`/audit-log`, admin-only) — records every login, user add/remove, and Schema
  Config edit (who/what/when)
- **Schema Config** (`/schema-config`, admin-only) — every SQL fragment driving the app, editable
  live with dry-run test, no restart needed

Still open: Movement Timeline, SSO/JWT (current auth is a simple in-house token, not SSO),
date-range/trend filtering (everything is point-in-time), and real database-backed audit trail
with diff/rollback beyond "reset one query to its default."

## Architecture

```
backend/   FastAPI, Python. Queries Snowflake through the Metabase REST API
           (no new DB credentials needed - reuses the same access already
           verified working). All aggregate endpoints share one set of SQL
           CTEs (app/services/sql_fragments.py) so every dashboard counts
           devices identically.
frontend/  Next.js 16 (App Router) + TypeScript + Tailwind + Recharts.
           Browser calls same-origin /api/*; next.config.ts rewrites that
           server-side to the backend, so the browser never talks cross-origin
           to the backend directly (avoids CORS, and works from restricted
           network contexts like this session's sandboxed preview browser).
```

### Deliberately deferred from the original spec, and why

- **Postgres + SQLAlchemy + Alembic** — this is a read-only analytics layer over
  an existing warehouse table. A local database has nothing to own yet; adding
  one now would be unused infrastructure. Revisit if/when we need write paths
  (annotations, saved views, audit trail we own).
- **Redis** — replaced with an in-process TTL cache
  (`app/services/warehouse_client.py`) for Phase 1's traffic. Swap in Redis
  when this runs multi-instance.
- **Full JWT / SSO** — a simple in-house bearer-token + role (admin/viewer) system now exists
  (`app/services/session_store.py`, `app/core/security.py`) and is enforced on every route, but
  it's not SSO/JWT and has no password-reset flow. Revisit if/when an SSO decision is made.
- **WebSockets / SSE** — `INVENTORY_MODEL` is a dbt model refreshed on a
  schedule (`SNAPSHOT_DATE` column), not a live-streaming table. Ageing figures
  are computed at query time so they're always current *for that snapshot*,
  but pushing updates over a socket would imply a freshness the source data
  doesn't have. Revisit if a genuinely real-time source gets wired in.
- **AG Grid Enterprise** — needs a paid license. Using Recharts (open-source)
  instead; can swap in AG Grid Enterprise if WIOM already holds a license.

### Known data gaps (flagged, not guessed around)

- **"Migrated CSP" vs "Old partner (pending FNF)"** — not derivable from
  `INVENTORY_MODEL` alone. Every dispatched-to-partner row shares
  `DATA_SOURCE = 't_device_devices'` regardless of migration status; that
  distinction lives on the partner record, not the device. Likely needs a
  join to the `partner_account` dbt model (schema `DBT_partner_service`) on
  `PARTNER_ACCOUNT_ID`. Currently reported as a single `partner` bucket.
- **Partner display name/mobile/city/status** — resolved (joined from `supply_model`/`t_account`,
  see `partner_master` fragment in `sql_fragments.py`), shown on the Partners page.
- **Customer display names, phone numbers** — still not available. Only `CUSTOMER_ACCOUNT_ID`
  (id). `CUSTOMER_DETAILS` is a JSON column that is unpopulated in production (verified: 0 rows).
  Name/phone search for customers needs a join to the customer master (not yet identified).
- Three schema variants of `INVENTORY_MODEL` exist in Snowflake
  (`DBT_INVENTORY_REQUEST`, `PUBLIC`, `ARCHIVED`) with different row counts
  and column sets. This app reads `DBT_INVENTORY_REQUEST` only (the live one,
  ~373K rows, matches the "3.5L+ devices" figure).

## Running locally

**Backend**
```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # .venv/bin/pip on macOS/Linux
cp .env.example .env   # fill in METABASE_API_KEY
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8123
```

**Frontend**
```bash
cd frontend
npm install
npm run dev   # http://localhost:3000 by default
```

Set `BACKEND_URL` in `frontend/.env.local` if the backend isn't on
`http://127.0.0.1:8123`.

## Deployment

Not yet deployed. Per WIOM convention, intended target is Railway project
`b0703763` — ask before pushing since it's a new service in a shared project.
