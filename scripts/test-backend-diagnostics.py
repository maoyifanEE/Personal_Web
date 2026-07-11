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
        payload = {
          "retentionDays": 7,
          "cutoffTimestamp": (now - timedelta(days=7)).isoformat(),
          "entryCount": 1,
          "oldestTimestamp": now.isoformat(),
          "newestTimestamp": now.isoformat(),
          "storageBackend": "indexeddb",
          "degraded": False,
          "omissions": [],
          "entries": [{"timestamp": now.isoformat(), "event": "test"}],
        }
        zip_path, _filename = debug_bundle_service.create_debug_bundle(payload)
        with ZipFile(zip_path) as bundle:
          names = set(bundle.namelist())
          summary = json.loads(bundle.read("summary.json"))
          inventory = json.loads(bundle.read("log-inventory.json"))
        assert "logs/backend/backend.jsonl" in names
        assert "logs/frontend/frontend.jsonl" in names
        assert "logs/launcher/launcher.jsonl" in names
        assert summary["complete"] is True
        assert summary["browserEntriesIncluded"] == 1
        assert "logs/backend/old.jsonl" not in names
        assert summary["retentionCleanup"]["deletedFiles"] >= 1
        assert all(item["relativePath"] != "backend/old.jsonl" for item in inventory)
        print("BACKEND_BUNDLE_TEST_PASS")
      finally:
        debug_bundle_service.LOCAL_LOG_ROOT = original_root
        diagnostics.LOCAL_LOG_ROOT = original_diag_root


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
    test_payload_limits()
    print("BACKEND_DIAGNOSTICS_TEST_PASS")
