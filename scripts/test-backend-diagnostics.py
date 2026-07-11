from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys
import tempfile
from zipfile import ZipFile

from fastapi import HTTPException

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://debug:debug@localhost/debug")
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("ALLOW_DEV_TOOLS", "true")
os.environ.setdefault("SESSION_SECRET", "debug-test-session-secret")

from app.api.routes import debug as debug_routes  # noqa: E402
from app.core import diagnostics  # noqa: E402
from app.services import debug_bundle_service  # noqa: E402


def write_file(path: Path, text: str, modified: datetime) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    timestamp = modified.timestamp()
    os.utime(path, (timestamp, timestamp))


def test_retention() -> None:
    with tempfile.TemporaryDirectory() as tmp:
      root = Path(tmp) / ".local_logs"
      now = datetime(2026, 7, 11, tzinfo=timezone.utc)
      old_file = root / "backend" / "old.jsonl"
      fresh_file = root / "backend" / "fresh.jsonl"
      outside_file = Path(tmp) / "outside.log"

      write_file(old_file, "old", now - timedelta(days=9))
      write_file(fresh_file, "fresh", now - timedelta(days=1))
      write_file(outside_file, "outside", now - timedelta(days=9))

      result = diagnostics.prune_local_diagnostics(root=root, now=now, emit_event=False)

      assert result["scannedFiles"] == 2
      assert result["deletedFiles"] == 1
      assert not old_file.exists()
      assert fresh_file.exists()
      assert outside_file.exists()
      print("BACKEND_RETENTION_TEST_PASS")


def test_bundle_inventory() -> None:
    with tempfile.TemporaryDirectory() as tmp:
      root = Path(tmp) / ".local_logs"
      now = datetime.now(timezone.utc)
      write_file(root / "backend" / "backend.jsonl", '{"ok":true}\n', now)
      write_file(root / "frontend" / "frontend.jsonl", '{"ok":true}\n', now)
      write_file(root / "launcher" / "launcher.jsonl", '{"ok":true}\n', now)
      write_file(root / "backend" / "old.jsonl", '{"old":true}\n', now - timedelta(days=9))

      original_root = debug_bundle_service.LOCAL_LOG_ROOT
      original_diag_root = diagnostics.LOCAL_LOG_ROOT
      debug_bundle_service.LOCAL_LOG_ROOT = root
      diagnostics.LOCAL_LOG_ROOT = root
      try:
        payload = valid_browser_payload(now)
        zip_path, _filename = debug_bundle_service.create_debug_bundle(payload)
        with ZipFile(zip_path) as bundle:
          names = set(bundle.namelist())
          summary = json.loads(bundle.read("summary.json"))
          metadata = json.loads(bundle.read("browser/retention-metadata.json"))
          inventory = json.loads(bundle.read("log-inventory.json"))
        assert "logs/backend/backend.jsonl" in names
        assert "logs/frontend/frontend.jsonl" in names
        assert "logs/launcher/launcher.jsonl" in names
        assert summary["complete"] is True
        assert summary["schemaVersion"] == debug_bundle_service.DEBUG_PAYLOAD_SCHEMA_VERSION
        assert metadata["schemaVersion"] == debug_bundle_service.DEBUG_PAYLOAD_SCHEMA_VERSION
        assert summary["browserEntriesIncluded"] == 1
        assert "logs/backend/old.jsonl" not in names
        assert summary["retentionCleanup"]["deletedFiles"] >= 1
        assert all(item["relativePath"] != "backend/old.jsonl" for item in inventory)
        print("BACKEND_BUNDLE_TEST_PASS")
      finally:
        debug_bundle_service.LOCAL_LOG_ROOT = original_root
        diagnostics.LOCAL_LOG_ROOT = original_diag_root


