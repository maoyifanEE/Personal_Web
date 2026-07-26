#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_ROOT="/var/backups/personal-web/shared-dev"

fail() {
  printf '[personal-web shared backup verify] ERROR: %s\n' "$1" >&2
  exit 1
}

backup_id="${1:-}"
[[ "$backup_id" =~ ^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}$ ]] || fail "unsafe backup id"
backup_dir="$BACKUP_ROOT/$backup_id"
case "$backup_dir" in "$BACKUP_ROOT"/*) ;; *) fail "backup path escaped root" ;; esac
[[ -d "$backup_dir" ]] || fail "backup directory missing"
[[ -f "$backup_dir/SUCCESS" ]] || fail "SUCCESS marker is missing"
[[ "$(stat -c '%U' "$backup_dir")" == "root" ]] || fail "backup directory owner is not root"
[[ "$(stat -c '%a' "$BACKUP_ROOT")" == "700" ]] || fail "backup root mode is not 0700"
[[ "$(stat -c '%a' "$backup_dir")" == "700" ]] || fail "backup directory mode is not 0700"

for file in personal_web_shared_dev.dump homepage-media.tar.gz manifest.json SHA256SUMS; do
  [[ -f "$backup_dir/$file" ]] || fail "$file missing"
done

(cd "$backup_dir" && sha256sum --check SHA256SUMS >/dev/null)
pg_restore --list "$backup_dir/personal_web_shared_dev.dump" >/dev/null
tar -tzf "$backup_dir/homepage-media.tar.gz" |
  awk 'BEGIN{ok=1} /^\\// || /(^|\\/)\\.\\.($|\\/)/ {ok=0} END{exit ok ? 0 : 1}' ||
  fail "media archive contains unsafe paths"

python3 - "$backup_dir/manifest.json" <<'PY'
import json
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if manifest.get("schemaVersion") != 1:
    raise SystemExit("bad manifest schema")
if manifest.get("databaseName") != "personal_web_shared_dev":
    raise SystemExit("bad database name")
if manifest.get("sourceMediaRoot") != "/srv/personal-web/shared-dev/homepage":
    raise SystemExit("bad media root")
if manifest.get("alembicRevision") != "20260712_0006":
    raise SystemExit("bad alembic revision")
if not manifest.get("verification", {}).get("ok"):
    raise SystemExit("backup was not verified")
for forbidden in ("password", "token", "secret", "databaseUrl", "canvasJson", "visitorMessage", "auditPayload"):
    if forbidden.lower() in json.dumps(manifest).lower():
        raise SystemExit("manifest contains unsafe metadata")
PY

printf '[personal-web shared backup verify] OK: %s\n' "$backup_id"
