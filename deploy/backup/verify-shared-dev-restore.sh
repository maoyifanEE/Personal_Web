#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_ROOT="/var/backups/personal-web/shared-dev"
EXPECTED_ALEMBIC_REVISION="20260712_0006"
LOCK_FILE="/run/lock/personal-web-shared-dev-restore-verify.lock"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail() {
  printf '[personal-web restore verify] ERROR: %s\n' "$1" >&2
  exit 1
}

run_pg() {
  runuser --user postgres -- "$@"
}

validate_tar_archive() {
  local archive="$1"
  python3 - "$archive" <<'PY'
import sys
import tarfile
from pathlib import PurePosixPath

with tarfile.open(sys.argv[1], "r:gz") as tar:
    for member in tar.getmembers():
        name = member.name.replace("\\", "/").strip("/")
        pure = PurePosixPath(name)
        if not name or member.name.startswith("/") or ":" in name or any(part in {"", ".", ".."} for part in pure.parts):
            raise SystemExit("unsafe tar member path")
        if not (member.isfile() or member.isdir()):
            raise SystemExit("unsafe tar member type")
PY
}

cleanup_restore() {
  local original_status="$1"
  local cleanup_status=0
  set +e
  if [[ -n "${restore_db:-}" ]]; then
    run_pg dropdb --if-exists "$restore_db" >/dev/null 2>&1 || cleanup_status=1
    run_pg psql --dbname=postgres --tuples-only --no-align \
      --command "select 1 from pg_database where datname = '$restore_db'" | grep -q 1 && cleanup_status=1
  fi
  if [[ -n "${restore_media_dir:-}" ]]; then
    rm -rf --one-file-system "$restore_media_dir" >/dev/null 2>&1 || cleanup_status=1
    [[ -e "$restore_media_dir" ]] && cleanup_status=1
  fi
  if [[ "$cleanup_status" -ne 0 ]]; then
    printf '[personal-web restore verify] cleanup incomplete\n' >&2
    exit 1
  fi
  if [[ "$original_status" -ne 0 ]]; then
    exit "$original_status"
  fi
}

main() {
  exec 9>"$LOCK_FILE"
  flock -n 9 || { printf '[personal-web restore verify] another restore drill is already active\n' >&2; return 0; }
  local backup_id="${1:-}"
  [[ "$backup_id" =~ ^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}$ ]] || fail "unsafe backup id"
  local backup_dir="$BACKUP_ROOT/$backup_id"
  local suffix
  suffix="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 12)"
  restore_db="personal_web_shared_dev_restore_verify_$(date -u +%Y%m%dT%H%M%SZ)_$suffix"
  restore_media_dir="$(mktemp -d "/tmp/personal-web-shared-media-restore-verify.${suffix}.XXXXXX")"
  [[ "$restore_db" =~ ^personal_web_shared_dev_restore_verify_[0-9]{8}T[0-9]{6}Z_[A-Za-z0-9]{8,32}$ ]] ||
    fail "restore database name is not temporary"
  [[ "$restore_db" != "personal_web_shared_dev" && "$restore_db" != "personal_web_prod" ]] ||
    fail "authoritative database target rejected"
  trap 'status=$?; cleanup_restore "$status"' EXIT
  [[ -f "$backup_dir/SUCCESS" ]] || fail "SUCCESS marker is missing"
  "$SCRIPT_DIR/verify-shared-dev-backup.sh" "$backup_id" >/dev/null 2>&1 || fail "backup verifier failed"
  (cd "$backup_dir" && sha256sum --check SHA256SUMS >/dev/null)
  validate_tar_archive "$backup_dir/homepage-media.tar.gz"
  run_pg createdb "$restore_db"
  run_pg pg_restore --no-owner --no-privileges --dbname="$restore_db" < "$backup_dir/personal_web_shared_dev.dump"
  tar --no-same-owner --no-same-permissions -xzf "$backup_dir/homepage-media.tar.gz" -C "$restore_media_dir"
  python3 - "$backup_dir/manifest.json" "$restore_media_dir" "$restore_db" <<'PY'
import hashlib
import json
from pathlib import Path
import subprocess
import sys

manifest_path, media_root, restore_db = sys.argv[1:]
manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
if restore_db in {"personal_web_shared_dev", "personal_web_prod"}:
    raise SystemExit("restore target is authoritative")
psql_base = ["runuser", "--user", "postgres", "--", "psql", "--dbname", restore_db, "--tuples-only", "--no-align"]
revision = subprocess.check_output(psql_base + ["--command", "select version_num from alembic_version limit 1"], text=True).strip()
if revision != "20260712_0006" or revision != manifest.get("alembicRevision"):
    raise SystemExit("restore Alembic revision mismatch")
tables = subprocess.check_output(psql_base + ["--command", "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name"], text=True).splitlines()
counts = {}
for table in tables:
    count = subprocess.check_output(psql_base + ["--command", f'select count(*) from "{table}"'], text=True).strip()
    counts[table] = int(count)
if counts != manifest.get("tableCounts"):
    raise SystemExit("table count mismatch")
canvas_meta = subprocess.check_output(psql_base + ["--command", "select coalesce(jsonb_agg(jsonb_build_object('canvasKey', canvas_key, 'revision', revision, 'updatedAt', updated_at) order by canvas_key), '[]'::jsonb)::text from homepage_canvas_states"], text=True).strip()
canvas_fingerprint = subprocess.check_output(psql_base + ["--command", "select md5(coalesce(string_agg(jsonb_build_object('canvasKey', canvas_key, 'schemaVersion', schema_version, 'revision', revision, 'updatedAt', updated_at)::text, E'\\n' order by canvas_key), '')) from homepage_canvas_states"], text=True).strip()
if not canvas_fingerprint or canvas_fingerprint != manifest.get("canvasFingerprint"):
    raise SystemExit("canvas fingerprint mismatch")
try:
    restored_canvas_metadata = json.loads(canvas_meta)
except json.JSONDecodeError as exc:
    raise SystemExit(f"canvas metadata is not JSON: {exc}") from exc
if restored_canvas_metadata != manifest.get("canvasMetadata"):
    raise SystemExit("canvas metadata mismatch")
files = []
root = Path(media_root)
for path in sorted(root.rglob("*")):
    if path.is_symlink() or not path.is_file():
        raise SystemExit("unsafe extracted media")
    data = path.read_bytes()
    files.append({"path": path.relative_to(root).as_posix(), "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
fingerprint = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
if len(files) != manifest.get("sourceMediaRegularFileCount"):
    raise SystemExit("media file count mismatch")
if sum(item["size"] for item in files) != manifest.get("sourceMediaLogicalBytes"):
    raise SystemExit("media logical bytes mismatch")
if fingerprint != manifest.get("sourceMediaTreeFingerprint"):
    raise SystemExit("media fingerprint mismatch")
PY
  trap - EXIT
  cleanup_restore 0
  printf '[personal-web restore verify] OK: %s\n' "$backup_id"
}

main "$@"
