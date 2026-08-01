# Route and Security Rules

## Purpose

This document records current route categories and security boundaries.

It is not an implementation document.

It now records the local-development Auth/RBAC v1 boundary.

It does not claim production authentication or production authorization.

It explains what is public, what is a placeholder, and what must not be treated as secure yet.

## Current Route Categories

| Category | Route | Current status | Security status |
| --- | --- | --- | --- |
| Public page | `index.html` | Public cover page | Public |
| Public prototype | `journey.html` | Journey sketch canvas public prototype | Public/static prototype |
| Login entry | `login.html` | Local backend Auth/RBAC v1 login when backend is running | Development only |
| Private hub preview | `hub.html` | Role-aware static hub shell | Static route is not production protection |
| Child app prototype | `apps/tasks/index.html` | Task List prototype | Direct URL access possible |
| Child app prototype | `apps/health/index.html` | Health Management prototype | Direct URL access possible |
| Child app placeholder | `apps/special-subscription/index.html` | Special Subscription placeholder | Direct URL access possible |
| Admin UI | `apps/messages/index.html` | Visitor message management | Requires admin role and `visitor_messages:read` through backend APIs |
| Admin UI | `apps/homepage-admin/index.html` | Local homepage media and display item management | Requires local admin or `homepage:edit` in frontend and backend APIs |
| Backend health | `/api/health` | Local backend health endpoint | Public status only |
| Backend message create | `/api/messages` | Public visitor message create endpoint | Public create only; generic accepted response |
| Backend message admin | `/api/admin/messages/*` | Visitor message admin API | Requires admin role, message permissions, and CSRF for mutations |
| Backend dev tools | `/api/dev/*` | Local development data tools | Disabled outside development |
| Backend admin summary | `/api/admin/data/summary` | Local admin data foundation endpoint | Disabled outside development |
| Backend auth | `/api/auth/*` | Local Auth/RBAC v1 login, logout, me, CSRF | Development only |
| Backend user admin | `/api/admin/users/*` | Local admin user management API | Requires local admin permission |
| Backend homepage canvas read | `/api/homepage/canvas` GET | Local Journey canvas database read | Public read |
| Backend homepage canvas save | `/api/homepage/canvas` PUT | Local Journey canvas database save | Requires `homepage:edit` |
| Backend homepage canvas reset | `/api/homepage/canvas/reset` POST | Local Journey published canvas reset | Requires `homepage:edit` |
| Backend homepage public items | `/api/homepage/public` GET | Local homepage display item read | Public read |
| Backend homepage media file | `/api/homepage/media/{media_id}/file` GET | Safe published media file serving | Public only when enabled and referenced by a visible item |
| Backend homepage media admin file | `/api/homepage/media/{media_id}/admin-file` GET | Admin preview of uploaded media | Requires `homepage:edit` |
| Backend homepage media admin | `/api/homepage/media` GET/POST and `/api/homepage/media/{media_id}` PATCH | Local homepage media management | Requires `homepage:edit`; writes require CSRF |
| Backend homepage item admin | `/api/homepage/items` GET/POST/PATCH/DELETE | Local homepage display item management | Requires `homepage:edit`; writes require CSRF |
| Backend sticker tool bridge | `/api/sticker-tool/*` | Local Sticker_Preprocessor handoff adapter | Development and loopback only; requires auth, `homepage:edit`, and CSRF for writes |
| Backend debug status | `/api/debug/status` GET | Local diagnostics status | Development tools only |
| Backend client debug log | `/api/debug/client-log` POST | Local frontend diagnostics collection | Development tools only |

## Important Security Boundary

* Homepage entrance buttons are visual navigation only.
* Homepage entrance buttons are not authentication.
* Homepage entrance buttons are not authorization.
* Homepage entrance buttons are not access control.
* Homepage entrance buttons are not private data protection.
* On `localhost` and `127.0.0.1`, the homepage user entrance remains a
  local-development route into `login.html` or `hub.html` depending on the
  current local auth state.
* On every non-local hostname, the homepage user entrance remains visible but
  shows a `暂未开放` status badge and opens an informational notice instead of
  navigating to private pages.
