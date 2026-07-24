"""Read-only shared-development SFTP storage preflight."""

from __future__ import annotations

import json
from typing import Any

from app.core.config import Settings, get_settings
from app.core.diagnostics import write_jsonl_event
from app.storage.factory import build_homepage_media_storage


class SharedDevSftpPreflightError(RuntimeError):
    """Raised when shared-development SFTP preflight fails."""


def run_sftp_preflight(*, settings: Settings | None = None, storage=None) -> dict[str, Any]:
    """Invoke the configured SFTP storage preflight without writes."""

    settings = settings or get_settings()
    if settings.personal_web_data_profile != "shared_remote":
        raise SharedDevSftpPreflightError("SFTP preflight requires shared_remote profile")
    if settings.homepage_media_storage_backend != "sftp":
        raise SharedDevSftpPreflightError("SFTP preflight requires sftp media backend")
    storage = storage or build_homepage_media_storage(settings)
    storage.preflight()
    result = {"ok": True, "storage": "verified"}
    write_jsonl_event("backend", "shared_dev.sftp_preflight.ok", result)
    return result


def main() -> int:
    try:
        print(json.dumps(run_sftp_preflight(), sort_keys=True))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": type(exc).__name__}, sort_keys=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
