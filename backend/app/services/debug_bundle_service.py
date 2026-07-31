"""Create local-development debug bundles without collecting secrets."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import platform
from pathlib import Path
import subprocess
import sys
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile

from app.core.diagnostics import (
    LOCAL_LOG_RETENTION_DAYS,
    LOCAL_LOG_ROOT,
    PROJECT_ROOT,
    prune_local_diagnostics,
    sanitize_for_diagnostics,
)

MAX_TOTAL_LOG_BYTES = 250 * 1024 * 1024
ALLOWED_LOG_DIRS = ("backend", "frontend", "launcher", "debug-bundles", "sticker-tool")
DEBUG_PAYLOAD_SCHEMA_VERSION = "personal-web-debug-payload-v2"
DEBUG_LOGGER_VERSION = "2026-07-11-debug-v4"
SKIPPED_PARTS = {
    ".env",
    ".venv",
    "data",
    "uploads",
    "backups",
    "debug-bundles",
    "__pycache__",
}
SKIPPED_SUFFIXES = {
    ".db",
    ".sqlite",
    ".sqlite3",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".zip",
}


def utc_timestamp() -> str:
    """Return a compact UTC timestamp for bundle filenames."""

    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def run_git_command(args: list[str]) -> str:
    """Run a fixed git command and return a short safe text result."""

    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=PROJECT_ROOT,
            text=True,
            capture_output=True,
            timeout=5,
            check=False,
        )
    except Exception as error:  # pragma: no cover - defensive local tooling guard.
        return f"git {' '.join(args)} failed: {error}"

    output = (completed.stdout or completed.stderr or "").strip()
    if len(output) > 8000:
        output = f"{output[:8000]}\n...[truncated {len(output)}]"
    return output


def safe_log_inventory() -> tuple[list[dict[str, Any]], list[Path]]:
    """Return safe retained local log inventory and files for a debug bundle."""

    if not LOCAL_LOG_ROOT.exists():
        return [], []

    cutoff = datetime.now(timezone.utc) - timedelta(days=LOCAL_LOG_RETENTION_DAYS)
    inventory: list[dict[str, Any]] = []
    included: list[Path] = []
    total_bytes = 0
    for dirname in ALLOWED_LOG_DIRS:
        directory = LOCAL_LOG_ROOT / dirname
        if not directory.exists():
            continue
        for path in directory.rglob("*"):
            item = {
                "relativePath": path.relative_to(LOCAL_LOG_ROOT).as_posix(),
                "included": False,
                "size": 0,
                "modifiedTimestamp": None,
                "exclusionReason": None,
            }
            if not path.is_file():
                continue
            relative_parts = set(path.relative_to(LOCAL_LOG_ROOT).parts)
            if relative_parts.intersection(SKIPPED_PARTS):
                item["exclusionReason"] = "skipped_path_part"
                inventory.append(item)
                continue
            if path.suffix.lower() in SKIPPED_SUFFIXES:
                item["exclusionReason"] = "skipped_suffix"
                inventory.append(item)
                continue
            stat = path.stat()
            modified = datetime.fromtimestamp(stat.st_mtime, timezone.utc)
            item["size"] = stat.st_size
            item["modifiedTimestamp"] = modified.isoformat()
            if modified < cutoff:
                item["exclusionReason"] = "older_than_retention"
                inventory.append(item)
                continue
            total_bytes += stat.st_size
            item["included"] = True
            inventory.append(item)
            included.append(path)

    if total_bytes > MAX_TOTAL_LOG_BYTES:
        raise ValueError(
            f"Retained diagnostic logs exceed bundle limit: {total_bytes} > {MAX_TOTAL_LOG_BYTES}"
        )
    return inventory, included


def environment_summary() -> dict[str, Any]:
    """Return safe local environment metadata without secret values."""

    return {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "repoRoot": str(PROJECT_ROOT),
        "backendEnvExists": (PROJECT_ROOT / "backend" / ".env").exists(),
        "localLogRootExists": LOCAL_LOG_ROOT.exists(),
        "python": sys.version.split()[0],
        "platform": platform.platform(),
    }


def git_summary() -> dict[str, str]:
    """Return safe git state for local troubleshooting."""

    return {
        "branch": run_git_command(["branch", "--show-current"]),
        "head": run_git_command(["rev-parse", "HEAD"]),
        "status": run_git_command(["status", "--short"]),
        "log": run_git_command(["log", "-5", "--oneline"]),
        "diffStat": run_git_command(["diff", "--stat"]),
    }


def write_json(zip_file: ZipFile, name: str, data: Any, *, sanitize: bool = True) -> None:
    """Write JSON to a zip member."""

    payload = sanitize_for_diagnostics(data) if sanitize else data
    zip_file.writestr(
        name,
        json.dumps(payload, ensure_ascii=False, indent=2),
    )


def write_text(zip_file: ZipFile, name: str, text: str) -> None:
    """Write text to a zip member."""

    zip_file.writestr(name, text)


def validate_browser_payload_metadata(client_payload: dict[str, Any]) -> list[str]:
    """Return browser payload metadata validation omissions."""

    omissions: list[str] = []
    entries = client_payload.get("entries")
    if client_payload.get("schemaVersion") != DEBUG_PAYLOAD_SCHEMA_VERSION:
        omissions.append("browser_payload_legacy_or_missing_metadata")
    if client_payload.get("loggerVersion") != DEBUG_LOGGER_VERSION:
        omissions.append("browser_logger_version_stale_or_missing")
    if client_payload.get("retentionDays") != LOCAL_LOG_RETENTION_DAYS:
        omissions.append("browser_retention_days_invalid")
    if not client_payload.get("cutoffTimestamp"):
        omissions.append("browser_retention_cutoff_missing")
    if not isinstance(client_payload.get("entryCount"), int):
        omissions.append("browser_entry_count_missing")
    if not isinstance(entries, list):
        omissions.append("browser_entries_missing")
    elif client_payload.get("entryCount") != len(entries):
        omissions.append("browser_entry_count_mismatch")
    if client_payload.get("storageBackend") not in {"indexeddb", "localStorage"}:
        omissions.append("browser_storage_backend_missing")
    if not isinstance(client_payload.get("degraded"), bool):
        omissions.append("browser_degraded_flag_missing")
    if not isinstance(client_payload.get("complete"), bool):
        omissions.append("browser_complete_flag_missing")
    if not isinstance(client_payload.get("omissions"), list):
        omissions.append("browser_omissions_missing")
    if isinstance(entries, list) and entries:
        if not client_payload.get("oldestTimestamp"):
            omissions.append("browser_oldest_timestamp_missing")
        if not client_payload.get("newestTimestamp"):
            omissions.append("browser_newest_timestamp_missing")
    return omissions


def create_debug_bundle(client_payload: dict[str, Any]) -> tuple[Path, str]:
    """Create a local debug zip and return `(path, filename)`."""

    retention_result = prune_local_diagnostics(emit_event=False)
    bundle_root = LOCAL_LOG_ROOT / "debug-bundles"
    bundle_root.mkdir(parents=True, exist_ok=True)
    timestamp = utc_timestamp()
    filename = f"personal-web-debug-{timestamp}.local-debug.zip"
    zip_path = bundle_root / filename
    metadata_omissions = validate_browser_payload_metadata(client_payload)
    inventory, log_files = safe_log_inventory()
    raw_browser_entries = client_payload.get("entries") if isinstance(client_payload.get("entries"), list) else []
    browser_entries = [sanitize_for_diagnostics(entry) for entry in raw_browser_entries]
    safe_client_payload = sanitize_for_diagnostics(
        {key: value for key, value in client_payload.items() if key != "entries"}
    )
    safe_client_payload["entries"] = browser_entries
    browser_metadata = {
        "schemaVersion": safe_client_payload.get("schemaVersion"),
        "loggerVersion": safe_client_payload.get("loggerVersion"),
        "retentionDays": safe_client_payload.get("retentionDays", LOCAL_LOG_RETENTION_DAYS),
        "cutoffTimestamp": safe_client_payload.get("cutoffTimestamp"),
        "entryCount": safe_client_payload.get("entryCount", len(browser_entries)),
        "oldestTimestamp": safe_client_payload.get("oldestTimestamp"),
        "newestTimestamp": safe_client_payload.get("newestTimestamp"),
        "storageBackend": safe_client_payload.get("storageBackend"),
        "degraded": safe_client_payload.get("degraded", False),
        "omissions": safe_client_payload.get("omissions") or [],
    }
    bundle_omissions = [*metadata_omissions, *browser_metadata["omissions"]]
    complete = (
        not bundle_omissions
        and safe_client_payload.get("schemaVersion") == DEBUG_PAYLOAD_SCHEMA_VERSION
        and safe_client_payload.get("loggerVersion") == DEBUG_LOGGER_VERSION
        and browser_metadata["retentionDays"] == LOCAL_LOG_RETENTION_DAYS
        and bool(browser_metadata["cutoffTimestamp"])
        and browser_metadata["storageBackend"] in {"indexeddb", "localStorage"}
        and browser_metadata["degraded"] is False
        and safe_client_payload.get("complete") is True
        and len(browser_entries) == browser_metadata["entryCount"]
    )

    summary = {
        "schemaVersion": DEBUG_PAYLOAD_SCHEMA_VERSION,
        "loggerVersion": DEBUG_LOGGER_VERSION,
        "browserPayloadSchemaVersion": safe_client_payload.get("schemaVersion"),
        "browserPayloadLoggerVersion": safe_client_payload.get("loggerVersion"),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "filename": filename,
        "complete": complete,
        "browserEntriesIncluded": len(browser_entries),
        "backendLogFilesIncluded": len([item for item in inventory if item["included"] and item["relativePath"].startswith("backend/")]),
        "frontendLogFilesIncluded": len([item for item in inventory if item["included"] and item["relativePath"].startswith("frontend/")]),
        "launcherLogFilesIncluded": len([item for item in inventory if item["included"] and item["relativePath"].startswith("launcher/")]),
        "retentionCutoff": browser_metadata["cutoffTimestamp"],
        "retentionDays": browser_metadata["retentionDays"],
        "omissions": bundle_omissions,
        "logInventory": inventory,
        "retentionCleanup": retention_result,
        "totalLogLimitBytes": MAX_TOTAL_LOG_BYTES,
        "included": [
            "browser debug payload from debug-log page",
            "all safe retained backend/frontend/launcher JSONL logs when present",
            "git summary",
            "environment summary without .env contents",
            "safe file inventory",
        ],
        "excluded": [
            ".env",
            ".venv",
            "database files",
            "data/uploads runtime media",
            "uploads",
            "backups",
            "previous debug bundles",
            "browser profiles",
            "raw Data URLs",
            "cookies/tokens/passwords/secrets",
        ],
    }

    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as zip_file:
        write_json(zip_file, "browser/client-payload.json", safe_client_payload, sanitize=False)
        write_json(zip_file, "browser/retention-metadata.json", browser_metadata)
        write_json(zip_file, "summary.json", summary)
        write_json(zip_file, "environment-summary.json", environment_summary())
        write_json(zip_file, "git-state.json", git_summary())
        write_text(
            zip_file,
            "_summary.txt",
            "\n".join(
                [
                    "Personal_Web debug bundle",
                    "=========================",
                    f"CreatedAt={summary['createdAt']}",
                    f"Filename={filename}",
                    "",
                    "Please review before sharing.",
                ]
            ),
        )

        tracked_inventory = []
        for tracked_path in run_git_command(["ls-files"]).splitlines():
            if tracked_path.startswith((".local_logs/", "backend/.venv/")):
                continue
            tracked_inventory.append(tracked_path)
        write_json(zip_file, "safe-file-inventory.json", tracked_inventory)

        write_json(zip_file, "log-inventory.json", inventory)

        for log_path in log_files:
            relative = log_path.relative_to(LOCAL_LOG_ROOT).as_posix()
            zip_file.write(log_path, f"logs/{relative}")

    return zip_path, filename
