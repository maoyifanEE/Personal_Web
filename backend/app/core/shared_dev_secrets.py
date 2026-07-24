"""Strict parser for synthetic shared-development secret files."""

from __future__ import annotations

from pathlib import Path


ALLOWED_SHARED_DEV_SECRET_KEYS = frozenset(
    {
        "SHARED_DEV_SSH_ALIAS",
        "SHARED_DEV_DB_LOCAL_HOST",
        "SHARED_DEV_DB_LOCAL_PORT",
        "SHARED_DEV_DB_REMOTE_HOST",
        "SHARED_DEV_DB_REMOTE_PORT",
        "SHARED_DEV_DB_NAME",
        "SHARED_DEV_DB_USER",
        "SHARED_DEV_DB_PASSWORD",
        "SHARED_DEV_REMOTE_MEDIA_ROOT",
        "SHARED_DEV_MEDIA_SSH_ALIAS",
        "SHARED_DEV_MEDIA_SSH_CONFIG_PATH",
        "SHARED_DEV_MEDIA_REMOTE_ROOT",
        "SHARED_DEV_MEDIA_CACHE_MAX_MB",
        "SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS",
    }
)

REQUIRED_SHARED_DEV_SECRET_KEYS = frozenset(
    {
        "SHARED_DEV_SSH_ALIAS",
        "SHARED_DEV_DB_LOCAL_HOST",
        "SHARED_DEV_DB_LOCAL_PORT",
        "SHARED_DEV_DB_REMOTE_HOST",
        "SHARED_DEV_DB_REMOTE_PORT",
        "SHARED_DEV_DB_NAME",
        "SHARED_DEV_DB_USER",
        "SHARED_DEV_DB_PASSWORD",
        "SHARED_DEV_REMOTE_MEDIA_ROOT",
    }
)


class SharedDevSecretError(ValueError):
    """Raised when a shared-development secret contract is invalid."""


def parse_shared_dev_secret_text(text: str, *, require_all: bool = False) -> dict[str, str]:
    """Parse allowlisted KEY=VALUE text without exposing secret values in errors."""

    values: dict[str, str] = {}
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise SharedDevSecretError(f"Malformed shared-development secret line {line_number}")
        key, value = raw_line.split("=", 1)
        key = key.strip()
        if not key or any(ch.isspace() for ch in key):
            raise SharedDevSecretError(f"Malformed shared-development secret key on line {line_number}")
        if key not in ALLOWED_SHARED_DEV_SECRET_KEYS:
            raise SharedDevSecretError(f"Unknown shared-development secret key on line {line_number}")
        if key in values:
            raise SharedDevSecretError(f"Duplicate shared-development secret key on line {line_number}")
        values[key] = value
    if require_all:
        missing = sorted(REQUIRED_SHARED_DEV_SECRET_KEYS - values.keys())
        if missing:
            raise SharedDevSecretError("Missing required shared-development secret keys: " + ", ".join(missing))
    return values


def parse_shared_dev_secret_file(path: Path, *, require_all: bool = True) -> dict[str, str]:
    """Read and parse a shared-development secret file without logging its contents."""

    return parse_shared_dev_secret_text(path.read_text(encoding="utf-8"), require_all=require_all)
