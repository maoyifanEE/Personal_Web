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

The RBAC tables are local-development foundation.

The `homepage_canvas_states` table stores shared Journey canvas JSON for local development.

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

From the repository root on Windows:

```powershell
.\start-local-dev.bat
```

The launcher checks `backend/.env`, runs migrations, runs the development auth seed,
starts the backend, starts the static frontend, and opens the homepage:

```text
http://127.0.0.1:4173/
```

The login page remains available at:

```text
http://127.0.0.1:4173/login.html
```

Required local development environment values:

```text
APP_ENV=development
ALLOW_DEV_TOOLS=true
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

The save endpoint rejects Data URL images because server-side image upload persistence is not implemented yet.

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

The client-log debug endpoint is local-development only. It sanitizes incoming
payloads before writing JSONL logs and rejects oversized entry counts, oversized
total JSON payloads, and oversized individual entries.

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
