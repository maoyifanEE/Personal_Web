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

log() {
  printf '[personal-web shared backup] %s\n' "$1" >&2
}

fail() {
  log "ERROR: $1"
  exit 1
}

require_safe_backup_id() {
  local backup_id="$1"
  [[ "$backup_id" =~ ^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}$ ]] || fail "unsafe backup id"
}

require_direct_child() {
  local path="$1"
  case "$path" in
    "$BACKUP_ROOT"/*) ;;
    *) fail "backup path escaped root" ;;
  esac
  [[ "${path#"$BACKUP_ROOT"/}" != *"/"* ]] || fail "backup path is not a direct child"
}

require_shared_sources() {
  [[ "$DATABASE_NAME" == "personal_web_shared_dev" ]] || fail "unexpected database name"
  [[ "$DATABASE_NAME" != *prod* ]] || fail "production database rejected"
  [[ "$MEDIA_ROOT" == "/srv/personal-web/shared-dev/homepage" ]] || fail "unexpected media root"
  [[ -d "$MEDIA_ROOT" ]] || fail "media root missing"
  psql --dbname=postgres --tuples-only --no-align \
    --command "select datname from pg_database where datname = 'personal_web_shared_dev'" |
    grep -qx "personal_web_shared_dev" || fail "source database missing"
}

collect_database_metadata() {
  local out="$1"
  psql --dbname="$DATABASE_NAME" --no-align --tuples-only --set=ON_ERROR_STOP=1 <<'SQL' > "$out"
select jsonb_build_object(
  'databaseName', current_database(),
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
  ),
  'canvasFingerprint', (
    select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by to_jsonb(t)::text), ''))
    from homepage_canvas_states t
  )
)
from pg_database
where datname = current_database();
SQL
}

reject_unsafe_media_entries() {
  find "$MEDIA_ROOT" \( -type l -o -type b -o -type c -o -type p -o -type s \) -print -quit |
    grep -q . && fail "unsafe media filesystem entry found"
}

collect_media_inventory() {
  local inventory="$1"
  (cd "$MEDIA_ROOT" && find . -type f -printf '%P\0' | sort -z) |
    while IFS= read -r -d '' relative_path; do
      [[ -n "$relative_path" ]] || continue
      [[ "$relative_path" != /* && "$relative_path" != *".."* ]] || fail "unsafe relative media path"
      local file_path="$MEDIA_ROOT/$relative_path"
      local size sha
      size="$(stat --printf='%s' "$file_path")"
      sha="$(sha256sum "$file_path" | awk '{print $1}')"
      python3 - "$relative_path" "$size" "$sha" <<'PY' >> "$inventory"
import json
import sys
path, size, sha = sys.argv[1], int(sys.argv[2]), sys.argv[3]
print(json.dumps({"path": path, "size": size, "sha256": sha}, sort_keys=True))
PY
    done
}

create_media_archive() {
  local archive="$1"
  (cd "$MEDIA_ROOT" && find . -type f -printf '%P\0' | sort -z | tar --null --files-from=- --create --gzip --file "$archive")
  tar -tzf "$archive" >/dev/null
}

write_manifest() {
  local manifest="$1"
  local backup_id="$2"
  local created_utc="$3"
  local completed_utc="$4"
  local db_meta_file="$5"
  local inventory_file="$6"
  local dump_file="$7"
  local archive_file="$8"
  python3 - "$manifest" "$backup_id" "$created_utc" "$completed_utc" "$db_meta_file" "$inventory_file" "$dump_file" "$archive_file" <<'PY'
import hashlib
import json
import socket
import sys
from pathlib import Path

manifest_path, backup_id, created_utc, completed_utc, db_meta_path, inventory_path, dump_path, archive_path = sys.argv[1:]
db_meta = json.loads(Path(db_meta_path).read_text(encoding="utf-8"))
entries = [json.loads(line) for line in Path(inventory_path).read_text(encoding="utf-8").splitlines() if line.strip()]
entries.sort(key=lambda item: item["path"])
tree_fingerprint = hashlib.sha256(json.dumps(entries, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
def file_meta(path):
    data_path = Path(path)
    return {"filename": data_path.name, "size": data_path.stat().st_size, "sha256": hashlib.sha256(data_path.read_bytes()).hexdigest()}
manifest = {
    "schemaVersion": 1,
    "backupId": backup_id,
    "createdAtUtc": created_utc,
    "completedAtUtc": completed_utc,
    "sourceHostname": socket.gethostname(),
    "databaseName": "personal_web_shared_dev",
    "databaseEncoding": db_meta.get("databaseEncoding"),
    "databaseCollate": db_meta.get("databaseCollate"),
    "databaseCtype": db_meta.get("databaseCtype"),
    "alembicRevision": db_meta.get("alembicRevision"),
    "tableCounts": db_meta.get("tableCounts") or {},
    "canvasMetadata": db_meta.get("canvasMetadata") or [],
    "canvasFingerprint": db_meta.get("canvasFingerprint"),
    "databaseDump": file_meta(dump_path),
    "mediaArchive": file_meta(archive_path),
    "sourceMediaRoot": "/srv/personal-web/shared-dev/homepage",
    "sourceMediaRegularFileCount": len(entries),
    "sourceMediaLogicalBytes": sum(int(item["size"]) for item in entries),
    "sourceMediaTreeFingerprint": tree_fingerprint,
    "toolVersion": "shared-remote-backup-v1",
    "verification": {"ok": True},
}
if manifest["alembicRevision"] != "20260712_0006":
    raise SystemExit("unexpected alembic revision")
Path(manifest_path).write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8")
PY
}

verify_completed_backup() {
  local backup_dir="$1"
  test -s "$backup_dir/personal_web_shared_dev.dump" || fail "dump missing or empty"
  test -s "$backup_dir/homepage-media.tar.gz" || fail "media archive missing or empty"
  pg_restore --list "$backup_dir/personal_web_shared_dev.dump" >/dev/null
  tar -tzf "$backup_dir/homepage-media.tar.gz" | awk 'BEGIN{ok=1} /^\\// || /(^|\\/)\\.\\.($|\\/)/ {ok=0} END{exit ok ? 0 : 1}' ||
    fail "unsafe path in media archive"
  (cd "$backup_dir" && sha256sum --check SHA256SUMS >/dev/null)
}

apply_retention() {
  mapfile -t successful < <(
    find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
      -regex ".*/[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}" \
      -exec test -f '{}/SUCCESS' ';' -print | sort
  )
  local count="${#successful[@]}"
  if (( count > KEEP_SUCCESSFUL )); then
    local delete_count=$((count - KEEP_SUCCESSFUL))
    for ((i = 0; i < delete_count; i++)); do
      require_direct_child "${successful[$i]}"
      rm -rf --one-file-system "${successful[$i]}"
    done
  fi
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '*.partial' -mtime +"$PARTIAL_RETENTION_DAYS" -print0 |
    while IFS= read -r -d '' partial; do
      require_direct_child "$partial"
      [[ "$(stat -c '%U' "$partial")" == "root" ]] || continue
      rm -rf --one-file-system "$partial"
    done
}

