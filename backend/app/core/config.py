from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    database_url: str = Field(..., description="Async SQLAlchemy DSN (asyncpg driver)")
    app_env: str = "local"
    log_level: str = "INFO"

    jwt_secret: str = Field(..., min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_ttl_seconds: int = 604_800  # 7 days

    # Redis used as a pub/sub bus so WebSocket fan-out reaches sockets on every
    # instance behind the load balancer. Optional: leave unset for single-server
    # deploys — the app degrades to in-process fan-out (and logs a warning).
    # Provider-agnostic: redis://host:6379/0 or rediss://... for TLS/managed.
    redis_url: str | None = None

    # Browser origins allowed to call the API directly (not needed when the
    # frontend talks through the Vite dev proxy). Override via CORS_ORIGINS env
    # as a JSON list, e.g. '["https://app.example.com"]'.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
    ]

    cors_origin_regex: str | None = (
        r"https://connect-me-wine(-[a-z0-9-]+)?\.vercel\.app"
    )

    # --- Message expiration -------------------------------------------------
    # Messages live for this many hours from creation (sent_at). The retrieval
    # API filters on this so expired rows are never returned even before the
    # cleanup job removes them; the cleanup job then deletes them to keep the
    # database bounded. Postgres is the source of truth — these are read fresh
    # from env, never cached in memory beyond the Settings singleton.
    message_retention_hours: int = Field(24, ge=1)
    # How often the background cleanup job runs.
    message_cleanup_interval_minutes: int = Field(60, ge=1)
    # Optional: delete rooms with no activity for this many days. Off by default
    # so rooms (and empty rooms) persist indefinitely.
    room_retention_days: int = Field(30, ge=1)
    enable_room_cleanup: bool = False

    @property
    def is_local(self) -> bool:
        return self.app_env.lower() == "local"


@lru_cache
def get_settings() -> Settings:
    return Settings()
