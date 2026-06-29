# Backend and Database Plan

## Current Status

* Backend: local development skeleton started.
* Database: local PostgreSQL development foundation started.
* API: local development endpoints started.
* Authentication: local-development Auth/RBAC v1 started.
* Authorization: local-development RBAC checks started for admin user management.
* RBAC database foundation: implemented for local development schema only.
* Cloud sync: not implemented.
* Real login: local backend login exists for development; production login is not deployed.
* Real protected private routes: not implemented.
* This document is a planning overview plus current local backend status.
* No production backend is deployed yet.

## Why This Document Exists

* The project will eventually need backend and database support.
* Real private data should not stay in static files.
* Real private data should not stay in long-term `localStorage`.
* This document prevents future Codex work from inventing backend architecture freely.
* This document separates the local development backend foundation from future production backend work.
* Detailed backend/database architecture now lives in `docs/10_BACKEND_DATABASE_ARCHITECTURE.md`.

## Architecture Reference

Read `docs/10_BACKEND_DATABASE_ARCHITECTURE.md` before implementing backend, database, authentication,
authorization, admin data management, migrations, or backup features.

That document defines the target Nginx, backend API, PostgreSQL, admin data center,
test-data classification, soft-delete, purge, and phased implementation plan.

This file remains a concise planning overview.

It now acknowledges that a local backend/database skeleton exists.

It does not claim production backend, real authentication, or real authorization exists.

## Future Data Ownership Model

Refer to `docs/00_DESIGN_GUIDE.md` for the full ownership model.

* Code belongs in GitHub.
* Real private data does not belong in GitHub.
* Secrets do not belong in GitHub.
* Database files do not belong in GitHub.
* Uploads do not belong in GitHub.
* Logs do not belong in GitHub.
* Backups do not belong in GitHub.
* Production config does not belong in GitHub.
* Real data should eventually be created through website use and stored in a server-side database.

## Planned Future Components

The following components remain planned or incomplete for production use:

* Production authentication.
* Production authorization.
* Auth/RBAC hardening across all private APIs.
* Backup system.
* Admin/user roles.
* Server-side validation.
* Secret management.
* Production deployment configuration.
* Data migration tools.

The local FastAPI, PostgreSQL, Alembic, and visitor-message API foundation exists for development testing only.

It is not a production system.

The next planned major step is auth/RBAC v1 before database-backed homepage or Journey editing.

Future auth work should use admin-created accounts first.

Public registration is not part of the current plan.

## Phase 2 Local Foundation Status

Phase 2 has started in `backend/`.

Implemented for local development only:

* FastAPI backend skeleton.
* PostgreSQL configuration pattern.
* SQLAlchemy model foundation.
* Alembic baseline migration.
* Database health endpoint.
* `visitor_messages` table.
* `audit_logs` table.
* Development-only seed, reset, export, and admin summary endpoints.
* Local development `POST /api/messages` endpoint for backend testing.
* Database-level RBAC foundation tables:
  * `app_users`
  * `roles`
  * `permissions`
  * `user_roles`
* `role_permissions`
* `auth_sessions`
* Safe system `admin` role and permission definitions.
* Local `admin` and `user` roles.
* Local Auth/RBAC v1 permissions:
  * `homepage:view`
  * `homepage:edit`
  * `apps:access`
  * `users:manage`
  * `admin:access`

Not implemented yet:

* Production backend deployment.
* Production authentication.
* Production authorization.
* Full route permission checks across all private APIs.
* Production administrator account lifecycle.
* Production admin UI.
* Full front-end migration to backend APIs.
* Production visitor message submission.
* Task, health, subscription, or journey database persistence.

## RBAC Foundation Status

The local database now includes a small RBAC foundation.

It is designed for an admin-first account system without hard-coding the project as admin-only forever.

Current schema groups:

* `app_users`: future account records.
* `roles`: role definitions such as `admin`.
* `permissions`: permission definitions such as `visitor_messages:read`.
* `user_roles`: future user-to-role assignments.
* `role_permissions`: role-to-permission assignments.
* `auth_sessions`: database-backed local development browser sessions.