* The homepage visitor message button is enabled in local and public modes.
* Visitor message submission uses the backend `/api/messages` route and never
  stores messages in browser persistence.
* Public homepage UI gating is not a production security boundary.
* Public homepage and Journey API requests use same-origin `/api` on non-local
  hosts so public browsers never call a visitor machine's `127.0.0.1:8000`.
* `login.html` is now wired to the local backend Auth/RBAC v1 login API.
* Local login creates a database-backed session and an HttpOnly browser cookie.
* Local login is for development only and is not production deployment.
* `hub.html` is still a static shell; it can display local auth state but is not a production security boundary.
* `journey.html` is public read-only for guests and normal users.
* Journey editing controls require `journey.html?edit=1` plus local `homepage:edit` permission.
* Journey reads shared canvas JSON from the local backend when available.
* Public `GET /api/homepage/canvas` omits the internal `updated_by_user_id`
  field; admin write/reset responses may retain internal updater metadata.
* Public `journey.html?view=public` should not call auth-state APIs just to
  decide that edit controls are unavailable.
* Journey keeps browser `localStorage` as a local draft and backend-unavailable fallback.
* Journey database save requires `homepage:edit`.
* Journey database reset requires `homepage:edit`.
* Journey Data URL image save is rejected by the backend until upload persistence exists.
* Homepage media upload now copies files into `data/uploads/homepage/` for local development.
* Homepage media APIs store project-relative paths only and must not store original local absolute paths.
* Uploading homepage media does not by itself publish the file publicly.
* Homepage public display only reads visible items and enabled registered media.
* Public media file serving requires enabled media referenced by at least one visible homepage item.
* Public media file paths must resolve under `HOMEPAGE_MEDIA_ROOT`.
* Homepage media upload validates allowed extensions against file signatures/magic bytes.
* Homepage media upload and homepage item write APIs require `homepage:edit` and CSRF.
* The homepage content admin page is a local-development UI for those APIs.
* The homepage content admin page must not be treated as production route protection by itself.
* Uploading media from the admin UI does not publish it until a visible homepage item references enabled media.
* Hiding a homepage item in the admin UI is a soft hide, not physical deletion.
* `/api/sticker-tool/*` is a local-development adapter for an external
  Sticker_Preprocessor checkout.
* The sticker tool adapter is disabled outside development, disabled when
  `ALLOW_DEV_TOOLS` is false, and restricted to loopback clients.
* Sticker tool routes require an authenticated user with `homepage:edit`; unsafe
  routes require CSRF.
* Sticker tool configuration and bridge artifacts remain in ignored local
  `.runtime/` paths and must not be synchronized through Git, PostgreSQL, SFTP,
  handoff metadata, or browser storage.
* The provider never calls Personal_Web APIs and never uploads media.
* A processed sticker is uploaded through the existing homepage media API only
  after asynchronous processing, backend result validation, browser Alpha
  analysis, Journey preview-matrix validation, and explicit accepted visual
  review all pass.
* Accepting a processed sticker adds it to the current Journey draft only;
  publication still requires the separate `保存画布` action.
* Local diagnostics write only to `.local_logs/`, which must not be committed to GitHub.
* Read `docs/11_HOMEPAGE_JOURNEY_FLOW_SPEC.md` before changing homepage/Journey flow behavior.
* There is no active hidden private entrance link in current HTML.
* Child app pages can still be opened directly by URL.
* Static pages must not contain real private data.
* Local backend and database foundations exist for development.
* Production backend deployment is not implemented.
* Local authentication/session handling and selected authorization checks are started for development.
* Production authentication, production authorization, and server deployment are not implemented.
* Future protected admin and data routes must follow `docs/10_BACKEND_DATABASE_ARCHITECTURE.md`.
* `/api/dev/*` must never be enabled in production.
* Message list, status update, soft delete, and admin summary endpoints are disabled in production until real auth exists.
* The database now has RBAC foundation tables and local development role checks for user management.
* RBAC schema and frontend hiding do not make static pages production-secure by themselves.
* Local code changes and merges do not mean public server deployment.
* Server/public deployment happens only after explicit user instruction.
* A future production Nginx allowlist must still deny direct public access to
  private, admin, debug, development, and write routes before public launch.
