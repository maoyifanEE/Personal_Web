# Personal Web Backend

## Purpose

This backend is the first local PostgreSQL development foundation for `Personal_Web`.

It exists so future modules can test real database-backed data through a backend API.

It is local development only.

It is not production deployment.

It is not deployed to the public server unless the user explicitly requests deployment.

It now includes a local-development Auth/RBAC v1 foundation.

It does not protect the current static private pages yet.

The production `.env` file and production database must remain separate from this local development setup.

## Current Scope

Implemented in this phase:

* FastAPI application skeleton.
* PostgreSQL connection configuration.
* SQLAlchemy model base.
* Alembic migration baseline.
* Database health endpoint.
* First business table: `visitor_messages`.
* Audit foundation table: `audit_logs`.
* Database-level RBAC foundation tables:
  * `app_users`
  * `roles`
  * `permissions`
  * `user_roles`
  * `role_permissions`
  * `auth_sessions`
* Shared Journey canvas table: `homepage_canvas_states`.
* Safe system role and permission definitions for future admin access planning.
* Local-development login/logout/me/CSRF APIs.
* Local-development admin user management APIs.
* Local-development homepage/Journey canvas read and admin save APIs.
* Local-development homepage media upload and display item APIs.
* Local-development homepage content admin UI at `apps/homepage-admin/index.html`.
* Development-only seed, reset, export, and admin summary endpoints.
* Development-only diagnostics endpoints and JSONL logs under `.local_logs/`.

Not implemented yet:

* Production login deployment.
* Production session hardening.
* Production authentication.
* Production authorization across every private API.
* Full route permission checks.
* Production administrator lifecycle.
* Production admin UI.
* Production deployment.
* Front-end visitor message API integration.
* Task, health, subscription, or image upload database migration.
* Production homepage media deployment or upload backup automation.

## Prerequisites

* Python 3.11 or 3.12.
* PostgreSQL installed locally.
* Git.
* Terminal or PowerShell.

## Recommended Local Database

Recommended local values:

* Database: `personal_web_dev`
* User: `personal_web_dev`
* Password: a local development password chosen by you

Example `psql` setup:

```sql
CREATE USER personal_web_dev WITH PASSWORD 'dev_password';
CREATE DATABASE personal_web_dev OWNER personal_web_dev;
```

`dev_password` is a local example only.

Choose your own local password if preferred.

Do not commit a real password.

## Local Environment File

Copy the example file:

```powershell
Copy-Item backend/.env.example backend/.env
```

Then edit:

```text
backend/.env
```

Set `DATABASE_URL` to your local PostgreSQL database.

Never commit `backend/.env`.

The repository ignores `backend/.env`.

## Install Dependencies

From the repository root on Windows:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

On Linux or macOS:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run Migrations

From `backend/`:

```bash
alembic upgrade head
```

This creates the local PostgreSQL tables:

* `visitor_messages`
* `audit_logs`
* `app_users`
* `roles`
* `permissions`
* `user_roles`
* `role_permissions`
* `auth_sessions`
* `homepage_canvas_states`
* `homepage_media`
* `homepage_items`

The RBAC tables are local-development foundation.

The `homepage_canvas_states` table stores shared Journey canvas JSON for local development.

The `homepage_media` and `homepage_items` tables store the first local-development homepage media
foundation. Uploaded files are copied to `data/uploads/homepage/`; the database stores metadata and
project-relative paths only. Uploading a file registers it for admin management but does not publish
it publicly until enabled media is referenced by at least one visible homepage item or the published
Journey canvas.

The migration seeds system role and permission definitions.

It does not create an `app_users` row automatically.

It does not create any password hash automatically.

Use the development seed script to create local test users.

## Seed Local Auth Users

From `backend/`, after migrations:

```bash
python -m app.scripts.seed_dev_auth_users
```

This command refuses to run unless:

* `APP_ENV=development`
* `ALLOW_DEV_TOOLS=true`

It creates or updates:

* admin username `1`
* normal user username `2`

The seed script stores password hashes only.

The seed accounts are for local browser smoke tests only.

## Start Backend

From `backend/`:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The static front-end is still served separately.

FastAPI does not serve the existing static pages in this phase.

## One-Click Local Development Start

Recommended beginner workflow on Windows:

```text
1. Double-click install-local-shortcut.bat from the project folder.
2. A desktop shortcut named Personal Web Local is created.
3. Double-click the desktop icon later to start the local backend and frontend.
```

The shortcut can be moved.

If the project folder moves, run `install-local-shortcut.bat` again.

Advanced command fallback from the repository root:

```powershell
.\start-local-dev.bat
```

The launcher checks `backend/.env`, runs migrations, runs the development auth seed,
starts the backend, starts the static frontend, and opens the homepage:

```text
http://127.0.0.1:4173/?devLogout=1
```

The default startup clears the current local browser session so the homepage
starts as a guest. To intentionally preserve the current browser session, use:

