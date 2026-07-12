"""Regression tests for Homepage/Journey public publish bundles."""

from argparse import Namespace
import importlib.util
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
HELPER_PATH = REPO_ROOT / "scripts" / "homepage_publish_bundle.py"


def load_publish_helper():
    """Load the publish helper as a plain module for focused unit tests."""

    spec = importlib.util.spec_from_file_location("homepage_publish_bundle_test_helper", HELPER_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sample_canvas_row(updated_by_user_id=1) -> dict:
    """Return a representative canvas row with a local updater identity."""

    return {
        "id": 7,
        "canvas_key": "default",
        "schema_version": "sketch-canvas-v1",
        "canvas_data": {"stickers": [{"mediaId": 11}], "lines": [{"points": [[1, 2], [3, 4]]}]},
        "revision": 29,
        "created_at": "2026-07-12T01:02:03+00:00",
        "updated_at": "2026-07-12T04:05:06+00:00",
        "updated_by_user_id": updated_by_user_id,
    }


class FakeEngine:
    """Minimal engine/context manager for import tests."""

    def begin(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False


def install_common_import_fakes(monkeypatch, helper, *, canvas_row, media_rows=None, item_rows=None):
    """Patch external import dependencies so tests never touch real data."""

    media_rows = list(media_rows or [])
    item_rows = list(item_rows or [])
    manifest = {
        "bundleSchemaVersion": helper.BUNDLE_SCHEMA_VERSION,
        "homepageItemsScope": helper.HOMEPAGE_ITEMS_SCOPE_REPLACE if item_rows else helper.HOMEPAGE_ITEMS_SCOPE_EXCLUDED,
        "fileHashes": [],
        "sourceGitCommit": helper.get_git_commit(),
        "sourceAlembicHead": [],
    }

    monkeypatch.setattr(helper, "ensure_repo_root", lambda: None)
    monkeypatch.setattr(
        helper,
        "load_bundle",
        lambda bundle_path: (Path("fake-bundle"), manifest, dict(canvas_row), media_rows, item_rows),
    )
    monkeypatch.setattr(helper, "verify_bundle_files", lambda bundle_dir, bundle_manifest: None)
    monkeypatch.setattr(helper, "get_engine", lambda: FakeEngine())
    monkeypatch.setattr(
        helper,
        "reflect_tables",
        lambda engine: {"canvas": "canvas", "media": "media", "items": "items"},
    )
    monkeypatch.setattr(helper, "get_db_alembic_current", lambda connection: [])
    monkeypatch.setattr(helper, "select_visible_homepage_items", lambda connection, table: [])
    monkeypatch.setattr(helper, "select_stale_visible_homepage_items", lambda connection, table, ids: [])
    return manifest


def test_export_sanitizes_canvas_updater_without_mutating_source(tmp_path):
    helper = load_publish_helper()
    source_row = sample_canvas_row(updated_by_user_id=1)
    source_before = dict(source_row)

    bundled_row = helper.sanitize_canvas_row_for_public_bundle(source_row)
    bundle_json = tmp_path / "homepage_canvas_states.json"
    helper.write_json(bundle_json, {"row": bundled_row})

    assert bundled_row["updated_by_user_id"] is None
    assert source_row == source_before
    assert '"updated_by_user_id": null' in bundle_json.read_text(encoding="utf-8")


def test_import_normalizes_legacy_canvas_user_id_and_preserves_canvas_fields(monkeypatch):
    helper = load_publish_helper()
    legacy_canvas = sample_canvas_row(updated_by_user_id=1)
    media_rows = [
        {
            "id": 11,
            "relative_path": "data/uploads/homepage/images/example.png",
            "is_enabled": True,
        }
    ]
    item_rows = [{"id": 21, "media_id": 11, "is_visible": True, "sort_order": 1}]
    install_common_import_fakes(
        monkeypatch,
        helper,
        canvas_row=legacy_canvas,
        media_rows=media_rows,
        item_rows=item_rows,
    )

    captured_upserts: list[tuple[str, dict, list[str]]] = []
    monkeypatch.setattr(helper, "backup_existing_state", lambda *args, **kwargs: None)
    monkeypatch.setattr(helper, "import_files", lambda bundle_dir, manifest: 0)
    monkeypatch.setattr(helper, "hide_stale_homepage_items", lambda connection, table, rows: 0)
    monkeypatch.setattr(helper, "refresh_sequence", lambda connection, table_name: None)
    monkeypatch.setattr(
        helper,
        "upsert_row",
        lambda connection, table, row, conflict_columns: captured_upserts.append(
            (table, dict(row), list(conflict_columns))
        ),
    )

    helper.import_bundle(Namespace(bundle_path="legacy-bundle", dry_run=False, force=False))

    canvas_upserts = [row for table, row, _ in captured_upserts if table == "canvas"]
    assert len(canvas_upserts) == 1
    imported_canvas = canvas_upserts[0]
    assert imported_canvas["updated_by_user_id"] is None
    for field in ("canvas_key", "schema_version", "canvas_data", "revision", "created_at", "updated_at"):
        assert imported_canvas[field] == legacy_canvas[field]
    assert [table for table, _, _ in captured_upserts] == ["media", "items", "canvas"]


def test_import_dry_run_does_not_mutate_any_publish_tables(monkeypatch):
    helper = load_publish_helper()
    install_common_import_fakes(
        monkeypatch,
        helper,
        canvas_row=sample_canvas_row(updated_by_user_id=1),
        media_rows=[
            {
                "id": 11,
                "relative_path": "data/uploads/homepage/images/example.png",
                "is_enabled": True,
            }
        ],
        item_rows=[{"id": 21, "media_id": 11, "is_visible": True, "sort_order": 1}],
    )

    def fail_mutation(*args, **kwargs):
        raise AssertionError("dry-run attempted a mutating operation")

    monkeypatch.setattr(helper, "backup_existing_state", fail_mutation)
    monkeypatch.setattr(helper, "import_files", fail_mutation)
    monkeypatch.setattr(helper, "hide_stale_homepage_items", fail_mutation)
    monkeypatch.setattr(helper, "upsert_row", fail_mutation)
    monkeypatch.setattr(helper, "refresh_sequence", fail_mutation)

    helper.import_bundle(Namespace(bundle_path="legacy-bundle", dry_run=True, force=False))
