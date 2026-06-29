# Route and Security Rules

## Purpose

This document records current route categories and security boundaries.

It is not an implementation document.

It does not add authentication.

It does not add authorization.

It does not add backend route protection.

It explains what is public, what is a placeholder, and what must not be treated as secure yet.

## Current Route Categories

| Category | Route | Current status | Security status |
| --- | --- | --- | --- |
| Public page | `index.html` | Public cover page | Public |
| Public prototype | `journey.html` | Curved path timeline prototype | Public/static prototype |
| Login mock | `login.html` | Static fixed test-password route | Not real authentication |
| Private placeholder | `hub.html` | Static hub placeholder | Not real authorization |
| Child app prototype | `apps/tasks/index.html` | Task List prototype | Direct URL access possible |
| Child app prototype | `apps/health/index.html` | Health Management prototype | Direct URL access possible |
| Child app placeholder | `apps/special-subscription/index.html` | Special Subscription placeholder | Direct URL access possible |
| Admin UI prototype | `apps/messages/index.html` | Message Management prototype | Direct URL access possible |
| Backend health | `/api/health` | Local backend health endpoint | Public status only |
| Backend message create | `/api/messages` | Local visitor message create endpoint | No auth yet |
| Backend dev tools | `/api/dev/*` | Local development data tools | Disabled outside development |
| Backend admin summary | `/api/admin/data/summary` | Local admin data foundation endpoint | Disabled outside development |

## Important Security Boundary

* Homepage entrance buttons are visual navigation only.
* Homepage entrance buttons are not authentication.
* Homepage entrance buttons are not authorization.
* Homepage entrance buttons are not access control.
* Homepage entrance buttons are not private data protection.
* `login.html` is a static mock private entrance.
* The fixed test-password redirect is route verification only.
* The fixed test-password redirect is not authentication.
* The fixed test-password redirect is not security.
* `hub.html` is a static placeholder.
* Child app pages can still be opened directly by URL.
* Static pages must not contain real private data.
* Local backend and database foundations exist for development.
* Production backend deployment is not implemented.
* Real authentication, session handling, authorization enforcement, and frontend backend integration are not implemented.
* Future protected admin and data routes must follow `docs/10_BACKEND_DATABASE_ARCHITECTURE.md`.
* `/api/dev/*` must never be enabled in production.
* Message list, status update, soft delete, and admin summary endpoints are disabled in production until real auth exists.
* The database now has RBAC foundation tables, but route permission checks are not implemented yet.
* RBAC schema does not make any static page or API route production-secure by itself.
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

The following items are planned and not implemented yet:

* Real authentication.
* Server-side session or token handling.
* Authorization checks.
* Protected private routes.
* Protected APIs.
* User-specific data isolation.
* Secure server-side database.
* Server-side permission checks.
* RBAC enforcement on private/admin APIs.
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
* [ ] Static login is not described as real authentication.
* [ ] Static mock login is not described as real session creation.
* [ ] Static hub is not described as real authorization.
* [ ] Child apps do not claim protected access.
* [ ] Real private data is not added to static files.
* [ ] Local backend/database foundations are described separately from production deployment.
* [ ] Backend and database status does not imply real authentication or authorization.
* [ ] Authentication work is marked planned until implemented.
* [ ] Authorization work is marked planned until implemented.


## Visitor Message Route Boundary

The visitor message modal on `index.html` is a front-end prototype only.

Submitting the visitor message form does not persist data in the current project.

The local backend `POST /api/messages` endpoint exists for backend testing only.

The existing static frontend visitor message modal is not wired to that endpoint.

`apps/messages/index.html` is an admin message management UI prototype only.

It is not a real protected admin page yet.

Direct URL access is possible until backend authentication and authorization exist.

Production visitor message submission must not be enabled until rate limiting, abuse controls, logging policy, privacy review, and production deployment review are complete.

Admin message reading, status changes, and soft delete must require real authentication and authorization before production use.

The current static frontend must not be described as persisting visitor messages.