main() {
  exec 9>"$LOCK_FILE"
  flock -n 9 || { log "another backup run is already active"; exit 0; }
  require_shared_sources
  install -d -m 0700 -o root -g root "$BACKUP_ROOT"
  local created_utc backup_id partial_dir completed_dir db_meta inventory dump archive manifest
  created_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  backup_id="$(date -u +%Y%m%dT%H%M%SZ)-$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 10)"
  require_safe_backup_id "$backup_id"
  partial_dir="$BACKUP_ROOT/$backup_id.partial"
  completed_dir="$BACKUP_ROOT/$backup_id"
  require_direct_child "$partial_dir"
  require_direct_child "$completed_dir"
  install -d -m 0700 -o root -g root "$partial_dir"
  db_meta="$partial_dir/database-metadata.json"
  inventory="$partial_dir/media-inventory.jsonl"
  dump="$partial_dir/personal_web_shared_dev.dump"
  archive="$partial_dir/homepage-media.tar.gz"
  manifest="$partial_dir/manifest.json"
  pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_NAME" --file="$dump"
  collect_database_metadata "$db_meta"
  reject_unsafe_media_entries
  collect_media_inventory "$inventory"
  create_media_archive "$archive"
  local completed_utc
  completed_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  write_manifest "$manifest" "$backup_id" "$created_utc" "$completed_utc" "$db_meta" "$inventory" "$dump" "$archive"
  (cd "$partial_dir" && sha256sum personal_web_shared_dev.dump homepage-media.tar.gz manifest.json > SHA256SUMS)
  chmod 0600 "$dump" "$archive" "$manifest" "$partial_dir/SHA256SUMS"
  rm -f "$db_meta" "$inventory"
  verify_completed_backup "$partial_dir"
  touch "$partial_dir/SUCCESS"
  chmod 0600 "$partial_dir/SUCCESS"
  mv "$partial_dir" "$completed_dir"
  chmod 0700 "$completed_dir"
  apply_retention
  log "backup completed: $backup_id"
}

main "$@"