def valid_browser_payload(now: datetime | None = None, **overrides: object) -> dict[str, object]:
    current = now or datetime.now(timezone.utc)
    entries = overrides.pop(
        "entries",
        [{"timestamp": current.isoformat(), "event": "ui.control.click"}],
    )
    payload: dict[str, object] = {
        "schemaVersion": debug_bundle_service.DEBUG_PAYLOAD_SCHEMA_VERSION,
        "loggerVersion": debug_bundle_service.DEBUG_LOGGER_VERSION,
        "retentionDays": 7,
        "cutoffTimestamp": (current - timedelta(days=7)).isoformat(),
        "entryCount": len(entries),  # type: ignore[arg-type]
        "oldestTimestamp": entries[0]["timestamp"] if entries else None,  # type: ignore[index]
        "newestTimestamp": entries[-1]["timestamp"] if entries else None,  # type: ignore[index]
        "storageBackend": "indexeddb",
        "degraded": False,
        "omissions": [],
        "complete": True,
        "entries": entries,
    }
    payload.update(overrides)
    return payload


def test_browser_payload_metadata_validation() -> None:
    assert debug_bundle_service.validate_browser_payload_metadata(valid_browser_payload()) == []
    assert "browser_payload_legacy_or_missing_metadata" in debug_bundle_service.validate_browser_payload_metadata(
        {"entries": [{} for _ in range(120)]}
    )
    assert "browser_storage_backend_missing" in debug_bundle_service.validate_browser_payload_metadata(
        valid_browser_payload(storageBackend=None)
    )
    assert "browser_retention_cutoff_missing" in debug_bundle_service.validate_browser_payload_metadata(
        valid_browser_payload(cutoffTimestamp=None)
    )
    assert "browser_entry_count_mismatch" in debug_bundle_service.validate_browser_payload_metadata(
        valid_browser_payload(entryCount=2)
    )
    incomplete = valid_browser_payload(storageBackend=None)
    many_entries = [
        {
            "timestamp": (datetime.now(timezone.utc) + timedelta(seconds=index)).isoformat(),
            "event": "ui.control.click",
        }
        for index in range(130)
    ]
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / ".local_logs"
        original_root = debug_bundle_service.LOCAL_LOG_ROOT
        original_diag_root = diagnostics.LOCAL_LOG_ROOT
        debug_bundle_service.LOCAL_LOG_ROOT = root
        diagnostics.LOCAL_LOG_ROOT = root
        try:
            zip_path, _filename = debug_bundle_service.create_debug_bundle(incomplete)
            with ZipFile(zip_path) as bundle:
                summary = json.loads(bundle.read("summary.json"))
            assert summary["complete"] is False
            assert "browser_storage_backend_missing" in summary["omissions"]

            complete_zip_path, _filename = debug_bundle_service.create_debug_bundle(
                valid_browser_payload(entries=many_entries)
            )
            with ZipFile(complete_zip_path) as bundle:
                complete_summary = json.loads(bundle.read("summary.json"))
                complete_payload = json.loads(bundle.read("browser/client-payload.json"))
            assert complete_summary["complete"] is True
            assert complete_summary["browserEntriesIncluded"] == 130
            assert len(complete_payload["entries"]) == 130
        finally:
            debug_bundle_service.LOCAL_LOG_ROOT = original_root
            diagnostics.LOCAL_LOG_ROOT = original_diag_root
    print("BACKEND_BROWSER_PAYLOAD_SCHEMA_TEST_PASS")


def test_payload_limits() -> None:
    original = debug_routes.MAX_CLIENT_LOG_ENTRIES
    debug_routes.MAX_CLIENT_LOG_ENTRIES = 1
    try:
      try:
        debug_routes.validate_debug_payload({"entries": [{}, {}]}, max_json_chars=100000)
      except HTTPException as error:
        assert error.status_code == 413
      else:
        raise AssertionError("Expected payload limit HTTPException")
      print("BACKEND_PAYLOAD_LIMIT_TEST_PASS")
    finally:
      debug_routes.MAX_CLIENT_LOG_ENTRIES = original


if __name__ == "__main__":
    test_retention()
    test_bundle_inventory()
    test_browser_payload_metadata_validation()
    test_payload_limits()
    print("BACKEND_DIAGNOSTICS_TEST_PASS")
