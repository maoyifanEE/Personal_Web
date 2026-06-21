# App Modules

## Purpose

This document is the authoritative child app registry and module standard for
`Personal_Web`.

Update this document before adding a new child app or changing an existing child
app's purpose, route, storage model, or security expectations.

Current project stage: **static front-end preview**. Child apps may be local or
static prototypes, but they are not secure production apps yet.

## Current Modules

| Module               | Chinese name | Path                                   | Status                 | Storage                                        | Backend         | Notes                                                              |
| -------------------- | ------------ | -------------------------------------- | ---------------------- | ---------------------------------------------- | --------------- | ------------------------------------------------------------------ |
| Task List            | 任务清单     | `apps/tasks/index.html`                | Static/local prototype | Browser/local prototype storage if implemented | Not implemented | Real sync requires future backend, database, and authentication.   |
| Health Management    | 健康管理     | `apps/health/index.html`               | Static/local prototype | Browser/local prototype storage if implemented | Not implemented | Health-related data is sensitive; do not commit real private data. |
| Special Subscription | 特别订阅     | `apps/special-subscription/index.html` | Blank placeholder      | None                                           | Not implemented | No real subscription, payment, API, or backend logic yet.          |

## Module Details

### Task List

- Chinese display name: 任务清单
- English/internal name: Task List
- Path: `apps/tasks/index.html`
- Status: static/local front-end prototype
- Visibility: private hub child app placeholder
- Storage: browser/local prototype storage if implemented
- Backend: not implemented
- Database: not implemented
- Authentication required: future yes, current no
- Real private data: not recommended until backend/auth exists
- Manual test URL: `http://127.0.0.1:4173/apps/tasks/index.html`

### Health Management

- Chinese display name: 健康管理
- English/internal name: Health Management
- Path: `apps/health/index.html`
- Status: static/local front-end prototype
- Visibility: private hub child app placeholder
- Data sensitivity: health-related, sensitive
- Storage: browser/local prototype storage if implemented
- Backend: not implemented
- Database: not implemented
- Authentication required: future yes, current no
- Real private data: do not commit; long-term real use requires backend/auth
- Manual test URL: `http://127.0.0.1:4173/apps/health/index.html`

### Special Subscription

- Chinese display name: 特别订阅
- English/internal name: Special Subscription
- Path: `apps/special-subscription/index.html`
- Status: blank placeholder
- Visibility: private hub child app placeholder
- Storage: none
- Backend: not implemented
- Database: not implemented
- Authentication required: future yes, current no
- Subscription/payment logic: none
- Purpose: reserved for future special subscription management after
  requirements are defined
- Manual test URL:
  `http://127.0.0.1:4173/apps/special-subscription/index.html`

## Future / Proposed Modules

These are ideas only. They are **planned only / not implemented** and must not
be documented as existing behavior.

- Exercise Tracker
- Korean Learning
- Project Manager

## Child App Development Rules

- Update this document before creating or changing a child app.
- Child apps live under `apps/&lt;module-name&gt;/`.
- Each child app should have `apps/&lt;module-name&gt;/index.html`.
- CSS/JS should be app-local unless shared files are intentionally introduced.
- Each child app should include a return link to `../../hub.html`.
- Do not mix one app's logic into another app.
- Do not store real private data in static files.
- Do not casually add backend/database/auth in app feature branches.
- Data model changes must be documented before implementation.
- Future server sync must follow `docs/00_DESIGN_GUIDE.md`.
- Route and access expectations must follow
  `docs/07_ROUTE_AND_SECURITY_RULES.md`.
- Project file organization should follow
  `docs/08_PROJECT_STRUCTURE_STANDARD.md`.

## New Child App Template

### `<Module name>`

- Chinese display name:
- English/internal name:
- Path:
- Status:
- Visibility:
- Data sensitivity:
- Storage:
- Backend required:
- Authentication required:
- Main purpose:
- Current limitations:
- Do not implement yet:
- Manual test URL:

## New Child App Checklist

- [ ] Update `docs/05_APP_MODULES.md`.
- [ ] Create `apps/&lt;module-name&gt;/index.html`.
- [ ] Add app-local CSS only if needed.
- [ ] Add app-local JS only if needed.
- [ ] Add return link to `../../hub.html`.
- [ ] Add `hub.html` entry.
- [ ] Add manual test checklist.
- [ ] Do not add real data.
- [ ] Do not add backend/database/auth unless explicitly requested.
