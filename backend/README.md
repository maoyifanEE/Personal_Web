# Personal Web Backend

## Purpose

This backend is the first local PostgreSQL development foundation for `Personal_Web`.

It exists so future modules can test real database-backed data through a backend API.

It is not production deployment.

It does not implement real authentication yet.

It does not protect the current static private pages yet.

## Current Scope

Implemented in this phase:

* FastAPI application skeleton.
* PostgreSQL connection configuration.
* SQLAlchemy model base.
* Alembic migration baseline.
* Database health endpoint.
* First business table: `visitor_messages`.
* Audit foundation table: `audit_logs`.
* Development-only seed, reset, export, and admin summary endpoints.

Not implemented yet:

* Real login.
* Real sessions.
* Real authentication.
* Real authorization.
* Production admin UI.
* Production deployment.
* Front-end visitor message API integration.
* Task, health, subscription, or journey database migration.

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

This creates the first local PostgreSQL tables:

* `visitor_messages`
* `audit_logs`

## Start Backend

From `backend/`:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The static front-end is still served separately.

FastAPI does not serve the existing static pages in this phase.

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

Test records use `data_scope=test` or `data_scope=demo`.

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

## Future Phases

Future work should add:

* Real admin authentication.
* Server-side sessions or another chosen auth design.
* Protected admin routes.
* Admin data center UI.
* Front-end visitor message integration.
* Task, health, subscription, and journey database migrations.
* Backup and restore automation.
* Production deployment hardening.
