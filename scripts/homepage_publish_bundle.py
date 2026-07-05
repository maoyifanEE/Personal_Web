"""Export and import public Homepage/Journey publish bundles.

This helper is called by PowerShell wrapper scripts. It intentionally limits
the data scope to the public Homepage/Journey display surface and never
exports users, sessions, roles, permissions, visitor messages, debug logs, or
unrelated application data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
from typing import Any

from sqlalchemy import MetaData, Table, bindparam, create_engine, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

BUNDLE_SCHEMA_VERSION = "homepage-publish-bundle-v1"
APP_NAME = "Personal_Web"
CANVAS_KEY_DEFAULT = "default"
HOMEPAGE_MEDIA_ROOT = "data/uploads/homepage"
EXPORT_ROOT = ".local_exports"
BACKUP_ROOT = ".local_backups"
FILES_ROOT = "files/homepage"

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
BACKEND_ENV_PATH = BACKEND_DIR / ".env"


def log(message: str) -> None:
    """Print a consistent script log line."""

    print(f"[homepage-publish] {message}")


def fail(message: str) -> None:
    """Raise a user-facing script failure."""

    raise RuntimeError(message)


def utc_now_slug() -> str:
    """Return a timestamp safe for folder names."""

    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def utc_now_iso() -> str:
    """Return an ISO 8601 UTC timestamp."""

    return datetime.now(timezone.utc).isoformat()


def redact_database_url(url: str) -> str:
    """Hide the password portion of a database URL before logging."""

    return re.sub(r"://([^:/@\s]+):([^@\s]+)@", r"://\1:***@", url)


def load_backend_env() -> None:
    """Load backend/.env into the process without overriding existing env."""

    if not BACKEND_ENV_PATH.exists():
        log("backend/.env not found; relying on process environment")
        return

    loaded = 0
    for raw_line in BACKEND_ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
            loaded += 1
    log(f"Loaded {loaded} environment values from backend/.env")


def get_database_url() -> str:
    """Return DATABASE_URL from environment or backend/.env."""

    load_backend_env()
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        fail("DATABASE_URL is required in the environment or backend/.env")
    log(f"Using DATABASE_URL {redact_database_url(database_url)}")
    return database_url


def get_engine():
    """Create a SQLAlchemy engine for PostgreSQL."""

    return create_engine(get_database_url(), pool_pre_ping=True, future=True)


def run_git(args: list[str]) -> str | None:
    """Run a git command and return stdout, or None when unavailable."""

    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except Exception:
        return None
    output = completed.stdout.strip()
    return output or None


def get_git_commit() -> str | None:
    """Return the current repository commit if available."""

    return run_git(["rev-parse", "HEAD"])


def get_alembic_heads() -> list[str]:
    """Find local Alembic head revisions by inspecting migration files."""

    versions_dir = BACKEND_DIR / "alembic" / "versions"
    revisions: dict[str, list[str]] = {}
    for path in versions_dir.glob("*.py"):
        text_value = path.read_text(encoding="utf-8")
        revision_match = re.search(r"revision:\s*str\s*=\s*['\"]([^'\"]+)['\"]", text_value)
        down_match = re.search(r"down_revision:\s*[^=]*=\s*([^#\n]+)", text_value)
        if not revision_match:
            continue
        revision = revision_match.group(1)
        down_revision_text = down_match.group(1).strip() if down_match else "None"
        parents = re.findall(r"['\"]([^'\"]+)['\"]", down_revision_text)
        revisions[revision] = parents

    all_revisions = set(revisions)
    referenced = {parent for parents in revisions.values() for parent in parents}
    heads = sorted(all_revisions - referenced)
    return heads


def get_db_alembic_current(connection) -> list[str]:
    """Return revisions from alembic_version when the table exists."""

    result = connection.execute(
        text(
            "select to_regclass('public.alembic_version') as table_name"
        )
    ).mappings().first()
    if not result or not result["table_name"]:
        return []
    rows = connection.execute(text("select version_num from alembic_version")).mappings().all()
    return sorted(row["version_num"] for row in rows)


def datetime_to_json(value: Any) -> Any:
    """Serialize datetimes and nested containers for JSON output."""

    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: datetime_to_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [datetime_to_json(item) for item in value]
    return value


def parse_datetime_fields(row: dict[str, Any]) -> dict[str, Any]:
    """Convert ISO datetime strings back to datetime values for SQLAlchemy."""

    parsed = dict(row)
    for key in ("created_at", "updated_at"):
        value = parsed.get(key)
        if isinstance(value, str):
            parsed[key] = datetime.fromisoformat(value)
    return parsed


def write_json(path: Path, payload: Any) -> None:
    """Write stable UTF-8 JSON."""

    path.write_text(
        json.dumps(datetime_to_json(payload), ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def read_json(path: Path) -> Any:
    """Read UTF-8 JSON."""

    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    """Return a file SHA256 digest."""

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_repo_root() -> None:
    """Require script execution from the repository root."""

    if Path.cwd().resolve() != REPO_ROOT.resolve():
        fail(f"Run this script from repo root: {REPO_ROOT}")


def is_safe_posix_relative(path_value: str) -> bool:
    """Return whether a path is relative, POSIX-like, and traversal-free."""

    if not path_value or "\\" in path_value or ":" in path_value:
        return False
    path = PurePosixPath(path_value)
    return not path.is_absolute() and ".." not in path.parts


def validate_media_relative_path(relative_path: str) -> PurePosixPath:
    """Validate a homepage media database relative path."""

    if not is_safe_posix_relative(relative_path):
        fail(f"Unsafe homepage media path rejected: {relative_path}")
    path = PurePosixPath(relative_path)
    root = PurePosixPath(HOMEPAGE_MEDIA_ROOT)
    if path.parts[: len(root.parts)] != root.parts:
        fail(f"Homepage media path is outside {HOMEPAGE_MEDIA_ROOT}: {relative_path}")
    return path


def bundle_path_for_media(relative_path: str) -> PurePosixPath:
    """Return the bundle-internal path for a homepage media file."""

    media_path = validate_media_relative_path(relative_path)
    root = PurePosixPath(HOMEPAGE_MEDIA_ROOT)
    subpath = PurePosixPath(*media_path.parts[len(root.parts) :])
    if not subpath.parts:
        fail(f"Homepage media path has no file subpath: {relative_path}")
    return PurePosixPath(FILES_ROOT) / subpath


def resolve_inside(base: Path, relative_path: str) -> Path:
    """Resolve a relative path and ensure it remains under base."""

    if not is_safe_posix_relative(relative_path):
        fail(f"Unsafe bundle path rejected: {relative_path}")
    candidate = (base / Path(relative_path)).resolve()
    if not candidate.is_relative_to(base.resolve()):
        fail(f"Path escapes expected root: {relative_path}")
    return candidate


def extract_media_ids(value: Any) -> set[int]:
    """Recursively collect explicit mediaId values from canvas JSON."""

    media_ids: set[int] = set()
    if isinstance(value, dict):
        raw_media_id = value.get("mediaId")
        if isinstance(raw_media_id, int) and raw_media_id > 0:
            media_ids.add(raw_media_id)
        elif isinstance(raw_media_id, str) and raw_media_id.isdigit():
            media_ids.add(int(raw_media_id))
        for item in value.values():
            media_ids.update(extract_media_ids(item))
    elif isinstance(value, list):
        for item in value:
            media_ids.update(extract_media_ids(item))
    return media_ids


def reflect_tables(engine):
    """Reflect only the homepage tables used by the publish bundle."""

    metadata = MetaData()
    tables = {
        "canvas": Table("homepage_canvas_states", metadata, autoload_with=engine),
        "media": Table("homepage_media", metadata, autoload_with=engine),
        "items": Table("homepage_items", metadata, autoload_with=engine),
    }
    return tables


def table_row_to_dict(row: Any) -> dict[str, Any]:
    """Convert a SQLAlchemy row mapping into a plain dict."""

    return dict(row._mapping)


def select_rows_by_ids(connection, table: Table, ids: set[int]) -> list[dict[str, Any]]:
    """Select rows from a table by integer id set."""

    if not ids:
        return []
    statement = select(table).where(table.c.id.in_(bindparam("ids", expanding=True)))
    rows = connection.execute(statement, {"ids": sorted(ids)}).all()
    return [table_row_to_dict(row) for row in rows]


def select_visible_homepage_items(connection, table: Table) -> list[dict[str, Any]]:
    """Select public visible homepage display items."""

    rows = connection.execute(
        select(table).where(table.c.is_visible.is_(True)).order_by(table.c.sort_order, table.c.id)
    ).all()
    return [table_row_to_dict(row) for row in rows]


def filter_export_scope(
    *,
    canvas_media_ids: set[int],
    item_rows: list[dict[str, Any]],
    media_rows: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    """Filter homepage items that are not safe enough for a public bundle."""

    warnings: list[str] = []
    media_by_id = {row["id"]: row for row in media_rows}
    valid_media_ids: set[int] = set()

    for media_id, row in media_by_id.items():
        try:
            validate_media_relative_path(row["relative_path"])
        except RuntimeError as exc:
            if media_id in canvas_media_ids:
                raise
            warnings.append(f"Skipped homepage item media id {media_id}: {exc}")
            continue
        valid_media_ids.add(media_id)

    filtered_items: list[dict[str, Any]] = []
    for row in item_rows:
        media_id = row.get("media_id")
        if media_id is None:
            filtered_items.append(row)
            continue
        media = media_by_id.get(media_id)
        if not media:
            warnings.append(f"Skipped visible homepage item {row['id']} with missing media id {media_id}")
            continue
        if media_id not in valid_media_ids:
            warnings.append(f"Skipped visible homepage item {row['id']} with unsafe media id {media_id}")
            continue
        if not media.get("is_enabled"):
            warnings.append(f"Skipped visible homepage item {row['id']} with disabled media id {media_id}")
            continue
        filtered_items.append(row)

    item_media_ids = {
        row["media_id"] for row in filtered_items if isinstance(row.get("media_id"), int)
    }
    final_media_ids = canvas_media_ids | item_media_ids
    filtered_media = [row for row in media_rows if row["id"] in final_media_ids and row["id"] in valid_media_ids]
    return filtered_items, filtered_media, warnings


def select_default_canvas(connection, table: Table) -> dict[str, Any] | None:
    """Select the default published Homepage/Journey canvas row."""

    row = connection.execute(
        select(table).where(table.c.canvas_key == CANVAS_KEY_DEFAULT).limit(1)
    ).first()
    return table_row_to_dict(row) if row else None


def copy_media_files(bundle_dir: Path, media_rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    """Copy referenced media files into the bundle with hash metadata."""

    copied_files: list[dict[str, Any]] = []
    warnings: list[str] = []

    for row in media_rows:
        relative_path = row["relative_path"]
        bundle_relative = str(bundle_path_for_media(relative_path))
        source_path = resolve_inside(REPO_ROOT, relative_path)
        destination_path = resolve_inside(bundle_dir, bundle_relative)

        if not source_path.exists() or not source_path.is_file():
            warning = f"Missing homepage media file for media id {row['id']}: {relative_path}"
            warnings.append(warning)
            log(f"WARNING {warning}")
            continue
        if source_path.is_symlink():
            warning = f"Skipped symlink homepage media file for media id {row['id']}: {relative_path}"
            warnings.append(warning)
            log(f"WARNING {warning}")
            continue

        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, destination_path)
        copied_files.append(
            {
                "mediaId": row["id"],
                "relativePath": relative_path,
                "bundlePath": bundle_relative,
                "sha256": sha256_file(destination_path),
                "fileSizeBytes": destination_path.stat().st_size,
            }
        )
        log(f"Copied media id {row['id']} to {bundle_relative}")

    return copied_files, warnings


def build_manifest(
    *,
    canvas_row: dict[str, Any],
    media_rows: list[dict[str, Any]],
    copied_files: list[dict[str, Any]],
    warnings: list[str],
    connection,
) -> dict[str, Any]:
    """Build the bundle manifest."""

    return {
        "bundleSchemaVersion": BUNDLE_SCHEMA_VERSION,
        "exportedAt": utc_now_iso(),
        "sourceGitCommit": get_git_commit(),
        "sourceAlembicHead": get_alembic_heads(),
        "sourceDatabaseAlembicCurrent": get_db_alembic_current(connection),
        "sourceCanvasKey": canvas_row["canvas_key"],
        "sourceCanvasRevision": canvas_row["revision"],
        "appName": APP_NAME,
        "mediaIds": sorted(row["id"] for row in media_rows),
        "fileCount": len(copied_files),
        "fileHashes": copied_files,
        "warnings": warnings,
        "publicDataNotice": (
            "This bundle may contain public homepage images or videos. "
            "Handle it carefully and do not commit exported bundles."
        ),
    }


def maybe_create_zip(bundle_dir: Path) -> Path:
    """Create a zip archive beside the bundle directory."""

    zip_base = bundle_dir
    archive_path = shutil.make_archive(str(zip_base), "zip", bundle_dir)
    log(f"Created ZIP archive: {archive_path}")
    return Path(archive_path)


def export_bundle(args: argparse.Namespace) -> None:
    """Export the public Homepage/Journey bundle."""

    ensure_repo_root()
    export_root = REPO_ROOT / EXPORT_ROOT
    bundle_dir = export_root / f"homepage-publish-bundle-{utc_now_slug()}"
    bundle_dir.mkdir(parents=True, exist_ok=False)
    log(f"Exporting bundle to {bundle_dir}")

    engine = get_engine()
    with engine.connect() as connection:
        tables = reflect_tables(engine)
        canvas_row = select_default_canvas(connection, tables["canvas"])
        if not canvas_row:
            fail("Default homepage canvas row was not found; save the Journey canvas before export")

        canvas_data = canvas_row["canvas_data"]
        canvas_media_ids = extract_media_ids(canvas_data)
        item_rows = select_visible_homepage_items(connection, tables["items"])
        item_media_ids = {
            row["media_id"] for row in item_rows if isinstance(row.get("media_id"), int)
        }
        media_ids = canvas_media_ids | item_media_ids
        media_rows = select_rows_by_ids(connection, tables["media"], media_ids)
        found_media_ids = {row["id"] for row in media_rows}

        warnings = [
            f"Canvas or visible homepage item references missing media id {media_id}"
            for media_id in sorted(media_ids - found_media_ids)
        ]
        item_rows, media_rows, filter_warnings = filter_export_scope(
            canvas_media_ids=canvas_media_ids,
            item_rows=item_rows,
            media_rows=media_rows,
        )
        warnings.extend(filter_warnings)
        copied_files, file_warnings = copy_media_files(bundle_dir, media_rows)
        warnings.extend(file_warnings)

        write_json(bundle_dir / "homepage_canvas_states.json", {"row": canvas_row})
        write_json(bundle_dir / "homepage_media.json", {"rows": media_rows})
        write_json(bundle_dir / "homepage_items.json", {"rows": item_rows})
        manifest = build_manifest(
            canvas_row=canvas_row,
            media_rows=media_rows,
            copied_files=copied_files,
            warnings=warnings,
            connection=connection,
        )
        write_json(bundle_dir / "manifest.json", manifest)

    if args.create_zip:
        maybe_create_zip(bundle_dir)

    log("EXPORT_REPORT_START")
    log(f"bundlePath={bundle_dir}")
    log(f"sourceGitCommit={manifest['sourceGitCommit']}")
    log(f"sourceAlembicHead={manifest['sourceAlembicHead']}")
    log(f"sourceCanvasKey={manifest['sourceCanvasKey']}")
    log(f"sourceCanvasRevision={manifest['sourceCanvasRevision']}")
    log(f"mediaCount={len(media_rows)}")
    log(f"fileCount={len(copied_files)}")
    log(f"missingFileCount={len(file_warnings)}")
    log(f"warningCount={len(warnings)}")
    log("EXPORT_REPORT_END")


def load_bundle(bundle_path: Path) -> tuple[Path, dict[str, Any], dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """Load and minimally validate bundle JSON files."""

    bundle_dir = bundle_path.resolve()
    if not bundle_dir.exists() or not bundle_dir.is_dir():
        fail(f"BundlePath must be an existing folder: {bundle_path}")

    manifest_path = bundle_dir / "manifest.json"
    if not manifest_path.exists():
        fail("Bundle manifest.json is missing")

    manifest = read_json(manifest_path)
    if manifest.get("bundleSchemaVersion") != BUNDLE_SCHEMA_VERSION:
        fail(
            "Unsupported bundleSchemaVersion: "
            f"{manifest.get('bundleSchemaVersion')} expected {BUNDLE_SCHEMA_VERSION}"
        )

    canvas_payload = read_json(bundle_dir / "homepage_canvas_states.json")
    media_payload = read_json(bundle_dir / "homepage_media.json")
    item_payload = read_json(bundle_dir / "homepage_items.json")
    return (
        bundle_dir,
        manifest,
        canvas_payload["row"],
        media_payload.get("rows", []),
        item_payload.get("rows", []),
    )


def verify_bundle_files(bundle_dir: Path, manifest: dict[str, Any]) -> None:
    """Verify bundle file paths and SHA256 hashes."""

    for entry in manifest.get("fileHashes", []):
        relative_path = entry["relativePath"]
        bundle_path = entry["bundlePath"]
        validate_media_relative_path(relative_path)
        if not is_safe_posix_relative(bundle_path):
            fail(f"Unsafe bundle file path rejected: {bundle_path}")
        if not str(PurePosixPath(bundle_path)).startswith(f"{FILES_ROOT}/"):
            fail(f"Bundle file path is outside {FILES_ROOT}: {bundle_path}")
        path = resolve_inside(bundle_dir, bundle_path)
        if not path.exists() or not path.is_file() or path.is_symlink():
            fail(f"Bundle media file is missing or invalid: {bundle_path}")
        actual_hash = sha256_file(path)
        if actual_hash != entry["sha256"]:
            fail(f"SHA256 mismatch for {bundle_path}")
        log(f"Verified hash for {bundle_path}")


def check_import_compatibility(manifest: dict[str, Any], current_db_heads: list[str], force: bool) -> list[str]:
    """Validate import compatibility and return warnings."""

    warnings: list[str] = []
    current_git = get_git_commit()
    source_git = manifest.get("sourceGitCommit")
    source_heads = manifest.get("sourceAlembicHead") or []

    if source_git and current_git and source_git != current_git:
        message = f"Bundle source git {source_git} differs from current git {current_git}"
        if not force:
            fail(f"{message}; rerun with -Force only after confirming compatibility")
        warnings.append(message)

    if source_heads and current_db_heads and sorted(source_heads) != sorted(current_db_heads):
        message = f"Bundle Alembic head {source_heads} differs from current DB {current_db_heads}"
        if not force:
            fail(f"{message}; rerun with -Force only after confirming compatibility")
        warnings.append(message)

    return warnings


def backup_existing_state(
    connection,
    tables: dict[str, Table],
    backup_dir: Path,
    canvas_row: dict[str, Any],
    media_rows: list[dict[str, Any]],
    item_rows: list[dict[str, Any]],
) -> None:
    """Back up rows and files that may be overwritten by import."""

    backup_dir.mkdir(parents=True, exist_ok=False)
    media_ids = {row["id"] for row in media_rows}
    item_ids = {row["id"] for row in item_rows}

    current_canvas = select_default_canvas(connection, tables["canvas"])
    current_media = select_rows_by_ids(connection, tables["media"], media_ids)
    current_items = select_rows_by_ids(connection, tables["items"], item_ids)

    write_json(backup_dir / "homepage_canvas_states.json", {"row": current_canvas})
    write_json(backup_dir / "homepage_media.json", {"rows": current_media})
    write_json(backup_dir / "homepage_items.json", {"rows": current_items})

    for row in current_media:
        relative_path = row.get("relative_path")
        if not relative_path:
            continue
        source_path = resolve_inside(REPO_ROOT, relative_path)
        if source_path.exists() and source_path.is_file() and not source_path.is_symlink():
            backup_relative = str(bundle_path_for_media(relative_path))
            destination = resolve_inside(backup_dir, backup_relative)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, destination)

    write_json(
        backup_dir / "backup_manifest.json",
        {
            "createdAt": utc_now_iso(),
            "reason": "homepage publish bundle import backup",
            "canvasKey": canvas_row.get("canvas_key", CANVAS_KEY_DEFAULT),
            "mediaIds": sorted(media_ids),
            "itemIds": sorted(item_ids),
        },
    )
    log(f"Created import backup at {backup_dir}")


def upsert_row(connection, table: Table, row: dict[str, Any], conflict_columns: list[str]) -> None:
    """Upsert one row using PostgreSQL ON CONFLICT."""

    clean_row = parse_datetime_fields(row)
    allowed_columns = set(table.c.keys())
    clean_row = {key: value for key, value in clean_row.items() if key in allowed_columns}
    insert_statement = pg_insert(table).values(**clean_row)
    update_columns = {
        key: insert_statement.excluded[key]
        for key in clean_row
        if key not in conflict_columns and key in table.c
    }
    statement = insert_statement.on_conflict_do_update(
        index_elements=[table.c[column] for column in conflict_columns],
        set_=update_columns,
    )
    connection.execute(statement)


def refresh_sequence(connection, table_name: str) -> None:
    """Move a PostgreSQL serial sequence past the current max id."""

    connection.execute(
        text(
            "select setval("
            "pg_get_serial_sequence(:table_name, 'id'), "
            f"greatest((select coalesce(max(id), 1) from {table_name}), 1), "
            "true)"
        ),
        {"table_name": table_name},
    )


def import_files(bundle_dir: Path, manifest: dict[str, Any]) -> int:
    """Copy verified bundle files into runtime homepage upload storage."""

    imported = 0
    for entry in manifest.get("fileHashes", []):
        source = resolve_inside(bundle_dir, entry["bundlePath"])
        destination = resolve_inside(REPO_ROOT, entry["relativePath"])
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        imported += 1
        log(f"Imported media file {entry['relativePath']}")
    return imported


def import_bundle(args: argparse.Namespace) -> None:
    """Validate and optionally import a homepage publish bundle."""

    ensure_repo_root()
    bundle_dir, manifest, canvas_row, media_rows, item_rows = load_bundle(Path(args.bundle_path))
    log(f"Loaded bundle from {bundle_dir}")
    verify_bundle_files(bundle_dir, manifest)

    for row in media_rows:
        validate_media_relative_path(row["relative_path"])

    engine = get_engine()
    with engine.begin() as connection:
        tables = reflect_tables(engine)
        db_heads = get_db_alembic_current(connection)
        warnings = check_import_compatibility(manifest, db_heads, args.force)

        if args.dry_run:
            log("DRY_RUN_REPORT_START")
            log(f"APP_ENV={os.environ.get('APP_ENV', 'unknown')}")
            log(f"currentGitCommit={get_git_commit()}")
            log(f"currentAlembicHead={db_heads}")
            log(f"importCanvasKey={canvas_row.get('canvas_key')}")
            log(f"importCanvasRevision={canvas_row.get('revision')}")
            log(f"mediaRowsToImport={len(media_rows)}")
            log(f"filesToImport={len(manifest.get('fileHashes', []))}")
            log(f"warningCount={len(warnings)}")
            log("DRY_RUN_REPORT_END")
            return

        backup_dir = REPO_ROOT / BACKUP_ROOT / f"homepage-import-backup-{utc_now_slug()}"
        backup_existing_state(connection, tables, backup_dir, canvas_row, media_rows, item_rows)
        files_imported = import_files(bundle_dir, manifest)

        for row in media_rows:
            upsert_row(connection, tables["media"], row, ["id"])
        for row in item_rows:
            upsert_row(connection, tables["items"], row, ["id"])
        upsert_row(connection, tables["canvas"], canvas_row, ["canvas_key"])

        refresh_sequence(connection, "homepage_media")
        refresh_sequence(connection, "homepage_items")
        refresh_sequence(connection, "homepage_canvas_states")

    log("IMPORT_REPORT_START")
    log(f"APP_ENV={os.environ.get('APP_ENV', 'unknown')}")
    log(f"currentGitCommit={get_git_commit()}")
    log(f"currentAlembicHead={db_heads}")
    log(f"importedCanvasKey={canvas_row.get('canvas_key')}")
    log(f"importedCanvasRevision={canvas_row.get('revision')}")
    log(f"mediaRowsImported={len(media_rows)}")
    log(f"filesImported={files_imported}")
    log(f"backupPath={backup_dir}")
    log(f"warningCount={len(warnings)}")
    log("IMPORT_REPORT_END")


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line parser."""

    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    export_parser = subparsers.add_parser("export", help="Export a homepage publish bundle")
    export_parser.add_argument("--create-zip", action="store_true", help="Create a ZIP beside the bundle folder")
    export_parser.set_defaults(func=export_bundle)

    import_parser = subparsers.add_parser("import", help="Import or dry-run a homepage publish bundle")
    import_parser.add_argument("--bundle-path", required=True, help="Path to homepage publish bundle folder")
    import_parser.add_argument("--dry-run", action="store_true", help="Validate without changing DB or files")
    import_parser.add_argument("--force", action="store_true", help="Override git/Alembic mismatch warnings")
    import_parser.set_defaults(func=import_bundle)

    return parser


def main() -> int:
    """Run the selected command and return a process exit code."""

    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except Exception as exc:
        log(f"ERROR {exc}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
