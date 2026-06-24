# Backend and Database Plan

## Current Status

* Backend: local development skeleton started.
* Database: local PostgreSQL development foundation started.
* API: local development endpoints started.
* Authentication: not implemented.
* Authorization: not implemented.
* Cloud sync: not implemented.
* Real login: not implemented.
* Real protected private routes: not implemented.
* This document is planning only.
* No production backend is deployed yet.

## Why This Document Exists

* The project will eventually need backend and database support.
* Real private data should not stay in static files.
* Real private data should not stay in long-term `localStorage`.
* This document prevents future Codex work from inventing backend architecture freely.
* This document marks future backend work as planned until explicitly implemented.
* Detailed backend/database architecture now lives in `docs/10_BACKEND_DATABASE_ARCHITECTURE.md`.

## Architecture Reference

Read `docs/10_BACKEND_DATABASE_ARCHITECTURE.md` before implementing backend, database, authentication, authorization, admin data management, migrations, or backup features.

That document defines the target Nginx, backend API, PostgreSQL, admin data center, test-data classification, soft-delete, purge, and phased implementation plan.

This file remains a concise planning overview and does not claim backend/database/auth exists.

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

The following components are planned only:

* Backend server.
* Authentication.
* Authorization.
* Database.
* Backup system.
* API layer.
* Admin/user roles.
* Server-side validation.
* Secret management.
* Production deployment configuration.
* Data migration tools.

None of these components are implemented by this document.

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

Not implemented yet:

* Production backend deployment.
* Real authentication.
* Real authorization.
* Production admin UI.
* Front-end migration to backend APIs.
* Task, health, subscription, or journey database persistence.

## Planned User Roles

The following roles are planned only:

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

`login.html` currently uses a fixed test-password redirect to `hub.html`.

This is planned only for static route verification.

It is not real authentication.

It is not authorization.

It does not create a session, token, cookie, or account record.

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

## Not Implemented Yet

The following are not implemented in the current project:

* Real backend.
* Real database.
* Real login.
* Real authorization.
* Real cloud sync.
* Real reminders.
* Real payment integration.
* Real subscription integration.
* Real user roles.
* Real protected APIs.

This document is only a plan.

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


## Planned Visitor Message Data Model

The following fields are planned only and are not implemented yet:

* id
* created_at
* nickname
* contact
* message_content
* read_status
* reply_status
* admin_reply
* replied_at
* visitor_ip_hash or anti-spam metadata if future requirements allow

These fields are not a committed database schema.

They document the expected future shape of visitor message storage.

## Planned Visitor Message API Examples

The following API routes are planned only and are not implemented:

* `POST /api/messages`
* `GET /api/admin/messages`
* `PATCH /api/admin/messages/:id/read`
* `PATCH /api/admin/messages/:id/reply`

Visitor submission must save to the server-side database only after backend, database, authentication, and authorization are implemented.

Admin message management must require real administrator authorization before production use.
