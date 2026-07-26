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

Layer A is a server-side daily snapshot stored under:

```text
/var/backups/personal-web/shared-dev
```

Each completed snapshot directory is named:

```text
YYYYMMDDTHHMMSSZ-<random-suffix>
```

The random suffix is generated with Python `secrets.token_hex(8)`, giving 128
bits of randomness as exactly 16 lowercase hexadecimal characters. It is not
generated with a `tr | head` pipeline.

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
server-side backups and keeps the newest 7 verified snapshots.

## Permissions

The server backup root and completed snapshot directories are root-owned and
mode `0700`. Backup files are mode `0600`.

Because the systemd service uses `ProtectSystem=strict`, installation must
create the backup root before enabling the timer:

```text
install -d -m 0700 -o root -g root /var/backups/personal-web/shared-dev
```

The service fails safely if the root does not already exist as `root:root`
`0700`.

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
personal_web_shared_dev_backup_verify_<UTC>_<random>
```

Alembic revision, table counts, canvas metadata, canvas revision, and sanitized
canvas fingerprint are calculated from that restored dump, not from a later live
source query. `SUCCESS` is refused if restore, verification, database-property
matching, or cleanup fails.

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

## Systemd Timer

Templates:

```text
deploy/backup/personal-web-shared-dev-backup.service
deploy/backup/personal-web-shared-dev-backup.timer
```

The service is `Type=oneshot`. It does not restart PostgreSQL, Nginx, SSH, or
the backend. It keeps `CAP_SETUID` and `CAP_SETGID` so `runuser` can enter the
`postgres` OS identity, and keeps `CAP_DAC_READ_SEARCH` for root-controlled
read access to the protected shared media tree and backup root. The timer is
daily at approximately 03:30 Asia/Shanghai with `Persistent=true` and a modest
randomized delay.

This code-only phase does not install, start, or enable the timer.

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

Local ACLs are SID-based rather than localized-name based. The only expected
explicit allow entries are the current user SID, Local System `S-1-5-18`, and
Builtin Administrators `S-1-5-32-544`; each entry must be exactly FullControl,
inheritance is disabled, reparse points are rejected, ownership must be one of
the expected SIDs, and the ACL is read back for the backup root, partial
directory, downloaded files, finalized directory, and retained files.

If download or verification fails, the script removes only the exact
run-specific partial directory after path, reparse, and ACL checks. If those
checks fail, the partial is preserved and reported rather than deleting an
unknown directory.

If the newest backup already exists locally and verifies, the script reports
`already_current` and does not redownload or modify it.

## Scheduled Task

The scheduled-task template is:

```powershell
.\scripts\install-shared-dev-backup-pull-task.ps1
```

It creates or updates:

```text
Personal_Web Shared Backup Pull
```

The task runs in the current user context with no stored Windows password, no
highest-privilege requirement, exactly one enabled daily trigger at 10:00 local
time, and exactly one enabled current-user logon trigger. Ownership checks
inspect Scheduled Task CIM properties, not localized `ToString()` output. An
existing task is updated only after exact ownership verification, using
`Set-ScheduledTask`, and the task is read back and revalidated after install or
update. It does not wake the computer and does not start application services.
This code-only phase does not register the task.

## Restore Drill

The server restore-drill template is:

```text
deploy/backup/verify-shared-dev-restore.sh
```

It selects a verified backup under a nonblocking restore-drill lock, creates a
uniquely named temporary database:

```text
personal_web_shared_dev_restore_verify_<timestamp>_<random>
```

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
