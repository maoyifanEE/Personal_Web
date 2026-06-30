# Project Structure Standard

## Purpose

This document defines how `Personal_Web` should stay organized as more pages, child apps, and future backend plans are added.

It is a structure standard.

It does not implement backend code.

It does not implement database code.

It does not implement authentication.

It does not implement authorization.

## Page Categories

* Public pages.
* Static private placeholders.
* Child apps.
* Prototype pages.
* Future backend/API areas.

Public pages are available without private access control.

Static private placeholders are visually private but not secure.

Child apps live under `apps/` and are linked from the hub.

Current child app folders include `apps/tasks/`, `apps/health/`, `apps/special-subscription/`, `apps/messages/`, and `apps/admin-users/`.

Prototype pages may include local-only editor behavior.

Future backend/API areas must be planned before implementation.

## Backend Folder Rules

The backend lives under `backend/`.

Backend code must not be placed in the repository root.

Current backend areas:

* `backend/app/` for FastAPI application code.
* `backend/app/api/` for API routers.
* `backend/app/core/` for configuration and safety helpers.
* `backend/app/db/` for SQLAlchemy base and sessions.
* `backend/app/models/` for ORM models.
* `backend/app/schemas/` for Pydantic schemas.
* `backend/app/services/` for service-layer logic.
* `backend/app/scripts/` for local development helper scripts.
* `backend/alembic/` for migration scripts.

Backend rules:

* Keep `.env.example` committed with fake placeholders only.
* Do not commit `backend/.env`.
* Do not commit database files, logs, uploads, or backups.
* Development-only API routes must fail safely outside development.
* Production auth and admin UI must be implemented in later dedicated tasks.
* RBAC ORM models belong in `backend/app/models/`.
* RBAC migrations may seed system role and permission definitions only.
* RBAC migrations must not seed real users, real passwords, sessions, or tokens.
* Development-only auth seed users belong in explicit scripts under `backend/app/scripts/`.
* Development auth seed scripts must refuse production environments.

## Root Page Rules

* Root pages stay in the project root.
* Root pages currently include `index.html`, `journey.html`, `login.html`, and `hub.html`.
* Root CSS and JavaScript should remain focused on root pages.
* Journey-specific CSS and JavaScript should stay in `journey.css` and `journey.js`.
* Root pages should not import child app logic.

## Local Vendor Rules

* Third-party front-end libraries should live under `vendor/library-name/`.
* The current project does not have an active local vendor dependency.
* Vendor libraries must include their license file.
* Vendor libraries must be loaded from local project files, not from a CDN.
* Do not add `node_modules` or package lock files for static vendor files unless a future build task explicitly introduces npm tooling.

## Child App Rules

* Child apps live under `apps/module-name/`.
* Each child app should have `apps/module-name/index.html`.
* Each child app may own CSS only when styling is needed.
* Each child app may own JavaScript only when behavior is needed.
* Child apps should include a return link to `../../hub.html`.
* Do not mix app logic across apps.
* Do not make one child app depend on another child app local files.
* Shared CSS or JavaScript should be introduced only intentionally.
* Do not store real private data in child app static files.

## Documentation Rules

* README should remain a concise project overview.
* `docs/00_DESIGN_GUIDE.md` owns data and deployment boundaries.
* `docs/05_APP_MODULES.md` owns the child app registry.
* `docs/06_VISUAL_STYLE_GUIDE.md` owns visual and navigation style rules.
* `docs/07_ROUTE_AND_SECURITY_RULES.md` owns route and security boundaries.
* `docs/09_BACKEND_DATABASE_PLAN.md` owns backend/database status and next-stage planning.
* `docs/10_BACKEND_DATABASE_ARCHITECTURE.md` owns target backend/database architecture and implementation status.
* `docs/PROJECT_HISTORY.md` records completed project changes.
* Markdown source files must use real newline characters.
* Tables must have one row per source line.
* Checklist items must have one item per source line.

## New Child App Checklist

* [ ] Update `docs/05_APP_MODULES.md`.
* [ ] Create `apps/module-name/index.html`.
* [ ] Add app-local CSS only if needed.
* [ ] Add app-local JS only if needed.
* [ ] Add return link to `../../hub.html`.
* [ ] Add `hub.html` entry.
* [ ] Add manual test checklist.
* [ ] Do not add real data.
* [ ] Do not add backend/database/auth unless explicitly requested.
* [ ] Do not modify unrelated child apps.

## Data Rules

* `localStorage` is allowed for prototypes only.
* Real private data must not be committed.
* Real private data should eventually live in backend/API and server-side database.
* Secrets and production configs must not be committed.
* Database files must not be committed.
* Uploads must not be committed.
* Logs must not be committed.
* Backups must not be committed.

## Branch Rules

* Use `Feature/xxx` for new features.
* Use `BugFix/xxx` for fixes.
* Do not work directly on `main` unless explicitly instructed.
* Do not merge unless explicitly instructed.
* Do not push unless explicitly instructed.
* Do not delete existing branches unless explicitly instructed.
* Old remote branches may be deleted only after verifying they are fully merged into `origin/main`.
* Never delete `main`.
* Never delete the active working branch.
* Preserve unmerged backup branches unless the user explicitly approves deletion.
* Prefer `git branch -d <branch-name>` for safe local branch cleanup.
* Use force deletion only after explicit user approval.

## Merge Readiness Notes

* Structure-only changes should not modify app behavior.
* Documentation changes should remain separate from feature implementation.
* Child app additions must update the app registry first.
* Backend and database structure must not be introduced casually.
* Manual review should confirm that only intended documentation files changed.

## Manual Structure Review Checklist

* [ ] Root pages remain in the project root.
* [ ] Child apps remain under `apps/`.
* [ ] App-specific files stay inside the app folder.
* [ ] Documentation files are readable raw Markdown.
* [ ] No real private data is committed.
* [ ] No backend code is introduced without request.
* [ ] No database files are introduced without request.
* [ ] No unrelated app behavior changes are included.
* [ ] Branch name matches the task type.
* [ ] Commit scope matches the documented task.


## Message App Structure Rule

The message management prototype must remain under `apps/messages/`.

Message management files must stay separate from task, health, and special subscription app files.

Future backend message APIs must not be implemented inside the static child app folder.

Future message persistence work must update the backend/database plan before implementation.
