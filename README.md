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
| `journey.html` | Journey sketch canvas prototype | Public read, admin database save in local development |
| `login.html` | Private entrance | Local backend Auth/RBAC v1 login when backend is running |
| `hub.html` | Private hub preview | Shows role-aware local development app links |
| `apps/tasks/index.html` | Task List prototype | Static/local prototype |
| `apps/health/index.html` | Health Management prototype | Static/local prototype |
| `apps/special-subscription/index.html` | Special Subscription placeholder | Blank placeholder |
| `apps/messages/index.html` | Visitor Message Management | Admin-only backend-backed V1 |
| `apps/admin-users/index.html` | Admin user management | Local Auth/RBAC v1 admin-only backend API preview |
| `apps/homepage-admin/index.html` | Homepage content management | Local `homepage:edit` media and display item admin UI |

The journey prototype now uses a draft-paper style sketch canvas.

Current Journey sketch canvas v1 behavior:

* Transparent and full-bleed preview.
* Shared sketch canvas JSON can be read from local PostgreSQL through `GET /api/homepage/canvas`.
* Admin users with `homepage:edit` can save shared canvas JSON through `PUT /api/homepage/canvas`.
* Browser-local sketch state may remain in `localStorage` only as an invisible fallback/cache.
* State key: `journeySketchCanvasStateV1`.
* Schema version: `sketch-canvas-v1`.
* State includes background, strokes, nodes, stickers, and `nextNodeNumber`.
* Freehand drawing with smoothed strokes.
* Endpoint snap and merge behavior.
* Eraser split logic.
* Curve import from local PNG/WebP/JPG dashed route images or Journey curve JSON.
* Imported curves become normal strokes and are not saved until `保存画布`.
* Right-click node creation.
* Node dragging along a stroke component.
* Sticker upload, drag, resize, rotate, and delete.
* Sticker PNGs render on a transparent Journey wrapper with no automatic
  rectangular box shadow, drop-shadow, filled background, or rounded image panel.
* Sticker media upload uses the local homepage media API and stores `mediaId` references in the canvas JSON.

Journey canvas JSON is saved to PostgreSQL in local development through the single editor `保存画布` action.

Guests and normal users can read the saved Journey canvas.

Only admins with `homepage:edit` can save it.

Journey sticker uploads are persisted as homepage media in local development.

Local admins can export a Journey-only publish bundle ZIP from the Journey editor after saving the canvas.

Old local background or sticker drafts may still contain Data URL previews as fallback data only.

Data URL image persistence is intentionally rejected by the backend before saving the shared canvas.

Do not store real private data or real private images in the current Journey prototype.

Homepage media database foundation v1 is available for local development.

Current homepage media behavior:

* Admin users with `homepage:edit` can manage media and homepage display items from `apps/homepage-admin/index.html`.
* Admin upload APIs copy selected local image/video files into `data/uploads/homepage/`.
* The database stores media metadata and project-relative paths only.
* Original local absolute paths such as `C:\Users\...` or `D:\Pictures\...` are never stored.
* Public homepage display items can be read from `GET /api/homepage/public`.
* Uploading media does not by itself publish the file publicly.
* Public media files are served only when the media is enabled and referenced by at least one visible homepage item or the published Journey canvas.
* Public file serving is constrained to `HOMEPAGE_MEDIA_ROOT`.
* Admin preview of uploaded files uses the protected `/api/homepage/media/{id}/admin-file` route.
* Hiding a homepage item from the admin UI is a soft hide; it does not physically delete files.
* `data/uploads/` is runtime data and must not be committed to GitHub.
* This is local-development only and was not deployed to the public server.
* Journey sticker upload reuses the same media upload API; editor preview uses the protected admin file route and public preview uses the public file route.

## Navigation Behavior

* Visible visitor entrance on `index.html` opens the Journey public preview at `journey.html?view=public`.
* Visible user entrance opens `login.html` for guests and `hub.html` for authenticated local users.
* There is no hidden homepage button in the current behavior.
* Normal cover background clicks do not navigate.
* `login.html` calls the local backend login API and redirects to `hub.html` after a valid local session.
* ICP footer opens `https://beian.miit.gov.cn/`.
* `hub.html` links to child app prototypes.
* Homepage entrance buttons are navigation devices, not security mechanisms.
* Direct URL access is still possible for placeholder private pages.
* Journey editing requires `journey.html?edit=1` plus local `homepage:edit` permission.

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
|   |-- homepage-admin/
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
    |-- 11_HOMEPAGE_JOURNEY_FLOW_SPEC.md
    |-- 12_HOMEPAGE_REMOTE_PUBLISH_PLAN.md
    |-- 13_JOURNEY_CURVE_IMPORT.md
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
* `docs/11_HOMEPAGE_JOURNEY_FLOW_SPEC.md`: homepage, login, Hub, Journey canvas, and diagnostics flow specification.
* `docs/12_HOMEPAGE_REMOTE_PUBLISH_PLAN.md`: Homepage/Journey public publish-bundle and allowlist deployment plan.
* `docs/13_JOURNEY_CURVE_IMPORT.md`: Journey curve image/JSON import workflow and AI image guidance.
* `docs/PROJECT_HISTORY.md`: project change history.

