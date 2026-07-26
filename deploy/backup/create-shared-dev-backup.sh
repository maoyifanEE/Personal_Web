#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

BACKUP_ROOT="/var/backups/personal-web/shared-dev"
DATABASE_NAME="personal_web_shared_dev"
MEDIA_ROOT="/srv/personal-web/shared-dev/homepage"
EXPECTED_ALEMBIC_REVISION="20260712_0006"
KEEP_SUCCESSFUL=14
PARTIAL_RETENTION_DAYS=3
LOCK_FILE="/run/lock/personal-web-shared-dev-backup.lock"
REQUIRED_FILES=(personal_web_shared_dev.dump homepage-media.tar.gz manifest.json SHA256SUMS SUCCESS)
HASHED_FILES=(personal_web_shared_dev.dump homepage-media.tar.gz manifest.json)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE_VERIFIER="$SCRIPT_DIR/verify-shared-media-archive.py"
CANVAS_FINGERPRINT_HELPER="$SCRIPT_DIR/compute-shared-canvas-fingerprint.py"
POSTGRES_IDENTIFIER_MAX_BYTES=63
TEMP_DB_NAME_BYTES=57

log() {
  printf '[personal-web shared backup] %s\n' "$1" >&2
}

fail() {
  log "ERROR: $1"
  exit 1
}

run_pg() {
  runuser --user postgres -- "$@"
}

random_suffix() {
  local value
  value="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(16))
PY
)"
  [[ "$value" =~ ^[0-9a-f]{32}$ ]] || return 1
  printf '%s\n' "$value"
}

require_safe_backup_id() {
  [[ "$1" =~ ^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}$ ]] || fail "unsafe backup id"
}

require_safe_verify_db() {
  [[ "$1" =~ ^pw_bk_v_[0-9]{8}T[0-9]{6}Z_[0-9a-f]{32}$ ]] ||
    fail "unsafe verification database name"
  [[ "$1" != "personal_web_shared_dev" && "$1" != "personal_web_prod" && "$1" != *prod* ]] ||
    fail "authoritative database target rejected"
  local byte_length
  byte_length="$(printf '%s' "$1" | wc -c | tr -d ' ')"
  [[ "$byte_length" == "$TEMP_DB_NAME_BYTES" && "$byte_length" -le "$POSTGRES_IDENTIFIER_MAX_BYTES" ]] ||
    fail "verification database name exceeds PostgreSQL identifier length"
}

