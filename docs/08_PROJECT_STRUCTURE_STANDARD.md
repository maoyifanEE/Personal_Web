# Project Structure Standard

This document defines how `Personal_Web` should stay organized as more pages and
child apps are added.

## 1. Page Categories

Public pages:

- `index.html`
- `journey.html` while it remains a public/static prototype

Static private placeholders:

- `login.html`
- `hub.html`

Child apps:

- `apps/tasks/`
- `apps/health/`
- `apps/special-subscription/`

Prototype pages:

- Static pages or local browser prototypes without backend/database/auth.

Future backend/API:

- Not implemented yet.
- Must be designed separately before adding server code.

## 2. File Organization Rules

- Root pages stay in the project root.
- Child apps live under `apps/<module-name>/`.
- Each child app owns its `index.html`.
- Each child app owns CSS/JS only when needed.
- Shared styles should be introduced only when duplication becomes a real
  maintenance problem.
- Do not mix one app's logic into another app's files.
- Do not place real private data, secrets, database files, uploads, logs, or
  backups in the repository.

## 3. New Child App Checklist

- Add or update the module in `docs/05_APP_MODULES.md` first.
- Create `apps/<module-name>/index.html`.
- Add CSS/JS only if needed.
- Add a `hub.html` entry.
- Add a return link to `../../hub.html`.
- Add manual test notes.
- Do not add real data.
- Do not add backend/auth/database unless explicitly requested.

## 4. Data Rules

- Prototype `localStorage` is allowed only for demos.
- Real private data must move to backend/API and server-side database later.
- GitHub stores code, structure, styles, docs, and clearly fake sample data.
- GitHub must not store real private data or secrets.

## 5. Branch Rules

- Use `Feature/xxx` for new features.
- Use `BugFix/xxx` for fixes.
- Do not work directly on `main`.
- Do not merge or push unless explicitly instructed.
