"""Create local-development debug bundles without collecting secrets."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import platform
from pathlib import Path
import subprocess
import sys
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile

from app.core.diagnostics import LOCAL_LOG_ROOT, PROJECT_ROOT, sanitize_for_diagnostics

MAX_COPIED_LOG_BYTES = 5 * 1024 * 1024
ALLOWED_LOG_DIRS = ("backend", "frontend", "launcher")
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


def safe_log_files() -> list[Path]:
    """Return local log files that are safe to include in a debug bundle."""

    if not LOCAL_LOG_ROOT.exists():
        return []

    files: list[Path] = []
    for dirname in ALLOWED_LOG_DIRS:
        directory = LOCAL_LOG_ROOT / dirname
        if not directory.exists():
            continue
        for path in directory.rglob("*"):
            if not path.is_file():
                continue
            relative_parts = set(path.relative_to(LOCAL_LOG_ROOT).parts)
            if relative_parts.intersection(SKIPPED_PARTS):
                continue
            if path.suffix.lower() in SKIPPED_SUFFIXES:
                continue
            if path.stat().st_size > MAX_COPIED_LOG_BYTES:
                continue
            files.append(path)
    return files


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


def write_json(zip_file: ZipFile, name: str, data: Any) -> None:
    """Write sanitized JSON to a zip member."""

    zip_file.writestr(
        name,
        json.dumps(sanitize_for_diagnostics(data), ensure_ascii=False, indent=2),
    )


def write_text(zip_file: ZipFile, name: str, text: str) -> None:
    """Write text to a zip member."""

    zip_file.writestr(name, text)


def create_debug_bundle(client_payload: dict[str, Any]) -> tuple[Path, str]:
    """Create a local debug zip and return `(path, filename)`."""

    bundle_root = LOCAL_LOG_ROOT / "debug-bundles"
    bundle_root.mkdir(parents=True, exist_ok=True)
    timestamp = utc_timestamp()
    filename = f"personal-web-debug-{timestamp}.local-debug.zip"
    zip_path = bundle_root / filename
    safe_client_payload = sanitize_for_diagnostics(client_payload)

    summary = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "filename": filename,
        "included": [
            "browser debug payload from debug-log page",
            "backend/frontend/launcher JSONL logs when present",
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
            "large binary files",
            "browser profiles",
            "raw Data URLs",
            "cookies/tokens/passwords/secrets",
        ],
    }

    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as zip_file:
        write_json(zip_file, "browser/client-payload.json", safe_client_payload)
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

        inventory = []
        for tracked_path in run_git_command(["ls-files"]).splitlines():
            if tracked_path.startswith((".local_logs/", "backend/.venv/")):
                continue
            inventory.append(tracked_path)
        write_json(zip_file, "safe-file-inventory.json", inventory)

        for log_path in safe_log_files():
            relative = log_path.relative_to(LOCAL_LOG_ROOT).as_posix()
            zip_file.write(log_path, f"logs/{relative}")

    return zip_path, filename
