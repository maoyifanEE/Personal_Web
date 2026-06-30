# Personal_Web

## Current Stage

`Personal_Web` is a long-term personal website and personal tools platform.

The current project stage is a local-development website and tools preview.

Current implementation boundaries:

* Static front-end pages exist for local development and local testing.
* Backend skeleton exists for local development only.
* Local PostgreSQL development foundation exists.
* Local RBAC database schema foundation exists.
* Local-development Auth/RBAC v1 is started.
* `login.html` now calls the local backend login API when the backend is running.
* Backend sessions are stored in the database and sent through an HttpOnly cookie.
* Production authentication and authorization are not deployed.
* Cloud sync is not implemented.
* Private pages remain static front-end shells and are not production-secure yet.
* Code merged to `main` is not automatically deployed to the public server.
* Public/server deployment happens only after explicit user instruction.
* Real private data must not be committed to GitHub.

The repository may contain source code, static structure, safe assets, project notes, and clearly fake sample data.

The repository must not contain real private data, secrets, production database files, uploads, logs, backups, or production-only configuration.

## Current Pages

| Page | Purpose | Current status |
| --- | --- | --- |
| `index.html` | Public cover homepage | Implemented static page |
| `journey.html` | Journey sketch canvas prototype | Static/local prototype |
| `login.html` | Private entrance | Local backend Auth/RBAC v1 login when backend is running |
| `hub.html` | Private hub preview | Shows role-aware local development app links |
| `apps/tasks/index.html` | Task List prototype | Static/local prototype |
| `apps/health/index.html` | Health Management prototype | Static/local prototype |
| `apps/special-subscription/index.html` | Special Subscription placeholder | Blank placeholder |
| `apps/messages/index.html` | Visitor Message Management prototype | Static/front-end prototype |
| `apps/admin-users/index.html` | Admin user management | Local Auth/RBAC v1 admin-only backend API preview |

The journey prototype now uses a draft-paper style sketch canvas.

Current Journey sketch canvas v1 behavior:

* Transparent and full-bleed preview.
* Browser-local sketch state stored in `localStorage`.
* State key: `journeySketchCanvasStateV1`.
* Schema version: `sketch-canvas-v1`.
* State includes background, strokes, nodes, stickers, and `nextNodeNumber`.
* Freehand drawing with smoothed strokes.
* Endpoint snap and merge behavior.
* Eraser split logic.
* Right-click node creation.
* Node dragging along a stroke component.
* Sticker upload, drag, resize, rotate, and delete for local prototype preview.
* Background upload and clear for local prototype preview.

Journey state is not persisted to the backend yet.

Sticker and background uploads are local prototype Data URL previews only.

Do not store real private data or real private images in the current Journey prototype.

## Navigation Behavior

* Visible visitor entrance on `index.html` opens `journey.html`.
* Visible user entrance opens `login.html`.
* There is no hidden homepage button in the current behavior.
* Normal cover background clicks do not navigate.
* `login.html` calls the local backend login API and redirects to `hub.html` after a valid local session.
* ICP footer opens `https://beian.miit.gov.cn/`.
* `hub.html` links to child app prototypes.
* Homepage entrance buttons are navigation devices, not security mechanisms.
* Direct URL access is still possible for placeholder private pages.

## Data Safety

Code and documentation may be committed to GitHub.

Real private data must not be committed to GitHub.

The following items must stay out of GitHub:

* Real private data.
* Real account passwords.
* Real login credentials.
* API keys.
* Access tokens.
* SSH private keys.
* Production certificates.
* Database files.
* Uploaded private files.
* Server logs.
* Backups.
* Production-only configuration.
* Local `.env` files with real secrets.

`localStorage` is allowed only for early static prototypes.

`localStorage` is not final long-term private data storage.

Long-term private data should eventually move to a backend API and a server-side database.

The `backend/` folder now contains a FastAPI + PostgreSQL local-development foundation.

It is not deployed to production yet.

It now includes a local-development Auth/RBAC v1 foundation, database-backed sessions, and admin-created test users.

It does not make static pages production-secure yet.

## File Structure

```text
Personal_Web/
|-- index.html
|-- journey.html
|-- login.html
|-- auth.js
|-- hub.js
|-- hub.html
|-- styles.css
|-- script.js
|-- journey.css
|-- journey.js
|-- backend/
|   |-- README.md
|   |-- requirements.txt
|   |-- .env.example
|   |-- alembic.ini
|   |-- alembic/
|   `-- app/
|-- apps/
|   |-- admin-users/
|   |-- tasks/
|   |   `-- index.html
|   |-- health/
|   |   `-- index.html
|   |-- messages/
|   |   `-- index.html
|   `-- special-subscription/
|       `-- index.html
`-- docs/
    |-- 00_DESIGN_GUIDE.md
    |-- 05_APP_MODULES.md
    |-- 06_VISUAL_STYLE_GUIDE.md
    |-- 07_ROUTE_AND_SECURITY_RULES.md
    |-- 08_PROJECT_STRUCTURE_STANDARD.md
    |-- 09_BACKEND_DATABASE_PLAN.md
    |-- 10_BACKEND_DATABASE_ARCHITECTURE.md
    `-- PROJECT_HISTORY.md
```

