# Backend and Database Plan

## Current Status

* Backend: not implemented.
* Database: not implemented.
* API: not implemented.
* Authentication: not implemented.
* Authorization: not implemented.
* Cloud sync: not implemented.
* Real login: not implemented.
* Real protected private routes: not implemented.
* This document is planning only.
* No backend code should be added in documentation-formatting tasks.

## Why This Document Exists

* The project will eventually need backend and database support.
* Real private data should not stay in static files.
* Real private data should not stay in long-term `localStorage`.
* This document prevents future Codex work from inventing backend architecture freely.
* This document marks future backend work as planned until explicitly implemented.

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
* Login session data.
* Backup metadata.

Do not create exact database schemas in documentation-formatting tasks.

Do not create database files in documentation-formatting tasks.

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
