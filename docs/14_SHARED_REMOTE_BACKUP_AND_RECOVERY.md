# Shared Remote Backup And Recovery

## Scope

`personal_web_shared_dev` is the authoritative development database for the
shared-remote profile. The authoritative shared media root is:

```text
/srv/personal-web/shared-dev/homepage
```

The old Windows-local PostgreSQL database is not synchronized, is not a backup
source, and must not be treated as authoritative for shared-development data.

Production is excluded. These tools must not back up or restore
`personal_web_prod`, production media, public deployment files, Nginx, systemd,
DNS, or TLS configuration. Code pushed to `main` is still not deployment, and
public publishing remains a separate explicit promotion from shared development
to production.

## Two Backup Layers

Layer A is a manual server-side snapshot stored under:

```text
/var/backups/personal-web/shared-dev
```

Each completed snapshot directory is named:

```text
YYYYMMDDTHHMMSSZ-<random-suffix>
```

The backup ID random suffix is generated with Python `secrets.token_hex(8)`,
giving 64 bits of randomness as exactly 16 lowercase hexadecimal characters.
It is not generated with a `tr | head` pipeline.

Each completed snapshot contains:

```text
personal_web_shared_dev.dump
homepage-media.tar.gz
manifest.json
SHA256SUMS
SUCCESS
```

`SUCCESS` is the final marker. A directory without `SUCCESS` is not a valid
backup. In-progress directories use a `.partial` suffix and are atomically
renamed after verification.

Layer B is a protected copy on the old Windows computer under:

```text
%USERPROFILE%\.personal_web\backups\shared-dev
```

Tracked code derives `%USERPROFILE%` at runtime and does not commit
user-specific absolute paths. The local copy is pulled only from verified
server-side backups after an explicit user command and keeps the newest 7
verified snapshots.

## Permissions

The server backup root and completed snapshot directories are root-owned and
mode `0700`. Backup files are mode `0600`.

Because the systemd service uses `ProtectSystem=strict`, installation must
create the backup root before manually starting the service:

```text
install -d -m 0700 -o root -g root /var/backups/personal-web/shared-dev
```

The systemd unit intentionally does not use `ConditionPathExists` or
`ConditionPathIsDirectory` for the required backup/media paths. Missing or
unsafe paths must run the script, fail visibly with a nonzero service result,
and leave no `SUCCESS` marker. The script itself validates that the backup root
exists as `root:root` `0700` and that the media root exists as the exact
shared-development media directory.

The old-computer backup root disables inherited ACLs and allows only the current
Windows user, SYSTEM, and local Administrators.

Backups, dumps, archives, manifests, logs, and local pulled copies must never be
committed to GitHub.

## Server Backup

The server template is:

```text
deploy/backup/create-shared-dev-backup.sh
```

It uses server-local PostgreSQL tools through the PostgreSQL administration OS
identity:

```text
runuser --user postgres -- <postgres-command>
```

The service process remains root-owned so the root shell can open `0600` backup
files while PostgreSQL commands run as `postgres`. It never assumes a database
role named `root`, never puts a database password on a command line, never uses
the application password, and never modifies `pg_hba.conf`.

The database dump is custom format, equivalent to:

```text
pg_dump --format=custom --no-owner --no-privileges --dbname=personal_web_shared_dev
```

Before creating the dump-verification database, the script queries only safe
database-level properties from `personal_web_shared_dev`: encoding,
`datcollate`, and `datctype`. It creates the temporary database with
`template0` and passes the source encoding, `LC_COLLATE`, and `LC_CTYPE` as
separate `createdb` arguments, never through `eval` or shell-fragment
concatenation. After creation it reads the temporary database properties back
and requires them to match before restoring the dump.

After creating the dump, the script restores it into a unique temporary
verification database named:

```text
pw_bk_v_<YYYYMMDDTHHMMSSZ>_<32-lowercase-hex>
```

