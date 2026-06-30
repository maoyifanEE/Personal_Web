"""Local-development diagnostics helpers.

These helpers write sanitized JSONL logs under `.local_logs/` for debugging the
local frontend/backend flow. They are not a production logging pipeline.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import re
from typing import Any

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
LOCAL_LOG_ROOT = PROJECT_ROOT / ".local_logs"
SENSITIVE_KEY_PATTERN = re.compile(
    r"password|token|session|csrf|cookie|authorization|database_url|secret|jwt|key",
    re.IGNORECASE,
)


def utc_now_iso() -> str:
    """Return an ISO timestamp suitable for JSON logs."""

    return datetime.now(timezone.utc).isoformat()


def sanitize_for_diagnostics(value: Any, key: str = "") -> Any:
    """Recursively redact secrets and large browser-only payloads."""

    if key and SENSITIVE_KEY_PATTERN.search(key):
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
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"{safe_category}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.jsonl"
    payload = {
        "timestamp": utc_now_iso(),
        "event": event,
        "details": sanitize_for_diagnostics(details or {}),
    }
    try:
        with log_path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    except OSError as error:
        logger.warning("Failed to write local diagnostic event: %s", error)