```powershell
.\start-local-dev.bat keep-session
```

The login page remains available at:

```text
http://127.0.0.1:4173/login.html
```

Required local development environment values:

```text
APP_ENV=development
ALLOW_DEV_TOOLS=true
PERSONAL_WEB_DATA_PROFILE=local
HOMEPAGE_MEDIA_STORAGE_BACKEND=filesystem
CORS_ALLOW_ORIGINS=http://127.0.0.1:4173,http://localhost:4173
```

Local development accounts:

```text
Admin: 1 / 1
User: 2 / 2
```

These accounts are created by the development seed script only.

They are not seeded by migrations and must never be used in production.

Common login setup problems:

* Backend is not running on `127.0.0.1:8000`.
* PostgreSQL is not running.
* `DATABASE_URL` points to a different database.
* Alembic migration was not run.
* Development auth seed was not run.
* `ALLOW_DEV_TOOLS` is not `true`.
* CORS origins do not include the local frontend origin.
* Backend readiness failed because port `8000` is occupied by another process.
* Frontend readiness failed because port `4173` is occupied by another process.

Manual backend troubleshooting command from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Manual frontend troubleshooting command from the repository root:

```powershell
.\backend\.venv\Scripts\python.exe -m http.server 4173 --bind 127.0.0.1
```

If a port is occupied, run:

```powershell
.\scripts\stop-local-dev.ps1
```

## Test Health

Open:

```text
http://127.0.0.1:8000/api/health
```

Expected when PostgreSQL is available:

```json
{
  "status": "ok",
  "app": "Personal Web Backend",
  "environment": "development",
  "database": "ok",
  "timestamp": "..."
}
```

If the database is unavailable, the endpoint returns a clear database error without exposing the connection string.

## Test Development Data

Seed fake test/demo messages:

```bash
curl -X POST http://127.0.0.1:8000/api/dev/seed
```

List messages in development:

```bash
curl http://127.0.0.1:8000/api/messages
```

Create a test visitor message:

```bash
curl -X POST http://127.0.0.1:8000/api/messages \
  -H "Content-Type: application/json" \
  -d "{\"nickname\":\"Local Tester\",\"contact\":\"tester@example.test\",\"message\":\"This is local database test data.\",\"data_scope\":\"test\"}"
```

View admin data foundation summary:

```bash
curl http://127.0.0.1:8000/api/admin/data/summary
```

Test local login:

```bash
curl -i -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"usernameOrEmail\":\"1\",\"password\":\"1\"}"
```

Read the shared Journey canvas:

```bash
curl http://127.0.0.1:8000/api/homepage/canvas
```

Read public homepage display items:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/homepage/public
```

Admin media upload requires a local admin session, CSRF token, and `homepage:edit`.

Endpoint:

```text
POST /api/homepage/media
```

Only these file types are accepted in this slice:

* `.png`
* `.jpg`
* `.jpeg`
* `.webp`
* `.mp4`
* `.webm`

Uploaded runtime files live under `data/uploads/homepage/`.

They are ignored by Git and must not be committed.

The database stores project-relative paths only. It must not store original local absolute paths.
Public file serving is constrained to `HOMEPAGE_MEDIA_ROOT` and returns 404 for unpublished,
hidden-item-only, unreferenced-canvas, disabled, missing, or root-escaped media paths.
Allowed extensions are validated against file signatures/magic bytes.
The admin-only preview route is:

```text
GET /api/homepage/media/{id}/admin-file
```

The local browser admin UI is:

```text
http://127.0.0.1:4173/apps/homepage-admin/index.html
```

It reuses the existing homepage media and item APIs. It does not add a new
database schema. Uploading media alone does not publish it; a visible homepage
item or the published Journey canvas must reference an enabled media row before
the public file route becomes available. Hiding an item from the UI is a soft hide.

## Shared Remote Development Foundation

The backend now has an explicit `shared_remote` data profile for a future
isolated shared-development environment:

```text
PERSONAL_WEB_DATA_PROFILE=shared_remote
HOMEPAGE_MEDIA_STORAGE_BACKEND=sftp
```

Validation allows this only when `APP_ENV=development`, the database URL is a
`postgresql+psycopg` loopback tunnel URL for the allowlisted
shared-development database and role, and all required SFTP settings are
present. Production rejects `shared_remote`, rejects SFTP media, and rejects
shared-development SFTP settings.

The shared launcher constructs `DATABASE_URL` only in process memory from the
protected external secret file. It must not write that URL to `backend/.env`.
Unlike the local launcher, shared mode must not run `alembic upgrade head` or
`python -m app.scripts.seed_dev_auth_users`.
Shared mode intentionally starts backend and frontend through
`backend\.venv\Scripts\python.exe` and does not use `uvicorn --reload`; use
`stop-shared-dev.bat` and restart the shared launcher after source changes. The
launcher uses an auto-releasing project-scoped Windows mutex, validates captured
process records before cleanup, and does not persist raw child stdout/stderr.
Shared session state is schema version 2 and records full child-listener
identity when the venv launcher process has a direct socket-owning child. Stop
returns a nonzero exit code when cleanup is refused or state requires manual
review.

The protected external secret contract is defined by
`config/shared-dev-secret-contract.json`. It uses separate database and media
SSH config paths. The canonical media root key is
`SHARED_DEV_REMOTE_MEDIA_ROOT`; the launcher maps it into the backend as
`SHARED_DEV_MEDIA_REMOTE_ROOT`. The only accepted database SSH alias/user is
`personal-web-shared-db` / `personal-web-db-tunnel`; the only accepted media
SSH alias/user is `personal-web-shared-media` / `personal-web-dev`; the only
accepted media root is `/srv/personal-web/shared-dev/homepage`.

The launcher real path is implemented but should not be run against the real
shared environment until the next reviewed configuration phase. Tests use only
synthetic secrets, fake executables, fake SFTP clients, injected database
preflight connections, temporary loopback ports, malformed-contract fixtures,
synthetic launcher failure scenarios, and injected temporary runtime/log roots
that keep tests out of real `.runtime\shared-dev` and `.local_logs\launcher`.

Homepage media now goes through a storage abstraction. Local mode remains
filesystem-backed under `data/uploads/homepage/`. Shared mode maps the same
database logical paths to a future SFTP root and materializes reads through the
non-authoritative cache at `.runtime/shared-media-cache/`. Uploads are first
validated in `.runtime/media-upload-staging/`, then stored authoritatively, and
an exact newly stored object is removed if the database metadata commit fails.

Save the shared Journey canvas as an authenticated admin:

```bash
curl -X PUT http://127.0.0.1:8000/api/homepage/canvas \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token-from-/api/auth/csrf>" \
  -b "<admin-session-cookie>" \
  -d @canvas-payload.example.json
