from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    metabase_url: str = "https://metabase.wiom.in"
    metabase_api_key: str = ""
    metabase_database_id: int = 113
    inventory_schema: str = "PROD_DB.DBT_INVENTORY_REQUEST"

    # Just a safety-net fallback now, not the primary refresh mechanism -
    # actual refresh is a daily 9 AM IST scheduler + a manual button
    # (app/services/cache_sync.py), both of which call invalidate_all()
    # directly regardless of this TTL.
    query_cache_ttl_seconds: int = 12 * 60 * 60
    request_timeout_seconds: float = 60.0
    # Bulk CSV exports (e.g. full device-level, ~375k rows) measurably take
    # ~100s to generate - the default request_timeout_seconds was firing mid-
    # request and turning into a false "500 Internal Server Error" on export.
    bulk_export_timeout_seconds: float = 300.0

    # Wide open for Phase 1 (no auth/cookies yet, so no credential-leak risk).
    # Tighten to explicit origins once auth is added in Phase 2.
    cors_origins: list[str] = ["*"]

    # Password for the auto-seeded first admin user (app/services/users_store.py).
    # Set this in the deploy environment - leaving it unset makes users_store
    # generate and log a random one instead of using a hardcoded, previously
    # committed/shared default password.
    admin_seed_password: str | None = None
    admin_seed_email: str = "admin@wiom.in"


@lru_cache
def get_settings() -> Settings:
    return Settings()