Deployment preparation templates:

* `deploy/nginx/personal-web-public.conf.example`: phase-1 public Nginx allowlist example.
* `deploy/systemd/personal-web-backend.service.example`: local-only FastAPI service example.
* `deploy/production.env.example`: production environment placeholder template; real values must live outside GitHub.

## Local Diagnostics

Local development diagnostics are available for the homepage, login, Hub, and
Journey canvas flow. Browser logs are bounded and redacted through
`debug-logger.js`, while backend diagnostics are written as JSONL files under
`.local_logs/`.

Recommended local browser workflow for admins:

1. Log in as local admin `1 / 1`.
2. Open `hub.html`.
3. Click `本地调试日志`.
4. Click `导出完整调试包 ZIP`.
5. Send the downloaded zip to ChatGPT.

Guest and normal user behavior:

* Guests cannot export the complete debug ZIP.
* Normal authenticated users cannot export the complete debug ZIP.
* `debug-log.html` may still be opened locally for browser-side logs.
* Browser-only JSON/TXT export may remain available for local frontend logs.

The browser export asks the local backend to create one zip containing browser
debug logs plus safe backend/frontend/launcher local logs.
Complete debug ZIP export is a local development feature, but it still requires
an admin login. The local debug entry points are hidden outside `localhost` and
`127.0.0.1`, and the full ZIP controls are hidden from non-admin accounts.

Direct URL fallback:

```text
http://127.0.0.1:4173/debug-log.html
```

CLI fallback:

```powershell
.\scripts\collect-debug-logs.ps1
```

The collector creates a zip and a text summary under `.local_logs/`. It is for
local troubleshooting only and does not collect `.env`, database files, uploads,
backups, or previous bundles.

The debug bundle also excludes `data/uploads/homepage/` runtime media.
Review the zip before sharing it if privacy is a concern.

To guard against accidentally committed one-line source files:

```powershell
.\scripts\check-source-readability.ps1
```

The readability check prints line counts, byte counts, and maximum line lengths
for important frontend, backend, and local tooling source files.

To diagnose transparent Journey sticker rendering without mutating the real
canvas or media APIs:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-journey-sticker-rendering.ps1
```

The sticker rendering check writes ignored reports and browser screenshots under
`.runtime\journey-sticker-render-debug\`.

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
python scripts/local_static_server.py --host 127.0.0.1 --port 4173 --root .
```

The local static server sends `no-store` headers for HTML, JavaScript, CSS,
JSON, and source maps so development pages do not keep stale browser runtimes.
This is local-only behavior and does not change production caching.

Then open these URLs as needed:

* `http://127.0.0.1:4173/`
* `http://127.0.0.1:4173/journey.html`
* `http://127.0.0.1:4173/login.html`
* `http://127.0.0.1:4173/hub.html`
* `http://127.0.0.1:4173/apps/admin-users/index.html`
* `http://127.0.0.1:4173/apps/homepage-admin/index.html`
* `http://127.0.0.1:4173/apps/tasks/index.html`
* `http://127.0.0.1:4173/apps/health/index.html`
* `http://127.0.0.1:4173/apps/special-subscription/index.html`
* `http://127.0.0.1:4173/apps/messages/index.html`

## Local Auth Development Quickstart

The recommended beginner workflow on Windows is:

```text
1. Double-click install-local-shortcut.bat from the project folder.
2. A desktop shortcut named Personal Web Local is created.
3. Double-click the desktop icon later to start the local website.
```

The shortcut starts the same default flow as `start-local-dev.bat`.

It opens the local homepage with `?devLogout=1`, so old local admin sessions are
cleared by default.

The shortcut itself can be moved anywhere.

If the project folder moves, run `install-local-shortcut.bat` again so the
shortcut points to the new project path.

Advanced command fallback:

```powershell
.\start-local-dev.bat
```

By default, the local launcher opens:

```text
http://127.0.0.1:4173/?devLogout=1
```

The homepage handles this local-only flag by calling the logout API and then
cleaning the URL. This prevents an old admin HttpOnly session cookie from making
the app appear to start as admin automatically.

To keep the existing browser session intentionally:

```powershell
.\start-local-dev.bat keep-session
```

or:

```powershell
.\scripts\start-local-dev.ps1 -KeepSession
```

The launcher:

* checks `backend/.env`
* requires `APP_ENV=development`
* requires `ALLOW_DEV_TOOLS=true`
* uses `PERSONAL_WEB_DATA_PROFILE=local` and filesystem media by default
* installs backend requirements into `backend/.venv`
* runs Alembic migrations
* runs the development auth seed script
* starts the backend at `http://127.0.0.1:8000`
* starts the local no-store static frontend at `http://127.0.0.1:4173`
* opens the guest-reset homepage by default

## Shared Remote Development Profile