```

`canvas-payload.example.json` is a local scratch file example only.

Do not commit real canvas data exports.

The save endpoint rejects Data URL images. Journey stickers should be uploaded through
`POST /api/homepage/media` and saved as `mediaId` references before publishing. Background
Data URL drafts remain local-only.

Soft-delete test/demo data:

```bash
curl -X POST http://127.0.0.1:8000/api/dev/reset-test-data
```

Export current development data as JSON response:

```bash
curl http://127.0.0.1:8000/api/dev/export
```

The export endpoint returns JSON.

It does not automatically write files.

## Data Safety

Local database data is not stored in the project folder.

Local database data is not pushed to GitHub.

`backend/.env` is ignored.

Development records may use:

* `data_scope=test`
* `data_scope=demo`
* `data_scope=imported`

Archived visitor messages use `status=archived`.

Archived is not a `data_scope` value.

RBAC records answer a separate question: who can do what.

Status and lifecycle fields answer whether a record is active, disabled, locked, archived, or soft-deleted.

Plaintext passwords must never be stored.

`app_users.password_hash` stores password hashes only.

Production data must use a separate production database later.

Do not connect this development backend to a real production database.

Do not commit real private data.

Do not commit secrets.

Do not commit database dumps, logs, uploads, or backups.

## Production Safety

Development endpoints are disabled unless:

* `APP_ENV=development`
* `ALLOW_DEV_TOOLS=true`

If `APP_ENV=production` and `ALLOW_DEV_TOOLS=true`, startup fails.

The following endpoints return `403` outside development tools mode:

* `GET /api/messages`
* `PATCH /api/messages/{message_id}/status`
* `POST /api/messages/{message_id}/soft-delete`
* `POST /api/dev/seed`
* `POST /api/dev/reset-test-data`
* `GET /api/dev/export`
* `GET /api/admin/data/summary`
* `GET /api/debug/status`
* `POST /api/debug/client-log`
* `POST /api/debug/export-bundle`

The client-log debug endpoint is local-development only. It sanitizes incoming
payloads before writing JSONL logs and rejects oversized entry counts, oversized
total JSON payloads, and oversized individual entries.

The debug bundle export endpoint is also local-development only and admin-only.
It returns a zip assembled from sanitized browser logs, safe local JSONL logs,
git summary, and environment summary without `.env` contents.

The normal no-terminal admin path is Hub -> `本地调试日志` -> `导出完整调试包 ZIP`.
Guests and normal users may use `debug-log.html` for browser-side logs, but they
cannot export the complete debug ZIP.
The local debug UI is hidden outside `localhost` and `127.0.0.1`, and complete
ZIP controls are hidden from non-admin accounts.

The Auth/RBAC v1 endpoints are local-development endpoints in this phase.

They must be reviewed and hardened before production deployment.

## Future Phases

Future work should add:

* Production admin authentication hardening.
* Session expiry, CSRF, cookie, and deployment review.
* Full protected admin route coverage.
* Admin data center UI.
* Front-end visitor message integration.
* Task, health, subscription, and Journey image upload persistence.
* Backup and restore automation.
* Production deployment hardening.
