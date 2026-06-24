# Design Guide

## Purpose

This is the highest-level project rule document for `Personal_Web`.

It defines code ownership, data ownership, deployment boundaries, privacy limits, and long-term maintenance principles.

Future Codex tasks must read this document before touching data, privacy, deployment, backend, or project structure.

This document is intentionally conservative.

It prevents accidental mixing of source code, private data, production secrets, and server runtime files.

## Project Role

* `Personal_Web` is a personal website and personal tools platform.
* It contains a public cover page and private-tool placeholders.
* The current implementation is a static front-end preview.
* Future backend and database work must be planned separately.
* A static page can demonstrate UI direction, but it cannot protect private data.
* A hidden link can hide visual navigation, but it cannot provide security.

## Code Ownership

* Source code belongs in GitHub.
* Static assets needed by the website should live inside the project folder.
* Local project files and deployed server files should remain consistent through Git and GitHub.
* The server should not become the normal place to directly edit source code.
* Do not rely on random local files outside the project folder.
* Do not depend on assets that exist only on one computer.
* Do not commit generated junk files.
* Do not commit editor-specific temporary files.

## Data Ownership

* Real private data does not belong in GitHub.
* Secrets do not belong in GitHub.
* Database files do not belong in GitHub.
* Uploads do not belong in GitHub.
* Logs do not belong in GitHub.
* Backups do not belong in GitHub.
* Production config does not belong in GitHub.
* Real account passwords do not belong in GitHub.
* Access tokens do not belong in GitHub.
* SSH private keys do not belong in GitHub.
* Production certificates do not belong in GitHub.

## Code, Deployment, and Data Ownership Model

The normal code flow is:

```text
Local computer
    -> GitHub repository
    -> Production server
```

Meaning:

* Local computer is the development environment.
* GitHub is the source code repository.
* Production server is the runtime environment.
* Code is edited and tested locally first.
* Reviewed code can be merged into `main`.
* The server should pull deployed code from GitHub.
* The server should not be used as the normal source editing place.

The normal private data flow is:

```text
Browser on phone or computer
    -> Website backend/API
    -> Server database
```

Meaning:

* Real task, health, login, reminder, weight, diet, or subscription data is created during website use.
* That real data should go through a backend API later.
* The production database should become the source of truth.
* GitHub should not receive real private data.

Summary sentence:

Code is developed locally, versioned in GitHub, and deployed to the server; real private data is created during website use and stored in the server-side database, never in GitHub.

## Current Storage Boundary

* `localStorage` is allowed only for static prototypes.
* `localStorage` is not final private data storage.
* Static pages can be used for UI experiments.
* Static pages can use fake data.
* Static pages can use placeholder content.
* Static pages must not contain real long-term private records.
* Real long-term private data requires backend, database, authentication, and authorization.
* Static mock login pages are route previews only and must not store real passwords.
* Data saved in one browser may not appear in another browser.
* Clearing browser data may delete local prototype data.

## Backend Boundary

* Backend is not implemented.
* Database is not implemented.
* API is not implemented.
* Authentication is not implemented.
* Authorization is not implemented.
* Cloud sync is not implemented.
* Future backend work must use a dedicated branch.
* Future backend work must include documentation updates.
* Future backend/database implementation must follow `docs/10_BACKEND_DATABASE_ARCHITECTURE.md`.
* Future backend work must not introduce real private data into GitHub.
* Future backend work must define storage, backup, and security boundaries before production use.

## Deployment Boundary

* The public website must keep required ICP information.
* The current ICP filing number belongs on the public homepage footer.
* Public security filing can be added later after approval.
* Deployment should use repository files, not hidden local-only resources.
* Do not commit server credentials.
* Do not commit production environment files.
* Do not commit backup archives.
* Do not commit server logs.

## Environment Variables and Secrets

* `.env.example` may be committed when it contains placeholder values only.
* `.env` must never be committed when it contains real secrets.
* Real production secrets must be stored only on the server or in a secure deployment environment.
* Production database credentials must not be public.
* JWT secrets must not be public.
* Admin passwords must not be public.
* API tokens must not be public.

## Local Development Data

Local development should use fake or test data.

Example local test data may include:

* Test task 1.
* Eat an apple.
* Ride bike for 30 minutes.
* Placeholder health record.
* Placeholder subscription item.

Real personal records should not be stored in the local repository.

## Production Data

* Production data should eventually live in the server database.
* The server database should become the source of truth for real user data.
* Phone and computer browsers should see the same private data only after they read from the same server database.
* Device synchronization should happen through the backend and database.
* Device synchronization should not happen through GitHub.
* Device synchronization should not happen through local project files.

## Backup Rule

* Production data and backup data are different concepts.
* Production data lives in the server database.
* Backups are for disaster recovery.
* Backups are not for daily editing.
* Backups should not be committed to GitHub.
* Backups should be encrypted or stored in a private location.
* Backup files should be ignored by Git.

## Recommended Server Folder Concept

```text
/var/www/Personal_Web/          # deployed public code pulled from GitHub
/etc/personal-web/.env          # private production configuration
/var/lib/personal-web/data/     # private database, uploads, and runtime data
/var/backups/personal-web/      # private backups
```

## Codex Prompt Rules

* Prompts must be detailed.
* Prompts should state the target branch.
* Prompts should state the scope.
* Prompts should state forbidden files.
* Prompts should state acceptance checks.
* Prompts should state final response format.
* Codex must not freely invent project direction.
* Codex must not work directly on `main` unless explicitly instructed.
* Codex must not merge unless explicitly instructed.
* Codex must not push unless explicitly instructed.
* Codex must not introduce backend, database, or auth without explicit request.

## Maintenance Rule

* Keep docs current when architecture changes.
* Keep README concise.
* Keep the app registry updated before changing child apps.
* Keep route and security rules clear.
* Keep backend and database planning marked as planned until implemented.
* Keep raw Markdown readable with real newline characters.
* Keep tables, checklists, bullets, and code fences properly formatted.

## Related Standards

* `docs/05_APP_MODULES.md`
* `docs/06_VISUAL_STYLE_GUIDE.md`
* `docs/07_ROUTE_AND_SECURITY_RULES.md`
* `docs/08_PROJECT_STRUCTURE_STANDARD.md`
* `docs/09_BACKEND_DATABASE_PLAN.md`
* `docs/10_BACKEND_DATABASE_ARCHITECTURE.md`
* `docs/PROJECT_HISTORY.md`


## Visitor Message Data Boundary

Visitor-submitted messages are private user-submitted data.

Visitor message data must not be stored in GitHub.

Visitor message data must not be hard-coded into static HTML, CSS, JavaScript, JSON, or Markdown files.

The current visitor message UI is a front-end prototype only.

Real visitor message submission requires backend, database, authentication for administrators, and authorization checks.

The static prototype must not use localStorage, sessionStorage, or cookies as fake message persistence.