That name is exactly 57 ASCII bytes, below PostgreSQL's default 63-byte
identifier limit (`NAMEDATALEN - 1`), and includes 128 bits of randomness from
`secrets.token_hex(16)`. The script validates the byte length before
`createdb`, logs only the safe temporary name and byte length, and then queries
`pg_database.datname` to require an exact byte-for-byte read-back before any
`pg_restore`. PostgreSQL truncation, zero rows, multiple/unexpected rows, or a
query failure is a hard failure.

Alembic revision, table counts, canvas metadata, canvas revision, and sanitized
canvas fingerprint are calculated from that restored dump, not from a later live
source query. `SUCCESS` is refused if restore, verification, database-property
matching, exact temporary-name read-back, or cleanup fails.

Canvas fingerprinting is centralized in:

```text
deploy/backup/compute-shared-canvas-fingerprint.py
```

The helper accepts only strictly named compact temporary backup/restore
verification databases (`pw_bk_v_...` or `pw_rs_v_...`), enforces the 63-byte
PostgreSQL identifier limit before invoking `psql`, executes PostgreSQL through
`runuser --user postgres -- psql`, and prints only a SHA-256 fingerprint. For
each canvas row it includes
`canvas_key`, `schema_version`, `revision`, `updated_at`, and canonicalized
`canvas_data`. `canvas_data` JSON is parsed, serialized with sorted object keys
and compact separators while preserving array order, then included in an
ordered canonical record array sorted by `canvas_key`. Raw canvas JSON is not
written to the manifest and is not printed to logs.

Legacy failed-run patterns such as
`personal_web_shared_dev_backup_verify_%` and
`personal_web_shared_dev_restore_verify_%` are inspection-only residual search
patterns for follow-up operations. They are not valid creation targets.

The script rejects production names, does not expose PostgreSQL publicly, and
does not run migrations or seed scripts.

The media archive is created from exactly:

```text
/srv/personal-web/shared-dev/homepage
```

The script rejects source symlinks, device files, FIFOs, sockets, absolute
archive paths, and traversal paths. It builds the archive from an exact sorted
NUL-delimited inventory path list with GNU tar `--null`,
`--verbatim-files-from`, and `--no-recursion`, so leading-dash filenames and
filenames containing whitespace or newlines are treated only as filenames.
Media logical bytes are the sum of regular file byte lengths, not filesystem
allocation size.

The backup service logs fixed stage boundaries in the form
`stage_start id=<stage> name=<name>`, `stage_ok id=<stage> name=<name>`, and
`stage_error id=<stage> ... exit=<code> command_category=<category>`. The stage
IDs are stable from `B01_PRECHECK` through `B15_RETENTION`. Error logs include
only the stage, source basename, line, function, exit code, and sanitized command
category; they do not print full command lines, environment variables,
connection strings, canvas JSON, row contents, or media contents.

The dump restore stage uses `pg_restore --exit-on-error --no-owner
--no-privileges` against the temporary verification database. A failed restore
is reported at `B05_DATABASE_RESTORE`.

The media unsafe-entry scan treats "no unsafe entries found" as success only
when the filesystem scan itself completed successfully. A failed scan is
reported as a backup failure at `B09_MEDIA_SCAN` with `command_category=find`;
it must never be interpreted as a safe media tree. Unsafe entries are reported
without logging the full unsafe filename.

Archive validation is centralized in:

```text
deploy/backup/verify-shared-media-archive.py
```

The verifier validates every tar member before writing anything, rejects
absolute paths, traversal, empty paths, backslashes, drive-like paths, symlinks,
hardlinks, devices, FIFOs, sockets, duplicate normalized file paths, and
file/directory conflicts. It manually writes only regular files into a unique
protected empty verification directory, recalculates extracted path/size/SHA-256
inventory, file count, logical bytes, and canonical tree fingerprint, compares
expected inventory or manifest metadata, deletes the verification directory,
and returns nonzero if cleanup is incomplete. It does not call
`TarFile.extract()` or `extractall()`.

