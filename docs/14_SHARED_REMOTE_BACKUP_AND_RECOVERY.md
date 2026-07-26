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

The old-computer backup root disables inherited ACLs and allows only the current
Windows user, SYSTEM, and local Administrators.

Backups, dumps, archives, manifests, logs, and local pulled copies must never be
committed to GitHub.

## Server Backup

The server template is:

```text
deploy/backup/create-shared-dev-backup.sh
```

It uses server-local PostgreSQL tools and trusted local administration context.
The database dump is custom format, equivalent to:

```text
pg_dump --format=custom --no-owner --no-privileges --dbname=personal_web_shared_dev
```

The script rejects production names, does not use the application password on a
command line, does not expose PostgreSQL publicly, and does not run migrations
or seed scripts.

The media archive is created from exactly:

```text
/srv/personal-web/shared-dev/homepage
```

The script rejects symlinks, device files, FIFOs, sockets, absolute archive
paths, and traversal paths. Media logical bytes are the sum of regular file byte
lengths, not filesystem allocation size.

The manifest stores only safe metadata: backup id, UTC timestamps, source
hostname, database encoding/collation metadata, Alembic revision, table counts,
canvas metadata, sanitized canvas fingerprint, dump/archive size and hash,
media regular-file count, media logical bytes, deterministic media tree
fingerprint, tool version, and verification result. It must not contain database
passwords, database URLs, private keys, auth/session values, visitor-message
contents, audit payloads, canvas JSON, or media bytes.

`SHA256SUMS` covers:

```text
personal_web_shared_dev.dump
homepage-media.tar.gz
manifest.json
```

The server keeps the newest 14 successful snapshots and never deletes the newest
verified backup. Unknown directories are ignored. Old `.partial` directories are
eligible for cleanup only after strict name/path/ownership validation.

Concurrency uses a nonblocking server-local `flock`; a second invocation exits
safely without deleting a stale lock file.

## Systemd Timer

Templates:

```text
deploy/backup/personal-web-shared-dev-backup.service
deploy/backup/personal-web-shared-dev-backup.timer
```

The service is `Type=oneshot`. It does not restart PostgreSQL, Nginx, SSH, or
the backend. The timer is daily at approximately 03:30 Asia/Shanghai with
`Persistent=true` and a modest randomized delay.

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
validates strict backup names and restrictive ownership/mode, downloads only the
required files into a `.partial` local directory, verifies `SHA256SUMS`, parses
`manifest.json`, checks `pg_restore --list` when PostgreSQL tooling is
available, checks the media archive listing, and atomically moves the verified
directory into place.

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
highest-privilege requirement, a daily trigger around 10:00 local time, and a
logon trigger. It does not wake the computer and does not start application
services. This code-only phase does not register the task.

## Restore Drill

The server restore-drill template is:

```text
deploy/backup/verify-shared-dev-restore.sh
```

It selects a verified backup, creates a uniquely named temporary database:

```text
personal_web_shared_dev_restore_verify_<timestamp>
```

It restores the custom dump only into that temporary database, compares Alembic
revision and table counts, extracts the media archive under a unique temporary
directory, compares regular-file count, logical bytes, and deterministic media
tree fingerprint, then drops the temporary database and deletes extracted media.

The drill must never restore into `personal_web_shared_dev` or
`personal_web_prod`, never start the application against the temporary database,
never expose it publicly, and must return nonzero if cleanup is incomplete.

No real restore drill is executed in this code-only phase.
