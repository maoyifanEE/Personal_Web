#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_ROOT="/var/backups/personal-web/shared-dev"
EXPECTED_ALEMBIC_REVISION="20260712_0006"
LOCK_FILE="/run/lock/personal-web-shared-dev-restore-verify.lock"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE_VERIFIER="$SCRIPT_DIR/verify-shared-media-archive.py"
CANVAS_FINGERPRINT_HELPER="$SCRIPT_DIR/compute-shared-canvas-fingerprint.py"
RESTORE_LOCK_UNAVAILABLE_EXIT=75

fail() {
  printf '[personal-web restore verify] ERROR: %s\n' "$1" >&2
  exit 1
}

run_pg() {
  runuser --user postgres -- "$@"
}

random_suffix() {
  local value
  value="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(8))
PY
)"
  [[ "$value" =~ ^[0-9a-f]{16}$ ]] || return 1
  printf '%s\n' "$value"
}

require_safe_restore_db() {
  [[ "$1" =~ ^personal_web_shared_dev_restore_verify_[0-9]{8}T[0-9]{6}Z_[A-Za-z0-9a-f]{16}$ ]] ||
    fail "restore database name is not temporary"
  [[ "$1" != "personal_web_shared_dev" && "$1" != "personal_web_prod" ]] ||
    fail "authoritative database target rejected"
}

database_exists() {
  local name="$1"
  require_safe_restore_db "$name"
  local output
  if ! output="$(run_pg psql --dbname=postgres --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --command "select 1 from pg_database where datname = '$name'")"; then
    return 2
  fi
  case "$output" in
    "1") return 0 ;;
    "") return 1 ;;
    *) return 3 ;;
  esac
}

read_manifest_database_property() {
  local manifest="$1"
  local key="$2"
  python3 - "$manifest" "$key" <<'PY'
import json
import sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
value = data.get(sys.argv[2])
if not isinstance(value, str) or not value or "\x00" in value or "\n" in value or "\r" in value or len(value) > 256:
    raise SystemExit("unsafe database property")
print(value)
PY
}

create_restore_database_from_manifest() {
  local restore_db_name="$1"
  local manifest="$2"
  require_safe_restore_db "$restore_db_name"
  local db_encoding db_collate db_ctype
  db_encoding="$(read_manifest_database_property "$manifest" databaseEncoding)"
  db_collate="$(read_manifest_database_property "$manifest" databaseCollate)"
  db_ctype="$(read_manifest_database_property "$manifest" databaseCtype)"
  run_pg createdb --template=template0 --encoding="$db_encoding" --lc-collate="$db_collate" --lc-ctype="$db_ctype" "$restore_db_name"
}

cleanup_restore() {
  local original_status="$1"
  local cleanup_status=0
  set +e
  if [[ -n "${restore_db:-}" ]]; then
    run_pg dropdb --if-exists "$restore_db" >/dev/null 2>&1 || cleanup_status=1
    local exists_status=0
    database_exists "$restore_db" >/dev/null 2>&1 || exists_status=$?
    case "$exists_status" in
      1) ;;
      0)
        printf '[personal-web restore verify] cleanup incomplete: temporary database remains name=%s\n' "$restore_db" >&2
        cleanup_status=1
        ;;
      2|3)
        printf '[personal-web restore verify] cleanup incomplete: temporary database query failed name=%s\n' "$restore_db" >&2
        cleanup_status=1
        ;;
      *)
        printf '[personal-web restore verify] cleanup incomplete: unexpected database query status name=%s\n' "$restore_db" >&2
        cleanup_status=1
        ;;
    esac
  fi
  if [[ -n "${restore_media_dir:-}" ]]; then
    rm -rf --one-file-system "$restore_media_dir" >/dev/null 2>&1 || cleanup_status=1
    [[ -e "$restore_media_dir" ]] && cleanup_status=1
  fi
  if [[ -n "${restore_media_inventory:-}" ]]; then
    rm -f -- "$restore_media_inventory" >/dev/null 2>&1 || cleanup_status=1
    [[ -e "$restore_media_inventory" ]] && cleanup_status=1
  fi
  if [[ -n "${restore_canvas_fingerprint:-}" ]]; then
    rm -f -- "$restore_canvas_fingerprint" >/dev/null 2>&1 || cleanup_status=1
    [[ -e "$restore_canvas_fingerprint" ]] && cleanup_status=1
  fi
  if [[ "$cleanup_status" -ne 0 ]]; then
    printf '[personal-web restore verify] cleanup incomplete\n' >&2
    exit 1
  fi
  if [[ "$original_status" -ne 0 ]]; then
    exit "$original_status"
  fi
}

