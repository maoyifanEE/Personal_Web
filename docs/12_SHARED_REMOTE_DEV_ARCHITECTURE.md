# Shared Remote Development Architecture

This document describes the code foundation for an isolated shared-development
data profile. It does not configure the real server, real database, real SFTP
account, SSH keys, or host keys.

## Profiles

`PERSONAL_WEB_DATA_PROFILE=local` is the default. It keeps the existing local
PostgreSQL and project-local filesystem media behavior.

`PERSONAL_WEB_DATA_PROFILE=shared_remote` is explicit and development-only. It
requires `HOMEPAGE_MEDIA_STORAGE_BACKEND=sftp`, complete shared media settings,
and a launcher-provided in-memory `DATABASE_URL`. Production rejects this
profile and shared-development SFTP settings.

There is no hostname, port, database-name, or secret-file inference. Shared mode
must fail on incomplete configuration instead of falling back to local data.

## Secret Contract

The future protected secret file lives outside Git under the current Windows
user profile. The code defines a strict allowlist parser for synthetic fixtures
and future launcher use. Blank lines and comments are ignored; unknown keys,
duplicates, and malformed lines are rejected without printing values.

Required database tunnel fields:

```text
SHARED_DEV_SSH_ALIAS
SHARED_DEV_DB_LOCAL_HOST
SHARED_DEV_DB_LOCAL_PORT
SHARED_DEV_DB_REMOTE_HOST
SHARED_DEV_DB_REMOTE_PORT
SHARED_DEV_DB_NAME
SHARED_DEV_DB_USER
SHARED_DEV_DB_PASSWORD
SHARED_DEV_REMOTE_MEDIA_ROOT
```

Future media SFTP fields:

```text
SHARED_DEV_MEDIA_SSH_ALIAS
SHARED_DEV_MEDIA_SSH_CONFIG_PATH
SHARED_DEV_MEDIA_REMOTE_ROOT
SHARED_DEV_MEDIA_CACHE_MAX_MB
SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS
```

The secret must not contain private-key material. SFTP uses an explicit
OpenSSH config alias and key identity from that config.

## Launcher Lifecycle

`start-shared-dev.bat` calls `scripts/start-shared-dev.ps1`. The shared launcher
resolves the protected secret path, parses it, rejects production-like database
names, requires loopback-only database access, starts SSH with `-N`, explicit
`-F`, `BatchMode=yes`, `ExitOnForwardFailure=yes`, password authentication
disabled, and a loopback-only `-L`.

The launcher records only sanitized tunnel metadata under
`.runtime/shared-dev/tunnel-state.json`: PID, process start time, local port,
alias, executable, and repository root. It never records the password, complete
database URL, private-key path, or raw SSH configuration.

Shared mode must check database identity and Alembic revision read-only before
backend startup, and it must perform an SFTP preflight. This task includes dry
run and validation paths using synthetic fixtures only. It does not run real
shared preflights.

Default browser startup still clears the current session with `?devLogout=1`.
Passing `keep-session` preserves the existing session.

`scripts/stop-local-dev.ps1` still stops local backend/frontend listeners on
ports 8000 and 4173. It also inspects the shared tunnel state file and stops a
tunnel only when PID, process start time, executable, local loopback port owner,
state owner, and repository root all match. It does not kill arbitrary `ssh.exe`
processes.

## Media Storage

Database `homepage_media.relative_path` values remain POSIX project-relative
logical paths under:

```text
data/uploads/homepage
```

Both backends reject absolute paths, backslashes, drive-letter paths, traversal,
and prefix confusion.

Filesystem mode maps the logical path to:

```text
PROJECT_ROOT / logical_relative_path
```

SFTP mode strips the exact logical root prefix and appends the safe suffix under
the configured remote root. The remote path is normalized as POSIX and checked
so it cannot escape the remote root.

## Uploads And Rollback

Uploads stream first into `.runtime/media-upload-staging/`. Existing size,
extension, MIME, and magic-byte validation are preserved. Only validated bytes
are sent to authoritative storage.

Filesystem storage atomically moves the staging file into the existing layout:

```text
images/<uuid>.<extension>
videos/<uuid>.<extension>
```

SFTP storage uploads to a unique remote temporary path, verifies remote size,
verifies SHA-256 by reading back the remote object, and atomically renames to
the final object. If database metadata commit fails after authoritative storage
succeeds, the service removes only the exact newly stored object. Homepage item
deletion remains a soft hide; this task adds no general media cleanup.

## Cache

SFTP reads materialize into `.runtime/shared-media-cache/`. Cache identity uses
the logical suffix, expected size, and expected checksum when available. Hits
are size-checked and checksum-checked when possible. Corrupt cache files are
removed and fetched again. Downloads use a temporary file followed by atomic
rename. Cache cleanup prunes by retention days and maximum total MB, and only
inside the shared media cache directory.

The cache is never authoritative. Missing authoritative media returns not found.
Storage outages return temporary unavailable. Integrity mismatches are not
served.

## Error And Logging Policy

Unsafe paths, missing rows, disabled/unpublished media, and missing objects map
to 404. Temporary remote storage failures map to 503. Integrity failures map to
a 500-class media storage response.

Logs include profile selection, backend selection, staging, storage store,
rollback, SFTP connect/disconnect outcomes, cache hit/miss/corruption/pruning,
launcher preflight status, tunnel state, and stop decisions. Logs must not print
passwords, full database URLs, secret contents, private-key paths, cookies,
authorization headers, CSRF tokens, session tokens, password hashes, media
contents, private messages, or Data URLs.

## Deferred Work

Server SFTP account creation, SSH config installation, real known-host
enrollment, real shared database preflight execution, media garbage lifecycle,
and production media design are intentionally deferred. Existing unreferenced or
missing media must not be automatically deleted.
