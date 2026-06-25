# App Modules

## Purpose

This document is the authoritative child app registry for `Personal_Web`.

It must be updated before adding or changing child apps.

It records app path, status, storage, backend status, data sensitivity, and current limitations.

It helps keep future app work scoped and maintainable.

It also prevents placeholder pages from being mistaken for production systems.

## Current Modules

| Module | Chinese name | Path | Status | Storage | Backend | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Task List | 任务清单 | `apps/tasks/index.html` | Static/local prototype | Browser/local prototype storage if implemented | Not implemented | Real sync requires future backend, database, and authentication. |
| Health Management | 健康管理 | `apps/health/index.html` | Static/local prototype | Browser/local prototype storage if implemented | Not implemented | Health-related data is sensitive; do not commit real private data. |
| Special Subscription | 特别订阅 | `apps/special-subscription/index.html` | Blank placeholder | None | Not implemented | No real subscription, payment, API, or backend logic yet. |

## Module Details

### Task List

* Chinese display name: 任务清单
* English/internal name: Task List
* Path: `apps/tasks/index.html`
* Current status: static/local prototype
* Backend status: not implemented
* Database status: not implemented
* Cloud sync status: not implemented
* Data sensitivity: private task data can become sensitive
* Current limitation: no production sync or real user isolation
* Notes: real sync requires future backend, database, and authentication

### Health Management

* Chinese display name: 健康管理
* English/internal name: Health Management
* Path: `apps/health/index.html`
* Current status: static/local prototype
* Backend status: not implemented
* Database status: not implemented
* Cloud sync status: not implemented
* Data sensitivity: health-related data is sensitive
* Current limitation: no production sync or real user isolation
* Notes: do not commit real health records to GitHub

### Special Subscription

* Chinese display name: 特别订阅
* English/internal name: Special Subscription
* Path: `apps/special-subscription/index.html`
* Current status: blank placeholder
* Backend status: not implemented
* Database status: not implemented
* Cloud sync status: not implemented
* Data sensitivity: none in the current placeholder
* Current limitation: no real subscription logic exists
* Notes: no payment, account binding, external API, or backend logic exists

### Visitor Messages

* Chinese display name: 留言 / 留言管理
* English/internal name: Visitor Messages / Message Management
* Path: `apps/messages/index.html`
* Current status: static/front-end prototype
* Backend status: not implemented
* Database status: not implemented
* Cloud sync status: not implemented
* Storage: none in current phase; no localStorage message persistence
* Data sensitivity: visitor-submitted message data is private user-submitted data
* Current limitation: visitor submissions are not saved
* Notes: real persistence requires backend, database, authentication, and admin authorization

## Future / Proposed Modules

* Future modules are planned only unless listed in Current Modules.
* Future modules are not implemented.
* Do not treat future modules as existing apps.
* Do not create future modules without explicit user request.
* Do not add hub entries for future modules unless the placeholder itself is being created.
* Do not add storage models for future modules until requirements are defined.

## Child App Development Rules

* Child apps live under `apps/module-name/`.
* Each child app should have `apps/module-name/index.html`.
* CSS should be app-local unless shared styles are intentionally introduced.
* JavaScript should be app-local unless shared logic is intentionally introduced.
* Each child app should include a return link to `../../hub.html`.
* Do not mix one app logic into another app files.
* Do not store real private data in static files.
* Do not add backend, database, or auth inside a child app branch unless explicitly requested.
* Do not add external APIs casually.
* Do not add payment logic casually.
* Do not expose private app content from the public cover homepage.
* Document data model changes before implementation.
* Keep placeholder content clearly fake.
* Keep private app user-facing UI in Simplified Chinese by default.

## New Child App Template

Use this template before creating a new child app.

### Module name

* Chinese display name:
* English/internal name:
* Path: `apps/module-name/index.html`
* Status:
* Visibility:
* Data sensitivity:
* Storage:
* Backend required:
* Authentication required:
* Main purpose:
* Current limitations:
* Do not implement yet:
* Manual test URL:

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
* [ ] Do not modify unrelated apps.

## Manual Review Checklist

* [ ] The app path matches the registry.
* [ ] The app has a clear current status.
* [ ] The app has a documented storage boundary.
* [ ] The app does not commit real private data.
* [ ] The app does not claim backend support unless implemented.
* [ ] The app does not claim database support unless implemented.
* [ ] The app does not claim real authentication unless implemented.
* [ ] The app links back to `../../hub.html` when appropriate.
* [ ] The app does not break other child apps.
* [ ] The app uses readable Markdown documentation.

## Current Non-Goals

* The child app registry does not implement application behavior.
* The child app registry does not define a database schema.
* The child app registry does not define production API routes.
* The child app registry does not provide access control.
* Those topics require future dedicated planning and implementation work.
