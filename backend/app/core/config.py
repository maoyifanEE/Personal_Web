"""Application settings loaded from environment variables."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the local-development backend foundation."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"] = Field("development", alias="APP_ENV")
    app_name: str = Field("Personal Web Backend", alias="APP_NAME")
    app_debug: bool = Field(False, alias="APP_DEBUG")
    api_prefix: str = Field("/api", alias="API_PREFIX")
    database_url: str = Field(..., alias="DATABASE_URL")
    allow_dev_tools: bool = Field(False, alias="ALLOW_DEV_TOOLS")
    session_cookie_name: str = Field("personal_web_session", alias="SESSION_COOKIE_NAME")
    session_expire_days: int = Field(7, alias="SESSION_EXPIRE_DAYS")
    session_secret: str = Field("development-only-change-me", alias="SESSION_SECRET")
    cookie_secure: bool = Field(False, alias="COOKIE_SECURE")
    csrf_header_name: str = Field("X-CSRF-Token", alias="CSRF_HEADER_NAME")
    cors_allow_origins: str = Field(
        "http://127.0.0.1:4173,http://localhost:4173",
        alias="CORS_ALLOW_ORIGINS",
    )

    @field_validator("database_url")
    @classmethod
    def require_database_url(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("DATABASE_URL is required for the PostgreSQL backend")
        return value.strip()

    @field_validator("api_prefix")
    @classmethod
    def normalize_api_prefix(cls, value: str) -> str:
        if not value.startswith("/"):
            return f"/{value}"
        return value.rstrip("/") or "/api"

    @model_validator(mode="after")
    def validate_production_safety(self) -> "Settings":
        if self.app_env == "production" and self.allow_dev_tools:
            raise ValueError("ALLOW_DEV_TOOLS must be false when APP_ENV=production")
        if self.app_env == "production" and "*" in self.cors_origins:
            raise ValueError("Wildcard CORS is not allowed when APP_ENV=production")
        if self.app_env == "production" and self.session_secret == "development-only-change-me":
            raise ValueError("SESSION_SECRET must be configured for production")
        if self.app_env == "production" and not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true when APP_ENV=production")
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def dev_tools_enabled(self) -> bool:
        return self.is_development and self.allow_dev_tools


@lru_cache
def get_settings() -> Settings:
    """Return cached settings so startup fails loudly on invalid configuration."""

    return Settings()
