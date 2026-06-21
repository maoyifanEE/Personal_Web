# App Modules

This document is the child app registry and module standard for `Personal_Web`.

Current project stage: static front-end preview. Child apps may be local/static
prototypes, but they are not secure production apps yet.

## Current Child Apps

### Task List

- Chinese display name: 任务清单
- English/internal name: Task List
- Path: `apps/tasks/index.html`
- Status: static/local front-end prototype
- Visibility: private hub child app placeholder
- Data: browser/local prototype data only
- Backend: none
- Database: none
- Authentication required: future yes, current no
- Real private data: not recommended until backend/auth exists
- Notes: current prototype may use `localStorage`; this is not cloud sync and is
  not long-term private data storage.
- Manual test URL: `http://127.0.0.1:4173/apps/tasks/index.html`

### Health Management

- Chinese display name: 健康管理
- English/internal name: Health Management
- Path: `apps/health/index.html`
- Status: static/local front-end prototype
- Visibility: private hub child app placeholder
- Data sensitivity: health-related, sensitive
- Backend: none
- Database: none
- Authentication required: future yes, current no
- Real private data: do not commit; long-term real use requires backend/auth
- Notes: current prototype may use `localStorage`; do not treat it as secure or
  synced health storage.
- Manual test URL: `http://127.0.0.1:4173/apps/health/index.html`

### Special Subscription

- Chinese display name: 特别订阅
- English/internal name: Special Subscription
- Path: `apps/special-subscription/index.html`
- Status: blank placeholder
- Visibility: private hub child app placeholder
- Data: none
- Backend: none
- Database: none
- Authentication required: future yes, current no
- Subscription/payment logic: none
- Purpose: reserved for future special subscription management after
  requirements are defined
- Manual test URL:
  `http://127.0.0.1:4173/apps/special-subscription/index.html`

## Future / Proposed Modules

These are ideas only. They are not implemented apps and should not be documented
as existing behavior.

- Exercise Tracker
- Korean Learning
- Project Manager

## Child App Development Rules

- Each child app must live under `apps/<module-name>/`.
- Each child app should have its own `index.html`.
- Each child app should use its own CSS file if styling is needed.
- Each child app should use its own JS file only if behavior is needed.
- Child apps should include a return link to `../../hub.html`.
- Child apps should not depend on unrelated app CSS/JS.
- Do not store real private data in static files.
- Do not add backend/database/auth casually inside a child app branch.
- Any data model change must be documented before implementation.
- Any future server sync must follow `docs/00_DESIGN_GUIDE.md`.
- Route and access expectations must follow
  `docs/07_ROUTE_AND_SECURITY_RULES.md`.
- Project file organization should follow
  `docs/08_PROJECT_STRUCTURE_STANDARD.md`.

## Future Child App Template

### Module name

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

- Add or update the module entry in this document first.
- Create `apps/<module-name>/index.html`.
- Add CSS/JS only if needed.
- Add a `hub.html` entry.
- Add a return link to `../../hub.html`.
- Add manual test notes.
- Do not add real data.
- Do not add backend/auth/database unless explicitly requested.