An explicit shared-development profile now exists as code foundation only:

```text
PERSONAL_WEB_DATA_PROFILE=shared_remote
HOMEPAGE_MEDIA_STORAGE_BACKEND=sftp
```

This profile is development-only. Backend settings independently require the
shared database URL to be a `postgresql+psycopg` loopback tunnel URL for the
allowlisted shared-development database and role. It never falls back to local
authoritative data, never writes a database URL to `backend/.env`, and the
shared launcher does not run Alembic migrations or the development auth seed.
The shared launcher also starts backend and frontend as direct managed Python
listener processes without `uvicorn --reload`; source changes require
`stop-shared-dev.bat` followed by a manual restart in this version.

The shared secret contract requires the database SSH alias
`personal-web-shared-db` to resolve to user `personal-web-db-tunnel`, the media
SSH alias `personal-web-shared-media` to resolve to user `personal-web-dev`, and
the exact remote media root `/srv/personal-web/shared-dev/homepage`.

The real launcher path is implemented, but must be used only after the next
reviewed configuration phase updates the protected external secret, separate DB
and media SSH configs, and the future SFTP account:

```powershell
.\start-shared-dev.bat
.\start-shared-dev.bat keep-session
```

The shared launcher keeps the existing default guest reset by opening
`?devLogout=1`; `keep-session` preserves the current browser session. During
this code-foundation phase, tests use synthetic secret files and fake SSH/SFTP
clients only. The real shared server, database, and media storage must not be
contacted from tests.

Stop a shared session with:

```powershell
.\stop-shared-dev.bat
```

Architecture details are documented in:

```text
docs/12_SHARED_REMOTE_DEV_ARCHITECTURE.md
```

Create a movable Windows shortcut:

```powershell
.\install-local-shortcut.bat
```

Advanced PowerShell equivalent:

```powershell
.\scripts\create-local-launch-shortcut.ps1
```

This creates `Personal Web Local.lnk` on the Desktop. The shortcut stores the
absolute target path and working directory, so the shortcut itself can be moved.

Optional keep-session shortcut:

```powershell
.\scripts\create-local-launch-shortcut.ps1 -KeepSession
```

This creates `Personal Web Local Keep Session.lnk` and passes `keep-session` to
`start-local-dev.bat`. It is not the default.

Optional portable `.cmd` launcher:

```powershell
.\scripts\create-portable-local-launcher.ps1
```

Local development accounts:

```text
Admin: 1 / 1
User: 2 / 2
```

These accounts are local development accounts only.

They are created by `python -m app.scripts.seed_dev_auth_users`.

They are not created by migrations and must not be used in production.

## Homepage Media API Local Test Notes

Run migrations before testing homepage media APIs:

```powershell
cd backend
alembic upgrade head
python -m app.scripts.seed_dev_auth_users
```

Public read:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/homepage/public
```

Admin upload requires a local authenticated admin session, CSRF token, and the
`homepage:edit` permission. Uploads are copied to `data/uploads/homepage/`.
Upload alone does not make the file publicly fetchable.
A media file becomes public only after it is enabled and referenced by at least one visible homepage item.

The browser admin UI is available at:

```text
http://127.0.0.1:4173/apps/homepage-admin/index.html
```

It can upload media, edit media metadata, create and hide homepage display
items, preview public homepage data, and find smoke-test display items for
cleanup. It uses the existing homepage media APIs and does not add a new
database schema.

Supported first-slice media types:

* Images: `.png`, `.jpg`, `.jpeg`, `.webp`
* Videos: `.mp4`, `.webm`

SVG, scripts, archives, HTML, executables, and PowerShell/batch files are rejected.
Allowed extensions are also checked against file signatures/magic bytes.
Clearly incompatible browser-supplied MIME types are rejected.

Future deployment will need both database migration and runtime upload directory
migration/backup planning. No deployment was done in this slice.

Manual equivalent:

```powershell
cd backend
alembic upgrade head
python -m app.scripts.seed_dev_auth_users
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
.\backend\.venv\Scripts\python.exe .\scripts\local_static_server.py --host 127.0.0.1 --port 4173 --root .
```

Then open:

```text
http://127.0.0.1:4173/
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
* Backend readiness failed because port `8000` is occupied by another process.
* Frontend readiness failed because port `4173` is occupied by another process.

If a startup window reports readiness or port problems, check the Backend or Frontend PowerShell window.

If a local development port is occupied, stop only the local dev listeners with:

```powershell
.\scripts\stop-local-dev.ps1
```

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


## Visitor Messages V1

The public cover page includes a bottom-right floating `留言` tool.

This tool submits visitor messages through `POST /api/messages`.

Public submission returns only a generic accepted response and does not expose
internal database IDs.

The message form does not use localStorage, sessionStorage, cookies, static JSON,
or GitHub files for message persistence.

The admin message page at `apps/messages/index.html` reads the protected
`/api/admin/messages` backend routes.

Admin list, detail, status, highlight, soft-delete, and restore actions require
administrator login plus `visitor_messages` permissions.
