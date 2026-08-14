from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import ageing, asset_register, audit, auth, cache, customers, devices, executive, inventory, lost_devices, partners, recon, schema_config, vintage, warehouses
from app.core.config import get_settings
from app.core.security import require_auth
from app.services import cache_sync

settings = get_settings()

app = FastAPI(
    title="WIOM Asset Intelligence Platform",
    description="Live device lifecycle, ageing, and recovery visibility over INVENTORY_MODEL.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Every data router requires a valid bearer token (see app/core/security.py) -
# previously login was a frontend-only sessionStorage flag with NO backend
# enforcement, so any endpoint could be called directly without logging in.
# schema_config's own routes additionally require the admin role (enforced
# per-route in that module, since editing live SQL is more sensitive than
# just viewing dashboards).
_auth_dep = [Depends(require_auth)]

app.include_router(executive.router, dependencies=_auth_dep)
app.include_router(inventory.router, dependencies=_auth_dep)
app.include_router(ageing.router, dependencies=_auth_dep)
app.include_router(devices.router, dependencies=_auth_dep)
app.include_router(vintage.router, dependencies=_auth_dep)
app.include_router(schema_config.router)  # per-route require_admin instead
app.include_router(partners.router, dependencies=_auth_dep)
app.include_router(warehouses.router, dependencies=_auth_dep)
app.include_router(lost_devices.router, dependencies=_auth_dep)
app.include_router(customers.router, dependencies=_auth_dep)
app.include_router(asset_register.router, dependencies=_auth_dep)
app.include_router(auth.router)  # login must stay open; other routes self-gate
app.include_router(audit.router)  # self-gates via require_admin per-route
app.include_router(cache.router, dependencies=_auth_dep)
app.include_router(recon.router, dependencies=_auth_dep)


@app.on_event("startup")
def _start_cache_scheduler() -> None:
    cache_sync.start_scheduler()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
