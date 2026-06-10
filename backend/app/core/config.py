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

    # Browser origins allowed to call the API directly (not needed when the
    # frontend talks through the Vite dev proxy). Override via CORS_ORIGINS env
    # as a JSON list, e.g. '["https://app.example.com"]'.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
    ]

    @property
    def is_local(self) -> bool:
        return self.app_env.lower() == "local"


@lru_cache
def get_settings() -> Settings:
    return Settings()