Seeded reference data:

* `admin` role.
* Admin data read/manage permissions.
* Visitor message read/manage permissions.
* Audit log read permission.

Development seed script:

* `python -m app.scripts.seed_dev_auth_users`
* Refuses to run unless `APP_ENV=development` and `ALLOW_DEV_TOOLS=true`.
* Creates or updates local admin username `1` and local user username `2`.
* Uses password hashes, not plaintext database storage.
* No token.

Conceptual separation:

* `data_scope` answers what kind of data a record is: production, test, demo, or imported.
* RBAC answers who can do what.
* Status and lifecycle fields answer whether a record is active, disabled, locked, archived, or soft-deleted.

## Planned User Roles

The following user modes remain planned at the application behavior layer:

* Owner / administrator.
* Allowed user / member.
* Public visitor.

The current static project does not enforce these roles.

The current static project does not isolate user-specific data.

The current static project does not protect private routes.

## Future App Data Areas

Future backend work may need to cover these data areas:

* Task List data.
* Health Management data.
* Special Subscription data.
* Journey page data.
* User/account data.
* Visitor Message data.
* Login session data.
* Backup metadata.

Do not create exact database schemas in documentation-formatting tasks.

Do not create database files in documentation-formatting tasks.

## Static Login Mock Boundary

`login.html` now calls the local backend `/api/auth/login` endpoint.

When the local backend and database are running, successful login creates a database-backed session and an HttpOnly cookie.

This is still local-development Auth/RBAC only.

It is not production authentication.

It does not make static route access production-secure.

Future real private access must use backend authentication, server-side session or token handling, database-backed accounts, roles, and permission checks.

Real passwords must never be stored in static HTML, CSS, JavaScript, Markdown, or GitHub files.

## Rules for Future Backend Work

* Backend work must be done in a dedicated branch.
* Database schema must be documented before implementation.
* API routes must be documented before implementation.
* Authentication must be designed before storing real private data.
* Authorization must be designed before storing real private data.
* No real private data should be committed during development.
* Any migration from `localStorage` to server storage must include a backup or export plan.
* Any production credential must be configured outside the public repository.
* Any backend branch must include explicit manual testing instructions.

## Production Features Not Implemented Yet

The following are not implemented in the current project:

* Production backend deployment.
* Production database deployment.
* Real authenticated production data system.
* Production login.
* Production authorization.
* Production session hardening.
* Real cloud sync.
* Real reminders.
* Real payment integration.
* Real subscription integration.
* Real user roles.
* Real protected APIs.

This document is a planning overview plus local foundation status.

## Manual Backend Planning Checklist

* [ ] The backend task is on a dedicated branch.
* [ ] The database schema is documented before implementation.
* [ ] API routes are documented before implementation.
* [ ] Authentication requirements are documented.
* [ ] Authorization requirements are documented.
* [ ] Real private data is not committed.
* [ ] Secrets are not committed.
* [ ] Backup and export needs are documented.
* [ ] Local development data is fake or test-only.
* [ ] Production deployment boundaries are documented.


## Visitor Message Data Model Status

The local development backend now implements a first `visitor_messages` table.

The current local table includes fields for:

* id
* created_at
* nickname
* contact
* message
* status
* data_scope
* source_app
* soft-delete metadata
* admin note

Future production work may add:

* reply status
* admin reply
* replied_at
* anti-spam metadata if future requirements allow

The current frontend visitor message modal is not wired to this backend yet.

## Visitor Message API Status

The local development backend now implements:

* `POST /api/messages`
* `GET /api/messages`
* `PATCH /api/messages/{message_id}/status`
* `POST /api/messages/{message_id}/soft-delete`

These endpoints are for local backend testing.

The existing static frontend does not submit to them yet.

Production visitor submission must wait for deployment review, rate limiting, abuse controls, logging policy, and privacy review.

Admin message management must require real administrator authorization before production use.
