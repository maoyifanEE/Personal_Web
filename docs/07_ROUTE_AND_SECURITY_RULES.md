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
| Admin UI prototype | `apps/messages/index.html` | Message Management prototype | Direct URL access possible |
| Backend health | `/api/health` | Local backend health endpoint | Public status only |
| Backend message create | `/api/messages` | Local visitor message create endpoint | No auth yet |
| Backend dev tools | `/api/dev/*` | Local development data tools | Disabled outside development |
| Backend admin summary | `/api/admin/data/summary` | Local admin data foundation endpoint | Disabled outside development |
| Backend auth | `/api/auth/*` | Local Auth/RBAC v1 login, logout, me, CSRF | Development only |
| Backend user admin | `/api/admin/users/*` | Local admin user management API | Requires local admin permission |

## Important Security Boundary

* Homepage entrance buttons are visual navigation only.
* Homepage entrance buttons are not authentication.
* Homepage entrance buttons are not authorization.
* Homepage entrance buttons are not access control.
* Homepage entrance buttons are not private data protection.
* `login.html` is now wired to the local backend Auth/RBAC v1 login API.
* Local login creates a database-backed session and an HttpOnly browser cookie.
* Local login is for development only and is not production deployment.
* `hub.html` is still a static shell; it can display local auth state but is not a production security boundary.
* `journey.html` is public read-only for guests and normal users.
* Journey editing controls require local admin permission.
* Journey still stores prototype editor state in browser `localStorage`.
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

The visitor message modal on `index.html` is a front-end prototype only.

Submitting the visitor message form does not persist data in the current project.

The local backend `POST /api/messages` endpoint exists for backend testing only.

The existing static frontend visitor message modal is not wired to that endpoint.

`apps/messages/index.html` is an admin message management UI prototype only.

It is not a real protected admin page yet.

Direct URL access is possible until backend authentication and authorization exist.

Production visitor message submission must not be enabled until review is complete.

Required review areas include rate limiting, abuse controls, logging policy, privacy, and production deployment.

Admin message reading, status changes, and soft delete must require real authentication and authorization before production use.

The current static frontend must not be described as persisting visitor messages.

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
.\backend\.venv\Scripts\python.exe -m http.server 4173 --bind 127.0.0.1
```

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