database_exists() {
  local name="$1"
  require_safe_verify_db "$name"
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

verify_database_created_exactly() {
  local name="$1"
  require_safe_verify_db "$name"
  local output
  if ! output="$(run_pg psql --dbname=postgres --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --command "select datname from pg_database where datname = '$name'")"; then
    fail "verification database exact-name query failed"
  fi
  if [[ "$output" != "$name" ]]; then
    fail "verification database exact-name readback mismatch"
  fi
}

require_direct_child() {
  local path="$1"
  case "$path" in "$BACKUP_ROOT"/*) ;; *) fail "backup path escaped root" ;; esac
  [[ "${path#"$BACKUP_ROOT"/}" != *"/"* ]] || fail "backup path is not a direct child"
}

require_root_dir_0700() {
  local path="$1"
  [[ -d "$path" && ! -L "$path" ]] || fail "required directory is missing or unsafe"
  [[ "$(stat -c '%U:%G:%a' "$path")" == "root:root:700" ]] || fail "directory owner or mode is unsafe"
}

require_regular_root_file_0600() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || fail "required file is missing or unsafe"
  [[ "$(stat -c '%U:%G:%a' "$path")" == "root:root:600" ]] || fail "file owner or mode is unsafe"
}

require_exact_file_set() {
  local dir="$1"
  python3 - "$dir" <<'PY' || fail "backup file set mismatch"
from pathlib import Path
import sys
required = {"personal_web_shared_dev.dump", "homepage-media.tar.gz", "manifest.json", "SHA256SUMS", "SUCCESS"}
actual = {entry.name for entry in Path(sys.argv[1]).iterdir()}
if actual != required:
    raise SystemExit(1)
PY
}

require_shared_sources() {
  [[ "$DATABASE_NAME" == "personal_web_shared_dev" ]] || fail "unexpected database name"
  [[ "$DATABASE_NAME" != *prod* ]] || fail "production database rejected"
  [[ "$MEDIA_ROOT" == "/srv/personal-web/shared-dev/homepage" ]] || fail "unexpected media root"
  [[ -d "$MEDIA_ROOT" && ! -L "$MEDIA_ROOT" ]] || fail "media root missing or unsafe"
  run_pg psql --dbname=postgres --tuples-only --no-align \
    --command "select datname from pg_database where datname = 'personal_web_shared_dev'" |
    grep -qx "personal_web_shared_dev" || fail "source database missing"
}

create_dump_from_source() {
  local dump="$1"
  run_pg pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_NAME" > "$dump"
  [[ -s "$dump" ]] || fail "dump missing or empty"
}

collect_source_database_properties() {
  local out="$1"
  run_pg psql --dbname=postgres --no-align --tuples-only --set=ON_ERROR_STOP=1 <<'SQL' > "$out"
select jsonb_build_object(
  'databaseEncoding', pg_encoding_to_char(encoding),
  'databaseCollate', datcollate,
  'databaseCtype', datctype
)
from pg_database
where datname = 'personal_web_shared_dev';
SQL
  python3 - "$out" <<'PY'
import json
import sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for key in ("databaseEncoding", "databaseCollate", "databaseCtype"):
    value = data.get(key)
    if not isinstance(value, str) or not value or "\x00" in value or "\n" in value or "\r" in value or len(value) > 256:
        raise SystemExit(f"unsafe database property: {key}")
PY
}

read_database_property() {
  local file="$1"
  local key="$2"
  python3 - "$file" "$key" <<'PY'
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

collect_verify_database_properties() {
  local verify_db="$1"
  local out="$2"
  require_safe_verify_db "$verify_db"
  run_pg psql --dbname=postgres --no-align --tuples-only --set=ON_ERROR_STOP=1 \
    --command "select jsonb_build_object('databaseEncoding', pg_encoding_to_char(encoding), 'databaseCollate', datcollate, 'databaseCtype', datctype) from pg_database where datname = '$verify_db';" > "$out"
  python3 - "$out" <<'PY'
import json
import sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for key in ("databaseEncoding", "databaseCollate", "databaseCtype"):
    value = data.get(key)
    if not isinstance(value, str) or not value or "\x00" in value or "\n" in value or "\r" in value or len(value) > 256:
        raise SystemExit(f"unsafe database property: {key}")
PY
}

compare_database_properties() {
  local source_props="$1"
  local verify_props="$2"
  python3 - "$source_props" "$verify_props" <<'PY'
import json
import sys
from pathlib import Path
source = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
verify = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
for key in ("databaseEncoding", "databaseCollate", "databaseCtype"):
    if source.get(key) != verify.get(key):
        raise SystemExit(f"database property mismatch: {key}")
PY
}

create_verify_database_from_dump() {
  local verify_db="$1"
  local dump="$2"
  local source_props="$3"
  local verify_props="$4"
  require_safe_verify_db "$verify_db"
  local db_encoding db_collate db_ctype
  db_encoding="$(read_database_property "$source_props" databaseEncoding)"
  db_collate="$(read_database_property "$source_props" databaseCollate)"
  db_ctype="$(read_database_property "$source_props" databaseCtype)"
  log "creating verification database name=$verify_db bytes=$(printf '%s' "$verify_db" | wc -c | tr -d ' ')"
  run_pg createdb --template=template0 --encoding="$db_encoding" --lc-collate="$db_collate" --lc-ctype="$db_ctype" "$verify_db"
  verify_database_created_exactly "$verify_db"
  collect_verify_database_properties "$verify_db" "$verify_props"
  compare_database_properties "$source_props" "$verify_props"
  run_pg pg_restore --no-owner --no-privileges --dbname="$verify_db" < "$dump"
}

drop_verify_database() {
  local verify_db="$1"
  require_safe_verify_db "$verify_db"
  run_pg dropdb --if-exists "$verify_db"
  local exists_status=0
  database_exists "$verify_db" || exists_status=$?
  case "$exists_status" in
    1) return 0 ;;
    0) log "verification database cleanup incomplete name=$verify_db"; return 1 ;;
    2) log "verification database cleanup query failed name=$verify_db"; return 2 ;;
    *) log "verification database cleanup query returned unexpected output name=$verify_db"; return 3 ;;
  esac
}

collect_database_metadata_from_restored_dump() {
  local verify_db="$1"
  local out="$2"
  require_safe_verify_db "$verify_db"
  run_pg psql --dbname="$verify_db" --no-align --tuples-only --set=ON_ERROR_STOP=1 <<'SQL' > "$out"
select jsonb_build_object(
  'databaseName', 'personal_web_shared_dev',
  'databaseEncoding', pg_encoding_to_char(encoding),
  'databaseCollate', datcollate,
  'databaseCtype', datctype,
  'alembicRevision', (select version_num from alembic_version limit 1),
  'tableCounts', (
    select jsonb_object_agg(table_name, row_count order by table_name)
    from (
      select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I', table_name), false, true, '')))[1]::text::bigint as row_count
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    ) counts
  ),
  'canvasMetadata', (
    select coalesce(jsonb_agg(jsonb_build_object('canvasKey', canvas_key, 'revision', revision, 'updatedAt', updated_at) order by canvas_key), '[]'::jsonb)
    from homepage_canvas_states
  )
)
from pg_database
where datname = current_database();
SQL
}

compute_canvas_fingerprint_from_restored_dump() {
  local verify_db="$1"
  local out="$2"
  require_safe_verify_db "$verify_db"
  python3 "$CANVAS_FINGERPRINT_HELPER" --database "$verify_db" > "$out"
  python3 - "$out" <<'PY'
import re
import sys
from pathlib import Path
value = Path(sys.argv[1]).read_text(encoding="utf-8").strip()
if not re.fullmatch(r"[0-9a-f]{64}", value):
    raise SystemExit("canvas fingerprint helper returned invalid output")
PY
}

reject_unsafe_media_entries() {
  find "$MEDIA_ROOT" \( -type l -o -type b -o -type c -o -type p -o -type s \) -print -quit |
    grep -q . && fail "unsafe media filesystem entry found"
}

collect_source_media_inventory() {
  local inventory="$1"
  local paths_file="$2"
  : > "$inventory"
  : > "$paths_file"
  (cd "$MEDIA_ROOT" && find . -type f -printf '%P\0' | sort -z) |
    while IFS= read -r -d '' relative_path; do
      [[ -n "$relative_path" ]] || continue
      python3 - "$relative_path" <<'PY' || fail "unsafe relative media path"
from pathlib import PurePosixPath
import sys
path = sys.argv[1]
pure = PurePosixPath(path)
if path.startswith("/") or "\\" in path or ":" in path or any(part in {"", ".", ".."} for part in pure.parts):
    raise SystemExit(1)
PY
      local file_path="$MEDIA_ROOT/$relative_path"
      local size sha
      size="$(stat --printf='%s' "$file_path")"
      sha="$(sha256sum "$file_path" | awk '{print $1}')"
      printf '%s\0' "$relative_path" >> "$paths_file"
      python3 - "$relative_path" "$size" "$sha" <<'PY' >> "$inventory"
import json
import sys
path, size, sha = sys.argv[1], int(sys.argv[2]), sys.argv[3]
print(json.dumps({"path": path, "size": size, "sha256": sha}, sort_keys=True))
PY
    done
}

create_media_archive_from_inventory() {
  local archive="$1"
  local paths_file="$2"
  (cd "$MEDIA_ROOT" && tar --null --verbatim-files-from --no-recursion --files-from="$paths_file" --create --gzip --file "$archive")
  [[ -s "$archive" ]] || fail "media archive missing or empty"
}

validate_and_extract_media_archive() {
  local archive="$1"
  local inventory="$2"
  local extract_dir="$3"
  python3 "$ARCHIVE_VERIFIER" --archive "$archive" --extract-dir "$extract_dir" --expect-inventory "$inventory" >/dev/null
}

write_manifest() {
  local manifest="$1"
  local backup_id="$2"
  local created_utc="$3"
  local completed_utc="$4"
  local source_props_file="$5"
  local verify_props_file="$6"
  local db_meta_file="$7"
  local canvas_fingerprint_file="$8"
  local inventory_file="$9"
  local dump_file="${10}"
  local archive_file="${11}"
  python3 - "$manifest" "$backup_id" "$created_utc" "$completed_utc" "$source_props_file" "$verify_props_file" "$db_meta_file" "$canvas_fingerprint_file" "$inventory_file" "$dump_file" "$archive_file" <<'PY'
import hashlib
import json
import socket
import sys
from pathlib import Path

manifest_path, backup_id, created_utc, completed_utc, source_props_path, verify_props_path, db_meta_path, canvas_fingerprint_path, inventory_path, dump_path, archive_path = sys.argv[1:]
source_props = json.loads(Path(source_props_path).read_text(encoding="utf-8"))
verify_props = json.loads(Path(verify_props_path).read_text(encoding="utf-8"))
db_meta = json.loads(Path(db_meta_path).read_text(encoding="utf-8"))
canvas_fingerprint = Path(canvas_fingerprint_path).read_text(encoding="utf-8").strip()
entries = [json.loads(line) for line in Path(inventory_path).read_text(encoding="utf-8").splitlines() if line.strip()]
entries.sort(key=lambda item: item["path"])
tree_fingerprint = hashlib.sha256(json.dumps(entries, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
for key in ("databaseEncoding", "databaseCollate", "databaseCtype"):
    if source_props.get(key) != verify_props.get(key) or source_props.get(key) != db_meta.get(key):
        raise SystemExit(f"database metadata mismatch: {key}")
def file_meta(path):
    data_path = Path(path)
    digest = hashlib.sha256()
    with data_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return {"filename": data_path.name, "size": data_path.stat().st_size, "sha256": digest.hexdigest()}
manifest = {
    "schemaVersion": 1,
    "backupId": backup_id,
    "createdAtUtc": created_utc,
    "completedAtUtc": completed_utc,
    "sourceHostname": socket.gethostname(),
    "databaseName": "personal_web_shared_dev",
    "databaseEncoding": source_props.get("databaseEncoding"),
    "databaseCollate": source_props.get("databaseCollate"),
    "databaseCtype": source_props.get("databaseCtype"),
    "sourceDatabaseProperties": source_props,
    "verifiedDatabaseProperties": verify_props,
    "alembicRevision": db_meta.get("alembicRevision"),
    "tableCounts": db_meta.get("tableCounts") or {},
    "canvasMetadata": db_meta.get("canvasMetadata") or [],
    "canvasFingerprint": canvas_fingerprint,
    "databaseDump": file_meta(dump_path),
    "mediaArchive": file_meta(archive_path),
    "sourceMediaRoot": "/srv/personal-web/shared-dev/homepage",
    "sourceMediaRegularFileCount": len(entries),
    "sourceMediaLogicalBytes": sum(int(item["size"]) for item in entries),
    "sourceMediaTreeFingerprint": tree_fingerprint,
    "toolVersion": "shared-remote-backup-v1",
    "verification": {
        "ok": True,
        "metadataSource": "restored_dump",
        "mediaSource": "verified_archive",
        "databasePropertiesMatched": True,
    },
}
if manifest["alembicRevision"] != "20260712_0006":
    raise SystemExit("unexpected alembic revision")
if not manifest["canvasFingerprint"]:
    raise SystemExit("missing canvas fingerprint")
Path(manifest_path).write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8")
PY
}

verify_completed_backup() {
  local backup_dir="$1"
  require_root_dir_0700 "$backup_dir"
  require_exact_file_set "$backup_dir"
  for file in "${REQUIRED_FILES[@]}"; do
    require_regular_root_file_0600 "$backup_dir/$file"
  done
  local expected
  expected="$(printf '%s\n' "${HASHED_FILES[@]}" | sort)"
  local actual
  actual="$(awk '{print $2}' "$backup_dir/SHA256SUMS" | sort)"
  [[ "$actual" == "$expected" ]] || fail "SHA256SUMS file set mismatch"
  (cd "$backup_dir" && sha256sum --check SHA256SUMS >/dev/null)
  run_pg pg_restore --list < "$backup_dir/personal_web_shared_dev.dump" >/dev/null
  local archive_verify_dir
  archive_verify_dir="$(mktemp -d "/tmp/personal-web-backup-final-media-verify.$(basename "$backup_dir").XXXXXX")"
  python3 "$ARCHIVE_VERIFIER" \
    --archive "$backup_dir/homepage-media.tar.gz" \
    --extract-dir "$archive_verify_dir" \
    --expect-manifest "$backup_dir/manifest.json" >/dev/null
  python3 - "$backup_dir" <<'PY'
import hashlib
import json
from pathlib import Path

backup_dir = Path(__import__("sys").argv[1])
manifest = json.loads((backup_dir / "manifest.json").read_text(encoding="utf-8"))
if manifest.get("backupId") != backup_dir.name.removesuffix(".partial"):
    raise SystemExit("manifest backup id mismatch")
if manifest.get("databaseName") != "personal_web_shared_dev":
    raise SystemExit("manifest database mismatch")
if manifest.get("sourceMediaRoot") != "/srv/personal-web/shared-dev/homepage":
    raise SystemExit("manifest media root mismatch")
for filename, key in [("personal_web_shared_dev.dump", "databaseDump"), ("homepage-media.tar.gz", "mediaArchive")]:
    path = backup_dir / filename
    meta = manifest.get(key) or {}
    if meta.get("filename") != filename or int(meta.get("size", -1)) != path.stat().st_size:
        raise SystemExit("manifest file metadata mismatch")
    if meta.get("sha256") != hashlib.sha256(path.read_bytes()).hexdigest():
        raise SystemExit("manifest file hash mismatch")
PY
}

cleanup_backup_run() {
  local original_status="$1"
  local cleanup_status=0
  set +e
  if [[ -n "${verify_db:-}" ]]; then
    drop_verify_database "$verify_db" >/dev/null 2>&1 || cleanup_status=1
    local exists_status=0
    database_exists "$verify_db" >/dev/null 2>&1 || exists_status=$?
    case "$exists_status" in
      1) ;;
      0)
        log "cleanup incomplete: temporary database remains name=$verify_db"
        cleanup_status=1
        ;;
      2|3)
        log "cleanup incomplete: temporary database query failed name=$verify_db"
        cleanup_status=1
        ;;
      *)
        log "cleanup incomplete: temporary database query returned unexpected status name=$verify_db"
        cleanup_status=1
        ;;
    esac
  fi
  if [[ -n "${verify_extract:-}" ]]; then
    case "$verify_extract" in /tmp/personal-web-backup-media-verify.*) rm -rf --one-file-system "$verify_extract" >/dev/null 2>&1 || cleanup_status=1 ;; *) cleanup_status=1 ;; esac
    [[ -e "$verify_extract" ]] && { log "cleanup incomplete: verification extraction directory remains path=$verify_extract"; cleanup_status=1; }
  fi
  if [[ -n "${partial_dir:-}" ]]; then
    case "$partial_dir" in "$BACKUP_ROOT"/*.partial) rm -rf --one-file-system "$partial_dir" >/dev/null 2>&1 || cleanup_status=1 ;; *) cleanup_status=1 ;; esac
    [[ -e "$partial_dir" ]] && { log "cleanup incomplete: partial backup directory remains path=$partial_dir"; cleanup_status=1; }
  fi
  if [[ "$cleanup_status" -ne 0 ]]; then
    log "cleanup failed original_status=$original_status"
    exit 1
  fi
  if [[ "$original_status" -ne 0 ]]; then
    log "cleanup completed after failure original_status=$original_status"
    exit "$original_status"
  fi
}

is_verified_completed_backup_dir() {
  local dir="$1"
  [[ -d "$dir" && ! -L "$dir" ]] || return 1
  [[ "$(basename "$dir")" =~ ^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}$ ]] || return 1
  require_direct_child "$dir" || return 1
  require_root_dir_0700 "$dir" || return 1
  verify_completed_backup "$dir" || return 1
}

apply_retention() {
  mapfile -t candidates < <(
    find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
      -regex ".*/[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}" | sort
  )
  local successful=()
  for candidate in "${candidates[@]}"; do
    if is_verified_completed_backup_dir "$candidate"; then
      successful+=("$candidate")
    fi
  done
  local count="${#successful[@]}"
  if (( count > KEEP_SUCCESSFUL )); then
    local delete_count=$((count - KEEP_SUCCESSFUL))
    for ((i = 0; i < delete_count; i++)); do
      [[ "${successful[$i]}" != "${successful[$count - 1]}" ]] || continue
      rm -rf --one-file-system "${successful[$i]}"
    done
  fi
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
    -regex ".*/[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}\\.partial" \
    -mtime +"$PARTIAL_RETENTION_DAYS" -print0 |
    while IFS= read -r -d '' partial; do
      require_direct_child "$partial"
      [[ -d "$partial" && ! -L "$partial" ]] || continue
      [[ "$(stat -c '%U:%G:%a' "$partial")" == "root:root:700" ]] || continue
      rm -rf --one-file-system "$partial"
    done
}

