# Project Overview

## 1. Project Name

`Personal_Web`

## 2. Project Purpose

`Personal_Web` is a long-term personal website and personal tools platform.

It has two long-term areas:

* Public visitor site: public homepage, visitor-facing content, and public Journey preview.
* Private personal hub: owner/admin tools and future member tools.

The current project is a local-development preview with a growing backend foundation.

It is not production-secure yet.

## 3. Current Main Pages

* `index.html`: public homepage with visible low-key entrance buttons.
* `journey.html`: public Journey sketch canvas preview; editor mode requires `?edit=1` and local `homepage:edit`.
* `login.html`: local-development Auth/RBAC login entry when the backend is running.
* `hub.html`: role-aware static hub shell for local development.
* `apps/tasks/index.html`: task prototype.
* `apps/health/index.html`: health prototype.
* `apps/special-subscription/index.html`: special subscription placeholder.
* `apps/messages/index.html`: visitor message management prototype.
* `apps/admin-users/index.html`: local admin user management preview.

## 4. Current Confirmed Direction

* The public homepage is the default public entry.
* `访客入口` is visible and opens `journey.html?view=public`.
* `用户入口` is visible and routes guests to `login.html`.
* If a local authenticated session already exists, `用户入口` can route to `hub.html`.
* Homepage entrance buttons are navigation only.
* Homepage entrance buttons are not security controls.
* Local backend, PostgreSQL, Alembic, visitor message, audit log, Auth/RBAC, and homepage canvas foundations exist.
* Production backend deployment is not implemented.
* Production authentication and production authorization are not implemented.
* Static pages are not production route protection.
* Real private data must not be committed to GitHub.

## 5. Backend Boundary

The `backend/` folder contains a local-development FastAPI and PostgreSQL foundation.

It includes local Auth/RBAC v1, database-backed sessions, RBAC tables, and selected local API checks.

It does not mean the public server has been deployed.

It does not make static private pages production-secure.

## 6. Documentation References

* `docs/07_ROUTE_AND_SECURITY_RULES.md`: current route and security boundaries.
* `docs/09_BACKEND_DATABASE_PLAN.md`: backend/database status and next-stage planning.
* `docs/10_BACKEND_DATABASE_ARCHITECTURE.md`: target architecture.
* `docs/11_HOMEPAGE_JOURNEY_FLOW_SPEC.md`: homepage, Journey, Hub, and diagnostics flow.

## 7. TBD

* Final public website content.
* Final visual theme details.
* Final child app list.
* Production deployment process.
* Production authentication and authorization hardening.
* Production backup and recovery policy.