## Documentation Map

* `docs/00_DESIGN_GUIDE.md`: ownership, data safety, and deployment boundaries.
* `docs/05_APP_MODULES.md`: child app registry and app module standards.
* `docs/06_VISUAL_STYLE_GUIDE.md`: visual and navigation style rules.
* `docs/07_ROUTE_AND_SECURITY_RULES.md`: route categories and security limits.
* `docs/08_PROJECT_STRUCTURE_STANDARD.md`: structure and branch standards.
* `docs/09_BACKEND_DATABASE_PLAN.md`: backend/database status and next-stage planning.
* `docs/10_BACKEND_DATABASE_ARCHITECTURE.md`: target backend/database architecture and implementation status.
* `docs/PROJECT_HISTORY.md`: project change history.

## Development Rules

* Do not work directly on `main` unless explicitly instructed.
* Use `Feature/xxx` for new features.
* Use `BugFix/xxx` for fixes.
* Update relevant docs when adding or changing modules.
* Read `docs/00_DESIGN_GUIDE.md` before data-related work.
* Read `docs/05_APP_MODULES.md` before adding child apps.
* Read `docs/07_ROUTE_AND_SECURITY_RULES.md` before route or security work.
* Do not add backend, database, or auth unless explicitly requested.
* Do not treat the static `login.html` mock as real security.
* Do not add real private data to static files.
* Keep app-specific code inside the relevant app folder.
* Keep documentation readable in raw Markdown source form.

## Local Preview

Run this command from the repository root:

```bash
python -m http.server 4173
```

Then open these URLs as needed:

* `http://127.0.0.1:4173/`
* `http://127.0.0.1:4173/journey.html`
* `http://127.0.0.1:4173/login.html`
* `http://127.0.0.1:4173/hub.html`
* `http://127.0.0.1:4173/apps/admin-users/index.html`
* `http://127.0.0.1:4173/apps/tasks/index.html`
* `http://127.0.0.1:4173/apps/health/index.html`
* `http://127.0.0.1:4173/apps/special-subscription/index.html`
* `http://127.0.0.1:4173/apps/messages/index.html`

## Local Auth Development Quickstart

The easiest local start path on Windows is:

```powershell
.\start-local-dev.bat
```

The launcher:

* checks `backend/.env`
* requires `APP_ENV=development`
* requires `ALLOW_DEV_TOOLS=true`
* installs backend requirements into `backend/.venv`
* runs Alembic migrations
* runs the development auth seed script
* starts the backend at `http://127.0.0.1:8000`
* starts the static frontend at `http://127.0.0.1:4173`
* opens `http://127.0.0.1:4173/login.html`

Local development accounts:

```text
Admin: 1 / 1
User: 2 / 2
```

These accounts are local development accounts only.

They are created by `python -m app.scripts.seed_dev_auth_users`.

They are not created by migrations and must not be used in production.

Manual equivalent:

```powershell
cd backend
alembic upgrade head
python -m app.scripts.seed_dev_auth_users
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:4173/login.html
```

Common login failure causes:

* Backend is not running on `127.0.0.1:8000`.
* Frontend is not opened from `127.0.0.1:4173`.
* Alembic migration was not run.
* Development auth seed was not run.
* `DATABASE_URL` points to a different local database.
* `ALLOW_DEV_TOOLS` is not `true`.
* `CORS_ALLOW_ORIGINS` does not include `http://127.0.0.1:4173`.

Stop local servers:

```powershell
.\scripts\stop-local-dev.ps1
```

## Current Non-Goals

* Production backend deployment.
* Production database deployment.
* Production login deployment.
* Production authentication.
* Production authorization.
* Production-protected private routes.
* Real cloud synchronization.
* Real payment or subscription integration.
* Production CMS.
* Multi-user permission system.

## Merge Readiness Note

Documentation fixes should not change website behavior.

Application behavior should be verified separately when application files are changed.


## Visitor Message Prototype

The public cover page includes a bottom-right floating `留言` tool.

This tool opens a front-end modal prototype for visitor messages.

The current prototype validates nickname and message content only.

Visitor messages are not saved in this static phase.

The admin message page at `apps/messages/index.html` is also a front-end prototype only.

Real message submission and management require future backend, database, authentication, and administrator authorization.
