#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_ROOT="/var/backups/personal-web/shared-dev"
EXPECTED_ALEMBIC_REVISION="20260712_0006"

fail() {
  printf '[personal-web restore verify] ERROR: %s\n' "$1" >&2
  exit 1
}

backup_id="${1:-}"
[[ "$backup_id" =~ ^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}$ ]] || fail "unsafe backup id"
backup_dir="$BACKUP_ROOT/$backup_id"
restore_db="personal_web_shared_dev_restore_verify_$(date -u +%Y%m%dT%H%M%SZ)"
restore_media_dir="$(mktemp -d "/tmp/personal-web-shared-media-restore-verify.XXXXXX")"
cleanup_ok=0

cleanup() {
  set +e
  dropdb --if-exists "$restore_db" >/dev/null 2>&1
  rm -rf --one-file-system "$restore_media_dir" >/dev/null 2>&1
  [[ "$cleanup_ok" -eq 1 ]] || printf '[personal-web restore verify] cleanup incomplete or verification failed\n' >&2
}
trap cleanup EXIT

[[ "$restore_db" =~ ^personal_web_shared_dev_restore_verify_[0-9]{8}T[0-9]{6}Z$ ]] || fail "restore database name is not temporary"
[[ "$restore_db" != "personal_web_shared_dev" && "$restore_db" != "personal_web_prod" ]] || fail "authoritative database target rejected"
[[ -f "$backup_dir/SUCCESS" ]] || fail "SUCCESS marker is missing"
(cd "$backup_dir" && sha256sum --check SHA256SUMS >/dev/null)
createdb "$restore_db"
pg_restore --no-owner --no-privileges --dbname="$restore_db" "$backup_dir/personal_web_shared_dev.dump"
revision="$(psql --dbname="$restore_db" --tuples-only --no-align --command 'select version_num from alembic_version limit 1')"
[[ "$revision" == "$EXPECTED_ALEMBIC_REVISION" ]] || fail "restore Alembic revision mismatch"
tar -xzf "$backup_dir/homepage-media.tar.gz" -C "$restore_media_dir"

python3 - "$backup_dir/manifest.json" "$restore_media_dir" "$restore_db" <<'PY'
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

manifest_path, media_root, restore_db = sys.argv[1:]
manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
if restore_db in {"personal_web_shared_dev", "personal_web_prod"}:
    raise SystemExit("restore target is authoritative")
counts = {}
tables = subprocess.check_output([
    "psql", "--dbname", restore_db, "--tuples-only", "--no-align",
    "--command", "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name",
], text=True).splitlines()
for table in tables:
    count = subprocess.check_output(["psql", "--dbname", restore_db, "--tuples-only", "--no-align", "--command", f'select count(*) from "{table}"'], text=True).strip()
    counts[table] = int(count)
if counts != manifest.get("tableCounts"):
    raise SystemExit("table count mismatch")
files = []
root = Path(media_root)
for path in sorted(root.rglob("*")):
    if path.is_symlink() or not path.is_file():
        continue
    rel = path.relative_to(root).as_posix()
    data = path.read_bytes()
    files.append({"path": rel, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
fingerprint = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
if len(files) != manifest.get("sourceMediaRegularFileCount"):
    raise SystemExit("media file count mismatch")
if sum(item["size"] for item in files) != manifest.get("sourceMediaLogicalBytes"):
    raise SystemExit("media logical bytes mismatch")
if fingerprint != manifest.get("sourceMediaTreeFingerprint"):
    raise SystemExit("media fingerprint mismatch")
PY

cleanup_ok=1
printf '[personal-web restore verify] OK: %s\n' "$backup_id"
