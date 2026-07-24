"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path
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
    personal_web_data_profile: Literal["local", "shared_remote"] = Field(
        "local",
        alias="PERSONAL_WEB_DATA_PROFILE",
    )
    session_cookie_name: str = Field("personal_web_session", alias="SESSION_COOKIE_NAME")
    session_expire_days: int = Field(7, alias="SESSION_EXPIRE_DAYS")
    session_secret: str = Field("development-only-change-me", alias="SESSION_SECRET")
    cookie_secure: bool = Field(False, alias="COOKIE_SECURE")
    csrf_header_name: str = Field("X-CSRF-Token", alias="CSRF_HEADER_NAME")
    homepage_media_root: str = Field("data/uploads/homepage", alias="HOMEPAGE_MEDIA_ROOT")
    homepage_media_storage_backend: Literal["filesystem", "sftp"] = Field(
        "filesystem",
        alias="HOMEPAGE_MEDIA_STORAGE_BACKEND",
    )
    shared_dev_media_ssh_alias: str | None = Field(None, alias="SHARED_DEV_MEDIA_SSH_ALIAS")
    shared_dev_media_ssh_config_path: str | None = Field(None, alias="SHARED_DEV_MEDIA_SSH_CONFIG_PATH")
    shared_dev_media_remote_root: str | None = Field(None, alias="SHARED_DEV_MEDIA_REMOTE_ROOT")
    shared_dev_media_cache_max_mb: int = Field(512, alias="SHARED_DEV_MEDIA_CACHE_MAX_MB")
    shared_dev_media_cache_retention_days: int = Field(7, alias="SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS")
    homepage_image_max_mb: int = Field(10, alias="HOMEPAGE_IMAGE_MAX_MB")
    homepage_video_max_mb: int = Field(100, alias="HOMEPAGE_VIDEO_MAX_MB")
    message_rate_limit_enabled: bool = Field(True, alias="MESSAGE_RATE_LIMIT_ENABLED")
    message_rate_limit_max: int = Field(5, alias="MESSAGE_RATE_LIMIT_MAX")
    message_rate_limit_window_seconds: int = Field(600, alias="MESSAGE_RATE_LIMIT_WINDOW_SECONDS")
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

    @field_validator("homepage_media_root")
    @classmethod
    def normalize_homepage_media_root(cls, value: str) -> str:
        value = value.strip().replace("\\", "/")
        if not value:
            raise ValueError("HOMEPAGE_MEDIA_ROOT must not be empty")
        if Path(value).is_absolute():
            raise ValueError("HOMEPAGE_MEDIA_ROOT must be project-relative in local development")
        if ".." in Path(value).parts:
            raise ValueError("HOMEPAGE_MEDIA_ROOT must not contain path traversal")
        return value.strip("/")

    @field_validator("shared_dev_media_ssh_alias")
    @classmethod
    def normalize_optional_alias(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if any(ch.isspace() for ch in value):
            raise ValueError("SHARED_DEV_MEDIA_SSH_ALIAS must not contain whitespace")
        return value

    @field_validator("shared_dev_media_ssh_config_path")
    @classmethod
    def normalize_optional_config_path(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if "\x00" in value:
            raise ValueError("SHARED_DEV_MEDIA_SSH_CONFIG_PATH is invalid")
        return value

    @field_validator("shared_dev_media_remote_root")
    @classmethod
    def normalize_optional_remote_root(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip().replace("\\", "/")
        if not value:
            return None
        if not value.startswith("/"):
            raise ValueError("SHARED_DEV_MEDIA_REMOTE_ROOT must be an absolute POSIX path")
        parts = [part for part in value.split("/") if part]
        if any(part == ".." for part in parts):
            raise ValueError("SHARED_DEV_MEDIA_REMOTE_ROOT must not contain path traversal")
        return "/" + "/".join(parts)

    @field_validator("homepage_image_max_mb", "homepage_video_max_mb")
    @classmethod
    def require_positive_media_limit(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("Homepage media size limits must be positive")
        return value

    @field_validator("shared_dev_media_cache_max_mb", "shared_dev_media_cache_retention_days")
    @classmethod
    def require_positive_shared_media_cache_limit(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("Shared media cache limits must be positive")
        return value

    @field_validator("message_rate_limit_max", "message_rate_limit_window_seconds")
    @classmethod
    def require_positive_message_rate_limit(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("Message rate limit values must be positive")
        return value

    @model_validator(mode="after")
    def validate_production_safety(self) -> "Settings":
        if self.personal_web_data_profile == "shared_remote":
            if self.app_env != "development":
                raise ValueError("PERSONAL_WEB_DATA_PROFILE=shared_remote is allowed only in development")
            if self.homepage_media_storage_backend != "sftp":
                raise ValueError("PERSONAL_WEB_DATA_PROFILE=shared_remote requires HOMEPAGE_MEDIA_STORAGE_BACKEND=sftp")
            missing = [
                name
                for name, value in {
                    "SHARED_DEV_MEDIA_SSH_ALIAS": self.shared_dev_media_ssh_alias,
                    "SHARED_DEV_MEDIA_SSH_CONFIG_PATH": self.shared_dev_media_ssh_config_path,
                    "SHARED_DEV_MEDIA_REMOTE_ROOT": self.shared_dev_media_remote_root,
                }.items()
                if not value
            ]
            if missing:
                raise ValueError("Shared remote media configuration is incomplete: " + ", ".join(missing))
        if self.personal_web_data_profile == "local" and self.homepage_media_storage_backend != "filesystem":
            raise ValueError("PERSONAL_WEB_DATA_PROFILE=local supports only HOMEPAGE_MEDIA_STORAGE_BACKEND=filesystem")
        if self.app_env == "production" and self.allow_dev_tools:
            raise ValueError("ALLOW_DEV_TOOLS must be false when APP_ENV=production")
        if self.app_env == "production" and self.personal_web_data_profile == "shared_remote":
            raise ValueError("PERSONAL_WEB_DATA_PROFILE=shared_remote is not allowed when APP_ENV=production")
        if self.app_env == "production" and self.homepage_media_storage_backend == "sftp":
            raise ValueError("HOMEPAGE_MEDIA_STORAGE_BACKEND=sftp is not allowed when APP_ENV=production")
        if self.app_env == "production" and any(
            [
                self.shared_dev_media_ssh_alias,
                self.shared_dev_media_ssh_config_path,
                self.shared_dev_media_remote_root,
            ]
        ):
            raise ValueError("Shared-development media settings are not allowed when APP_ENV=production")
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

    @property
    def uses_shared_remote_data(self) -> bool:
        return self.personal_web_data_profile == "shared_remote"

    @property
    def homepage_media_root_path(self) -> Path:
        """Return the project-controlled runtime upload root."""

        from app.core.diagnostics import PROJECT_ROOT

        return PROJECT_ROOT / self.homepage_media_root

    @property
    def homepage_image_max_bytes(self) -> int:
        return self.homepage_image_max_mb * 1024 * 1024

    @property
    def homepage_video_max_bytes(self) -> int:
        return self.homepage_video_max_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    """Return cached settings so startup fails loudly on invalid configuration."""

    return Settings()