The manifest stores only safe metadata: backup id, UTC timestamps, source
hostname, source and verified temporary database encoding/collation metadata,
Alembic revision, table counts, canvas metadata, sanitized canvas fingerprint,
dump/archive size and hash, media regular-file count, media logical bytes,
deterministic media tree fingerprint, tool version, and verification result. It
must not contain database passwords, database URLs, private keys, auth/session
values, visitor-message contents, audit payloads, canvas JSON, or media bytes.

`SHA256SUMS` covers:

```text
personal_web_shared_dev.dump
homepage-media.tar.gz
manifest.json
```

The server keeps the newest 14 verified successful snapshots and never deletes
the newest verified backup. A directory is retention-eligible only after strict
name, direct-child, non-symlink, owner/group, mode, exact direct-child entry
set, SHA256SUMS, manifest, dump, archive content count/bytes/fingerprint, and
verifier checks pass. Unknown directories are ignored. Old `.partial`
directories are eligible for cleanup only after strict full-name, path,
non-symlink, owner/group, mode, and age validation.

Temporary database cleanup uses a helper that distinguishes query failure,
database still present, database absent, and unexpected query output. A failed
cleanup query is treated as cleanup failure, never as proof that the database is
absent.

Concurrency uses a nonblocking server-local `flock`; a second invocation exits
safely without deleting a stale lock file.

## Manual Server Backup

The server backup service template is:

```text
deploy/backup/personal-web-shared-dev-backup.service
```

The service is `Type=oneshot`. It does not restart PostgreSQL, Nginx, SSH, or
the backend. It keeps `CAP_SETUID` and `CAP_SETGID` so `runuser` can enter the
`postgres` OS identity, and keeps `CAP_DAC_READ_SEARCH` for root-controlled
read access to the protected shared media tree and backup root.

Current tracked code supports no automatic server backup schedule. Server
backup creation is manual-only:

```text
systemctl start personal-web-shared-dev-backup.service
```

After manual creation, verify a completed backup with:

```text
/opt/personal-web/deploy/backup/verify-shared-dev-backup.sh <backup-id>
```

The previously installed remote timer has already been disabled operationally.
After fixed-commit review, a separate server-cleanup task may delete only that
disabled timer unit. This repository no longer carries a server timer template.

## Old-Computer Pull

The pull script is:

```powershell
.\scripts\pull-shared-dev-backup.ps1
```

It uses the existing trusted administrative SSH alias:

```text
personal-web-prod
```

It does not use the shared database password, `personal-web-shared-db`,
`personal-web-shared-media`, or the old local PostgreSQL database. It discovers
only completed server backups under the server backup root, requires `SUCCESS`,
validates strict backup names, remote non-symlink directory metadata, exact
remote file set, remote file owner/group/mode, and server verifier success
before downloading. It downloads only the required files into a unique
run-specific `.partial-<pid>-<random>` local directory, verifies `SHA256SUMS`,
parses `manifest.json`, cross-checks manifest payload hashes and sizes, checks
`pg_restore --list` when PostgreSQL tooling is available, validates tar members
before extraction, extracts into a protected verification directory, verifies
logical bytes and tree fingerprint, and atomically moves the verified directory
into place.

The local pull verifier reuses the canonical repository media verifier at
`deploy/backup/verify-shared-media-archive.py` instead of embedding a second tar
parser. It invokes the helper with `--archive`, a unique protected
`archive-verify-*` extraction directory, and `--expect-manifest`; the helper must
remove its extraction directory before success is accepted.