* The phase-1 production Nginx allowlist should expose only `/`, `index.html`,
  `journey.html`, their required static assets, `GET /api/homepage/canvas`, and
  `GET /api/homepage/media/{positive_integer}/file`.

## Current Data Rule

* Static files must not contain real private data.
* Markdown files must not contain real private data.
* HTML files must not contain real private data.
* CSS files must not contain real private data.
* JavaScript files must not contain real private data.
* JSON sample files must not contain real private data.
* Database files must not be committed.
* Uploads must not be committed.
* Logs must not be committed.
* Backups must not be committed.
* Production config must not be committed.
* Prototype `localStorage` is allowed for demos only.
* Prototype `localStorage` is not secure long-term storage.

## Future Required Security Model

The following items are still planned for production use:

* Production authentication.
* Production session hardening.
* Production authorization checks across every private API.
* Protected private routes.
* Protected APIs.
* User-specific data isolation.
* Secure server-side database.
* Server-side permission checks.
* Full RBAC enforcement on every private/admin API.
* Backup and recovery rules.
* Production secret management.

Frontend hiding and visual navigation are not enough.

Real private data must wait for the future security model.

## Merge Readiness Notes

* This document defines current security boundaries only.
* Static placeholders must not be treated as real protection.
* Real private data must wait for backend authentication and authorization.
* Future security implementation must use a dedicated branch.
* Manual verification should confirm that no current route claims real protection.

## Manual Security Review Checklist

* [ ] Public pages are clearly marked public.
* [ ] Placeholder private pages are not described as secure.
* [ ] Homepage entrance buttons are described as navigation only.
* [ ] Login is described as local development Auth/RBAC only.
* [ ] Hub is not described as production authorization.
* [ ] Child apps do not claim protected access.
* [ ] Real private data is not added to static files.
* [ ] Local backend/database foundations are described separately from production deployment.
* [ ] Backend and database status does not imply real authentication or authorization.
* [ ] Production authentication work is marked planned until implemented.
* [ ] Production authorization work is marked planned until implemented.


## Visitor Message Route Boundary

The visitor message modal on `index.html` is wired to the backend public create route.

Submitting the visitor message form persists through `POST /api/messages`.

The public create response is intentionally generic: `{ "accepted": true }`.

It must not return internal message IDs or expose admin lifecycle metadata.

The hidden honeypot field is never stored. If it is filled, the backend returns
the generic accepted response without creating a row.

`apps/messages/index.html` is a protected admin message management UI.

Admin message list, detail, update, soft-delete, and restore routes live under
`/api/admin/messages`.

Admin routes require:

* an authenticated session
* the `admin` role
* `visitor_messages:read` for read routes
* `visitor_messages:manage` for mutation routes
* CSRF validation for mutation routes

Visitor message delete is soft delete only.

Permanent purge is not implemented.

## Local Auth Development Startup

Use the Windows launcher from the repository root:

```powershell
.\start-local-dev.bat
```

Manual backend startup:

```powershell
cd backend
alembic upgrade head
python -m app.scripts.seed_dev_auth_users
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Manual frontend startup from the repository root:

```powershell
.\backend\.venv\Scripts\python.exe .\scripts\local_static_server.py --host 127.0.0.1 --port 4173 --root .
```

The local static server sends no-store headers for local HTML, JavaScript, CSS,
JSON, and source-map files so source changes do not leave stale browser
runtimes during development. This does not change production caching.

Homepage URL:

```text
http://127.0.0.1:4173/
```

Login URL:

```text
http://127.0.0.1:4173/login.html
```

Local development accounts:

```text
Admin: 1 / 1
User: 2 / 2
```

If backend or frontend readiness fails, check the named PowerShell server window.

If ports `8000` or `4173` are occupied, run:

```powershell
.\scripts\stop-local-dev.ps1
```
