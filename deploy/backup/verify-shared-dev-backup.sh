#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_ROOT="/var/backups/personal-web/shared-dev"
REQUIRED_FILES=(personal_web_shared_dev.dump homepage-media.tar.gz manifest.json SHA256SUMS SUCCESS)
HASHED_FILES=(personal_web_shared_dev.dump homepage-media.tar.gz manifest.json)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE_VERIFIER="$SCRIPT_DIR/verify-shared-media-archive.py"

fail() {
  printf '[personal-web shared backup verify] ERROR: %s\n' "$1" >&2
  exit 1
}

run_pg() {
  runuser --user postgres -- "$@"
}

require_regular_root_file_0600() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || fail "required file is missing or unsafe"
  [[ "$(stat -c '%U:%G:%a' "$path")" == "root:root:600" ]] || fail "file owner or mode is unsafe"
}

backup_id="${1:-}"
[[ "$backup_id" =~ ^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}$ ]] || fail "unsafe backup id"
backup_dir="$BACKUP_ROOT/$backup_id"
case "$backup_dir" in "$BACKUP_ROOT"/*) ;; *) fail "backup path escaped root" ;; esac
[[ -d "$backup_dir" && ! -L "$backup_dir" ]] || fail "backup directory missing or unsafe"
[[ -f "$backup_dir/SUCCESS" ]] || fail "SUCCESS marker is missing"
[[ "$(stat -c '%U:%G:%a' "$BACKUP_ROOT")" == "root:root:700" ]] || fail "backup root owner or mode is unsafe"
[[ "$(stat -c '%U:%G:%a' "$backup_dir")" == "root:root:700" ]] || fail "backup directory owner or mode is unsafe"

python3 - "$backup_dir" <<'PY' || fail "backup file set mismatch"
from pathlib import Path
import sys
required = {"personal_web_shared_dev.dump", "homepage-media.tar.gz", "manifest.json", "SHA256SUMS", "SUCCESS"}
actual = {entry.name for entry in Path(sys.argv[1]).iterdir()}
if actual != required:
    raise SystemExit(1)
PY
for file in "${REQUIRED_FILES[@]}"; do
  require_regular_root_file_0600 "$backup_dir/$file"
done

hashed_actual="$(awk '{print $2}' "$backup_dir/SHA256SUMS" | sort)"
hashed_expected="$(printf '%s\n' "${HASHED_FILES[@]}" | sort)"
[[ "$hashed_actual" == "$hashed_expected" ]] || fail "SHA256SUMS file set mismatch"
(cd "$backup_dir" && sha256sum --check SHA256SUMS >/dev/null)
run_pg pg_restore --list < "$backup_dir/personal_web_shared_dev.dump" >/dev/null
archive_verify_dir="$(mktemp -d "/tmp/personal-web-backup-standalone-media-verify.${backup_id}.XXXXXX")"
python3 "$ARCHIVE_VERIFIER" \
  --archive "$backup_dir/homepage-media.tar.gz" \
  --extract-dir "$archive_verify_dir" \
  --expect-manifest "$backup_dir/manifest.json" >/dev/null

python3 - "$backup_dir" "$backup_id" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

backup_dir = Path(sys.argv[1])
backup_id = sys.argv[2]
manifest = json.loads((backup_dir / "manifest.json").read_text(encoding="utf-8"))
if manifest.get("schemaVersion") != 1:
    raise SystemExit("bad manifest schema")
if manifest.get("backupId") != backup_id:
    raise SystemExit("manifest backup id mismatch")
if manifest.get("databaseName") != "personal_web_shared_dev":
    raise SystemExit("bad database name")
if manifest.get("sourceMediaRoot") != "/srv/personal-web/shared-dev/homepage":
    raise SystemExit("bad media root")
if manifest.get("alembicRevision") != "20260712_0006":
    raise SystemExit("bad alembic revision")
if not manifest.get("verification", {}).get("ok"):
    raise SystemExit("backup was not verified")
if not manifest.get("canvasFingerprint") or not isinstance(manifest.get("tableCounts"), dict):
    raise SystemExit("manifest missing required restored metadata")
sums = {}
for line in (backup_dir / "SHA256SUMS").read_text(encoding="utf-8").splitlines():
    digest, filename = line.split("  ", 1)
    sums[filename] = digest
for filename, key in [("personal_web_shared_dev.dump", "databaseDump"), ("homepage-media.tar.gz", "mediaArchive")]:
    path = backup_dir / filename
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    meta = manifest.get(key) or {}
    if meta.get("filename") != filename:
        raise SystemExit("manifest filename mismatch")
    if int(meta.get("size", -1)) != path.stat().st_size:
        raise SystemExit("manifest size mismatch")
    if meta.get("sha256") != digest or sums.get(filename) != digest:
        raise SystemExit("manifest/SHA256SUMS hash mismatch")
if sums.get("manifest.json") != hashlib.sha256((backup_dir / "manifest.json").read_bytes()).hexdigest():
    raise SystemExit("manifest SHA256SUMS mismatch")
for forbidden in ("password", "token", "databaseUrl", "canvasJson", "visitorMessage", "auditPayload"):
    if forbidden.lower() in json.dumps(manifest).lower():
        raise SystemExit("manifest contains unsafe metadata")
PY

printf '[personal-web shared backup verify] OK: %s\n' "$backup_id"