compute_canvas_fingerprint_from_restore() {
  local restore_db_name="$1"
  local out="$2"
  require_safe_restore_db "$restore_db_name"
  python3 "$CANVAS_FINGERPRINT_HELPER" --database "$restore_db_name" > "$out"
}

main() {
  exec 9>"$LOCK_FILE"
  flock -n 9 || {
    printf '[personal-web restore verify] restore drill lock unavailable; verification not performed\n' >&2
    exit "$RESTORE_LOCK_UNAVAILABLE_EXIT"
  }
  local backup_id="${1:-}"
  [[ "$backup_id" =~ ^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}$ ]] || fail "unsafe backup id"
  local backup_dir="$BACKUP_ROOT/$backup_id"
  local suffix
  suffix="$(random_suffix)"
  restore_db="personal_web_shared_dev_restore_verify_$(date -u +%Y%m%dT%H%M%SZ)_$suffix"
  restore_media_dir="$(mktemp -d "/tmp/personal-web-shared-media-restore-verify.${suffix}.XXXXXX")"
  restore_media_inventory="$(mktemp "/tmp/personal-web-shared-media-restore-inventory.${suffix}.XXXXXX")"
  restore_canvas_fingerprint="$(mktemp "/tmp/personal-web-shared-canvas-fingerprint.${suffix}.XXXXXX")"
  require_safe_restore_db "$restore_db"
  trap 'status=$?; cleanup_restore "$status"' EXIT
  [[ -f "$backup_dir/SUCCESS" ]] || fail "SUCCESS marker is missing"
  "$SCRIPT_DIR/verify-shared-dev-backup.sh" "$backup_id" >/dev/null 2>&1 || fail "backup verifier failed"
  (cd "$backup_dir" && sha256sum --check SHA256SUMS >/dev/null)
  python3 "$ARCHIVE_VERIFIER" \
    --archive "$backup_dir/homepage-media.tar.gz" \
    --extract-dir "$restore_media_dir" \
    --expect-manifest "$backup_dir/manifest.json" \
    --write-inventory "$restore_media_inventory" >/dev/null
  create_restore_database_from_manifest "$restore_db" "$backup_dir/manifest.json"
  run_pg pg_restore --no-owner --no-privileges --dbname="$restore_db" < "$backup_dir/personal_web_shared_dev.dump"
  compute_canvas_fingerprint_from_restore "$restore_db" "$restore_canvas_fingerprint"
  python3 - "$backup_dir/manifest.json" "$restore_media_inventory" "$restore_canvas_fingerprint" "$restore_db" <<'PY'
import json
from pathlib import Path
import subprocess
import sys

manifest_path, media_inventory_path, canvas_fingerprint_path, restore_db = sys.argv[1:]
manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
media_entries = [json.loads(line) for line in Path(media_inventory_path).read_text(encoding="utf-8").splitlines() if line.strip()]
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
canvas_fingerprint = Path(canvas_fingerprint_path).read_text(encoding="utf-8").strip()
if not canvas_fingerprint or canvas_fingerprint != manifest.get("canvasFingerprint"):
    raise SystemExit("canvas fingerprint mismatch")
try:
    restored_canvas_metadata = json.loads(canvas_meta)
except json.JSONDecodeError as exc:
    raise SystemExit(f"canvas metadata is not JSON: {exc}") from exc
if restored_canvas_metadata != manifest.get("canvasMetadata"):
    raise SystemExit("canvas metadata mismatch")
fingerprint = __import__("hashlib").sha256(json.dumps(media_entries, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
if len(media_entries) != manifest.get("sourceMediaRegularFileCount"):
    raise SystemExit("media file count mismatch")
if sum(item["size"] for item in media_entries) != manifest.get("sourceMediaLogicalBytes"):
    raise SystemExit("media logical bytes mismatch")
if fingerprint != manifest.get("sourceMediaTreeFingerprint"):
    raise SystemExit("media fingerprint mismatch")
PY
  trap - EXIT
  cleanup_restore 0
  printf '[personal-web restore verify] OK: %s\n' "$backup_id"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
