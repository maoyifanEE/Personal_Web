# Shared Remote Development Architecture

This document describes the hardened code foundation for an isolated
shared-development data profile. The real startup path is implemented, but the
real server, real database, real SFTP account, SSH config, SSH keys, and host
keys remain a separate reviewed configuration phase.

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

Required database tunnel and media fields:

```text
SHARED_DEV_SSH_ALIAS
SHARED_DEV_DB_SSH_CONFIG_PATH
SHARED_DEV_DB_LOCAL_HOST
SHARED_DEV_DB_LOCAL_PORT
SHARED_DEV_DB_REMOTE_HOST
SHARED_DEV_DB_REMOTE_PORT
SHARED_DEV_DB_NAME
SHARED_DEV_DB_USER
SHARED_DEV_DB_PASSWORD
SHARED_DEV_REMOTE_MEDIA_ROOT
SHARED_DEV_MEDIA_SSH_ALIAS
SHARED_DEV_MEDIA_SSH_CONFIG_PATH
```

Optional fields:

```text
SHARED_DEV_MEDIA_CACHE_MAX_MB
SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS
```

`SHARED_DEV_REMOTE_MEDIA_ROOT` is the canonical external secret key. The
launcher maps it into the backend process as `SHARED_DEV_MEDIA_REMOTE_ROOT`.
Synthetic fixtures may temporarily use deprecated `SHARED_DEV_MEDIA_REMOTE_ROOT`
only when the canonical key is absent or both values are identical.

The secret must not contain private-key material. Database tunnel and media SFTP
use separate explicit OpenSSH config paths and separate aliases.

The exact non-secret allowlist is:

```text
Database SSH alias: personal-web-shared-db
Database SSH user: personal-web-db-tunnel
Media SSH alias: personal-web-shared-media
Media SSH user: personal-web-dev
Remote media root: /srv/personal-web/shared-dev/homepage
```

## Launcher Lifecycle

`start-shared-dev.bat` supports:

```text
start-shared-dev.bat
start-shared-dev.bat keep-session
start-shared-dev.bat --help
```

The shared launcher resolves the protected secret path, parses it through
`config/shared-dev-secret-contract.json`, rejects production-like database
names, requires the allowlisted shared-development database and role, requires
loopback-only database access, installs the project venv requirements, starts
SSH with `-N`, explicit DB `-F`, `BatchMode=yes`,
`ExitOnForwardFailure=yes`, `PasswordAuthentication=no`,
`KbdInteractiveAuthentication=no`, `PreferredAuthentications=publickey`, and a
loopback-only `-L`.

The launcher does not write a successful session state until tunnel, DB
preflight, SFTP preflight, backend readiness, frontend readiness, and no-store
checks succeed. It records sanitized process metadata under
`.runtime/shared-dev/shared-session-state.json`: schema version, repository
root, profile, creation time, DB tunnel PID/start time/executable/local
port/alias, backend listener identity, and frontend listener identity. It never
records the password, complete database URL, private-key path, host/IP, command
line, or raw SSH configuration.

Backend and frontend are started as direct managed Python listener processes.
Shared mode does not use `powershell.exe -NoExit`, `cmd.exe /k`, or
`uvicorn --reload`. The launcher verifies PID, process start time, executable,
`127.0.0.1`, expected port, and listener OwningProcess before recording state.
Source changes require `stop-shared-dev.bat` followed by a manual shared-mode
restart in this version.

Before launching, existing state is classified as `absent`, `active_verified`,
`stale_all_gone`, or `invalid_or_unverifiable`. Active state refuses a second
start, stale all-gone state is removed, and ambiguous or unreadable state is
preserved for manual review. Browser opening happens only after verified state
is written and is best-effort; browser failure leaves the valid session running.

Shared mode checks database identity and Alembic revision read-only before
backend startup using `python -m app.scripts.check_shared_dev_preflight`. The
helper requires exactly one code Alembic head and exact database revision
equality. Shared mode then runs `python -m
app.scripts.check_shared_dev_sftp_preflight`, which calls the configured SFTP
backend preflight without uploading, renaming, chmodding, or deleting.

The real launcher must not be run until the next reviewed configuration phase
updates the protected secret and SSH/SFTP setup. Tests use `-ValidateOnly`,
`-DryRun`, synthetic secrets, and fake implementations only.

Default browser startup still clears the current session with `?devLogout=1`.
Passing `keep-session` preserves the existing session.

`stop-shared-dev.bat` calls `scripts/stop-shared-dev.ps1`. The shared stop
script validates session schema, repository ownership, profile, PID, process
start time, executable, and expected listener ownership before stopping backend,
frontend, then tunnel. It never kills a process merely because it is named
`ssh.exe`, `python.exe`, or `powershell.exe`.
After each stop it waits for the process to exit and the matching listener to
disappear before removing session state. PID reuse or unverifiable records
preserve state and require manual review.

`scripts/stop-local-dev.ps1` remains compatible with local 8000/4173 cleanup
and delegates shared session cleanup to the dedicated shared stop script when
present.

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

SFTP resolves the explicit media alias and requires `HostName`, `User`, `Port`,
exactly one `IdentityFile`, and exactly one `UserKnownHostsFile`. The media user
must be `personal-web-dev`; `root` is rejected. Unknown or changed host keys are
rejected by Paramiko `RejectPolicy`. Password authentication, SSH-agent fallback
and implicit key discovery stay disabled.

The database tunnel alias is separately resolved with `ssh -G -F` and must be
`personal-web-shared-db` with user `personal-web-db-tunnel`; `root` is rejected.
The resolved SSH configuration is never printed.

## Uploads And Rollback

Uploads stream first into `.runtime/media-upload-staging/`. Existing size,
extension, MIME, and magic-byte validation are preserved. Only validated bytes
are sent to authoritative storage.

Filesystem storage atomically moves the staging file into the existing layout:

```text
images/<uuid>.<extension>
videos/<uuid>.<extension>
```

SFTP storage uploads to a unique remote temporary path, verifies temporary
remote size and streaming SHA-256, atomically renames to the final object, then
verifies final remote size and streaming SHA-256. Temporary remote objects are
removed on failure paths. If database metadata commit fails after authoritative
storage succeeds, the service removes only the exact newly stored object and
logs `removed`, `already_missing`, or `rollback_failed`. Unexpected missing or
failed rollback emits a high-severity sanitized orphan-candidate diagnostic.
Homepage item deletion remains a soft hide; this task adds no general media
cleanup.

## Cache

SFTP reads materialize into `.runtime/shared-media-cache/`. Cache filenames are
fixed-length digests with safe media extensions. Cache identity uses the logical
suffix, expected size, and expected checksum when available. Hits are
size-checked and checksum-checked when possible. Corrupt cache files are removed
and fetched again. Downloads use a unique temporary file followed by atomic
rename. Cache cleanup prunes by retention days and maximum total MB, ignores
symlinks, tolerates races, removes stale cache temp files, and only operates
inside the shared media cache directory. Best-effort pruning failure is logged
but does not fail an already verified media read.
The file currently being returned from `materialize` is excluded from pruning,
and recent verified cache files receive a bounded grace period so concurrent
downloads may temporarily exceed the configured cache limit instead of deleting
an active response file.

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