`pg_restore.exe` discovery is deterministic for noninteractive pull runs. An
explicit `-PgRestorePath` wins, followed by PATH discovery, a sibling beside
`psql.exe`, official PostgreSQL installation registry records, PostgreSQL
service executable location, and standard Program Files PostgreSQL directories.
Candidates must be absolute non-reparse `pg_restore.exe` files whose
`--version` output identifies PostgreSQL. Full PostgreSQL installations are
preferred over pgAdmin runtime copies.

Remote discovery and completed-backup validation start the fixed remote command
`bash -s --` over the trusted SSH alias and send the generated Bash source on
standard input as UTF-8 without BOM and LF newlines. The Bash source is not
placed in native command-line arguments, environment variables, remote temporary
files, or base64 command payloads.

Local ACLs are SID-based rather than localized-name based. The only expected
explicit allow entries are the current user SID, Local System `S-1-5-18`, and
Builtin Administrators `S-1-5-32-544`; each entry must be exactly FullControl,
inheritance is disabled, reparse points are rejected, ownership must be one of
the expected SIDs, and the ACL is read back for the backup root, partial
directory, downloaded files, finalized directory, and retained files. If the
item already has this exact protected DACL, ACL handling is a no-op and does not
call `Set-Acl`. If repair is required, only the DACL on the existing security
descriptor is changed; owner, primary group, and audit/SACL state are preserved
for the current user's non-elevated Limited scheduled-task context.

If download or verification fails, the script removes only the exact
run-specific partial directory after path, reparse, and ACL checks. If those
checks fail, the partial is preserved and reported rather than deleting an
unknown directory.

If the newest backup already exists locally and verifies, the script reports
`already_current` and does not redownload or modify it.

## Manual Old-Computer Pull

Local backup pull is manual-only. Run:

```powershell
.\scripts\pull-shared-dev-backup.ps1
```

Current tracked code supports no automatic Windows backup pull schedule and no
Windows task installer. The optional helper
`.\scripts\remove-shared-dev-backup-pull-task.ps1` is uninstall-only for the
legacy repository-owned task named `Personal_Web Shared Backup Pull`. It cannot
install, create, update, or start a task, and it refuses to modify unrelated
tasks.

Existing verified server backups and existing verified old-computer pulled
backups remain valid. Server retention still keeps the newest 14 verified backups
when the manual server creation script runs. Local retention still keeps the
newest 7 verified pulled backups when the manual pull script runs.

A future one-click manual UI can wrap these explicit commands, but that is a
separate feature. Production remains excluded.

## Restore Drill

The server restore-drill template is:

```text
deploy/backup/verify-shared-dev-restore.sh
```

It selects a verified backup under a nonblocking restore-drill lock, creates a
uniquely named temporary database:

```text
pw_rs_v_<YYYYMMDDTHHMMSSZ>_<32-lowercase-hex>
```

The restore temporary database name follows the same 57-byte, 128-bit-random,
strict read-back contract as the backup verification database. It is validated
before `createdb`, then queried from `pg_database.datname` and must match
exactly before the dump is restored.

If the nonblocking restore lock is unavailable, the drill prints a sanitized
message, performs no verification work, creates no temporary database or media
extraction directory, prints no `OK`, and exits with code `75` to indicate that
verification was temporarily unavailable and not performed.

It uses the canonical archive verifier for validation and manually controlled
temporary extraction, writes a safe extracted inventory for comparison, restores
the custom dump only into that temporary database, compares Alembic revision,
table counts, canvas metadata/fingerprint, compares media regular-file count,
logical bytes, and deterministic media tree fingerprint, then drops the
temporary database and deletes temporary inventory/extraction artifacts.

Cleanup preserves the original verification exit status, attempts to remove only
the exact temporary database and media directory, verifies both are gone, and
returns nonzero if cleanup is incomplete. `OK` is printed only after both
verification and cleanup succeed.

The drill must never restore into `personal_web_shared_dev` or
`personal_web_prod`, never start the application against the temporary database,
never expose it publicly, and must return nonzero if cleanup is incomplete.

No real restore drill is executed in this code-only phase.