main() {
  exec 9>"$LOCK_FILE"
  flock -n 9 || { log "another backup run is already active"; exit 0; }
  [[ -d "$BACKUP_ROOT" ]] || fail "backup root must be installed before service start"
  require_root_dir_0700 "$BACKUP_ROOT"
  require_shared_sources
  local created_utc backup_id suffix partial_dir completed_dir verify_db verify_extract
  local source_db_props verify_db_props db_meta canvas_fingerprint inventory paths_file dump archive manifest
  created_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  suffix="$(random_suffix)"
  backup_id="$(date -u +%Y%m%dT%H%M%SZ)-$suffix"
  require_safe_backup_id "$backup_id"
  verify_db="pw_bk_v_$(date -u +%Y%m%dT%H%M%SZ)_$suffix"
  require_safe_verify_db "$verify_db"
  verify_extract="$(mktemp -d "/tmp/personal-web-backup-media-verify.${backup_id}.XXXXXX")"
  partial_dir="$BACKUP_ROOT/$backup_id.partial"
  completed_dir="$BACKUP_ROOT/$backup_id"
  require_direct_child "$partial_dir"
  require_direct_child "$completed_dir"
  install -d -m 0700 -o root -g root "$partial_dir"
  source_db_props="$partial_dir/source-database-properties.json"
  verify_db_props="$partial_dir/verify-database-properties.json"
  db_meta="$partial_dir/database-metadata.json"
  canvas_fingerprint="$partial_dir/canvas-fingerprint.txt"
  inventory="$partial_dir/media-inventory.jsonl"
  paths_file="$partial_dir/media-paths.nul"
  dump="$partial_dir/personal_web_shared_dev.dump"
  archive="$partial_dir/homepage-media.tar.gz"
  manifest="$partial_dir/manifest.json"
  trap 'status=$?; cleanup_backup_run "$status"' EXIT
  collect_source_database_properties "$source_db_props"
  create_dump_from_source "$dump"
  create_verify_database_from_dump "$verify_db" "$dump" "$source_db_props" "$verify_db_props"
  collect_database_metadata_from_restored_dump "$verify_db" "$db_meta"
  compute_canvas_fingerprint_from_restored_dump "$verify_db" "$canvas_fingerprint"
  drop_verify_database "$verify_db" || fail "verification database cleanup incomplete"
  reject_unsafe_media_entries
  collect_source_media_inventory "$inventory" "$paths_file"
  create_media_archive_from_inventory "$archive" "$paths_file"
  validate_and_extract_media_archive "$archive" "$inventory" "$verify_extract"
  local completed_utc
  completed_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  write_manifest "$manifest" "$backup_id" "$created_utc" "$completed_utc" "$source_db_props" "$verify_db_props" "$db_meta" "$canvas_fingerprint" "$inventory" "$dump" "$archive"
  rm -f "$source_db_props" "$verify_db_props" "$db_meta" "$canvas_fingerprint" "$inventory" "$paths_file"
  (cd "$partial_dir" && sha256sum "${HASHED_FILES[@]}" > SHA256SUMS)
  touch "$partial_dir/SUCCESS"
  chmod 0600 "$dump" "$archive" "$manifest" "$partial_dir/SHA256SUMS" "$partial_dir/SUCCESS"
  chown root:root "$dump" "$archive" "$manifest" "$partial_dir/SHA256SUMS" "$partial_dir/SUCCESS"
  verify_completed_backup "$partial_dir"
  mv "$partial_dir" "$completed_dir"
  chmod 0700 "$completed_dir"
  verify_completed_backup "$completed_dir"
  trap - EXIT
  apply_retention
  log "backup completed: $backup_id"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
