"""Local-development diagnostics helpers.

These helpers write sanitized JSONL logs under `.local_logs/` for debugging the
local frontend/backend flow. They are not a production logging pipeline.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import logging
from pathlib import Path
import re
import time
from typing import Any

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
LOCAL_LOG_ROOT = PROJECT_ROOT / ".local_logs"
LOCAL_LOG_RETENTION_DAYS = 7
LOCAL_LOG_RETENTION_SECONDS = LOCAL_LOG_RETENTION_DAYS * 24 * 60 * 60
LOCAL_LOG_RETENTION_THROTTLE_SECONDS = 15 * 60
_last_retention_prune_monotonic = 0.0
RETENTION_CATEGORIES = {"backend", "frontend", "launcher", "debug-bundles"}
SENSITIVE_KEYS = {
    "password",
    "oldpassword",
    "newpassword",
    "confirmpassword",
    "token",
    "accesstoken",
    "refreshtoken",
    "sessiontoken",
    "sessiontokenhash",
    "csrf",
    "csrftoken",
    "cookie",
    "setcookie",
    "authorization",
    "databaseurl",
    "secret",
    "sessionsecret",
}


def utc_now_iso() -> str:
    """Return an ISO timestamp suitable for JSON logs."""

    return datetime.now(timezone.utc).isoformat()


def normalize_key(key: str) -> str:
    """Normalize diagnostic keys for exact sensitive-key checks."""

    return re.sub(r"[^a-z0-9]+", "", str(key or "").lower())


def is_sensitive_key(key: str) -> bool:
    """Return True only for secret-bearing keys, not generic `*Key` fields."""

    normalized = normalize_key(key)
    if not normalized:
        return False
    return (
        normalized in SENSITIVE_KEYS
        or normalized.endswith("password")
        or normalized.endswith("token")
        or "secret" in normalized
    )


def sanitize_for_diagnostics(value: Any, key: str = "") -> Any:
    """Recursively redact secrets and large browser-only payloads."""

    if key and is_sensitive_key(key):
        return "[REDACTED]"
    if isinstance(value, str):
        if value.strip().lower().startswith("data:"):
            return f"[DATA_URL_REDACTED length={len(value)}]"
        if len(value) > 1200:
            return f"{value[:1200]}...[truncated {len(value)}]"
        return value
    if isinstance(value, list):
        return [sanitize_for_diagnostics(item, key) for item in value[:120]]
    if isinstance(value, dict):
        return {
            str(item_key): sanitize_for_diagnostics(item_value, str(item_key))
            for item_key, item_value in value.items()
        }
    return value


def write_jsonl_event(category: str, event: str, details: dict[str, Any] | None = None) -> None:
    """Append a sanitized diagnostic event to `.local_logs/<category>/`."""

    safe_category = re.sub(r"[^a-zA-Z0-9_-]+", "-", category).strip("-") or "general"
    log_dir = LOCAL_LOG_ROOT / safe_category
    log_path = log_dir / f"{safe_category}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.jsonl"
    payload = {
        "timestamp": utc_now_iso(),
        "event": event,
        "details": sanitize_for_diagnostics(details or {}),
    }
    try:
        maybe_prune_local_diagnostics()
        log_dir.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    except OSError as error:
        logger.warning("Failed to write local diagnostic event: %s", error)


def _is_within_local_log_root(path: Path, root: Path | None = None) -> bool:
    """Return True when a path resolves inside the controlled log root."""

    log_root = root or LOCAL_LOG_ROOT
    try:
        path.resolve().relative_to(log_root.resolve())
        return True
    except (OSError, ValueError):
        return False


def prune_local_diagnostics(
    retention_days: int = LOCAL_LOG_RETENTION_DAYS,
    *,
    root: Path | None = None,
    now: datetime | None = None,
    emit_event: bool = True,
) -> dict[str, Any]:
    """Delete safe local diagnostic files older than the retention window."""

    log_root = root or LOCAL_LOG_ROOT
    current_time = now or datetime.now(timezone.utc)
    cutoff = current_time - timedelta(days=retention_days)
    result: dict[str, Any] = {
        "cutoff": cutoff.isoformat(),
        "root": str(log_root),
        "scannedFiles": 0,
        "deletedFiles": 0,
        "deletedBytes": 0,
        "failures": [],
    }

    if not log_root.exists():
        return result

    for category in RETENTION_CATEGORIES:
        directory = log_root / category
        if not directory.exists() or not directory.is_dir():
            continue
        if directory.is_symlink() or not _is_within_local_log_root(directory, log_root):
            result["failures"].append({"path": str(directory), "reason": "unsafe_directory"})
            continue
        for path in directory.rglob("*"):
            try:
                if path.is_symlink() or not path.is_file():
                    continue
                if not _is_within_local_log_root(path, log_root):
                    result["failures"].append({"path": str(path), "reason": "outside_log_root"})
                    continue
                stat = path.stat()
                result["scannedFiles"] += 1
                modified = datetime.fromtimestamp(stat.st_mtime, timezone.utc)
                if modified >= cutoff:
                    continue
                deleted_bytes = stat.st_size
                path.unlink()
                result["deletedFiles"] += 1
                result["deletedBytes"] += deleted_bytes
            except OSError as error:
                result["failures"].append({"path": str(path), "reason": str(error)})

    if emit_event:
        write_jsonl_event(
            "backend",
            "diagnostics.retention.pruned",
            {**result, "retentionDays": retention_days},
        )
    return result


def maybe_prune_local_diagnostics() -> None:
    """Throttle local diagnostic retention cleanup."""

    global _last_retention_prune_monotonic
    current = time.monotonic()
    if current - _last_retention_prune_monotonic < LOCAL_LOG_RETENTION_THROTTLE_SECONDS:
        return
    _last_retention_prune_monotonic = current
    try:
        prune_local_diagnostics(emit_event=False)
    except Exception as error:  # pragma: no cover - local diagnostic guard.
        logger.warning("Failed to prune local diagnostics: %s", error)
