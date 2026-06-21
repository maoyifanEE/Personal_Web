# Project Structure Standard

## Purpose

This document defines how `Personal_Web` should stay organized as more pages and
child apps are added.

It is a structure standard only. It does not implement backend, database,
authentication, authorization, or API code.

## Page Categories

### Public Pages

- `index.html`
- `journey.html` while it remains a public/static prototype

### Static Private Placeholders

- `login.html`
- `hub.html`

These pages are visually private, but not secure until real backend
authentication and authorization exist.

### Child Apps

- `apps/tasks/`
- `apps/health/`
- `apps/special-subscription/`

### Prototype Pages

Prototype pages are static pages or local browser prototypes without
backend/database/auth.

### Future Backend/API

Backend/API work is not implemented yet. It must be designed separately before
server code is added.

## File Organization Rules

- Root pages stay in the project root.
- Child apps live under `apps/&lt;module-name&gt;/`.
- Each child app owns its own `index.html`.
- Each child app may own CSS/JS only when needed.
- Do not mix app logic across apps.
- Shared CSS/JS should be introduced only intentionally.
- Do not place real private data, secrets, database files, uploads, logs, or
  backups in the repository.

## New Child App Checklist

- [ ] Update `docs/05_APP_MODULES.md`.
- [ ] Create `apps/&lt;module-name&gt;/index.html`.
- [ ] Add app-local CSS only if needed.
- [ ] Add app-local JS only if needed.
- [ ] Add a `hub.html` entry.
- [ ] Add a return link to `../../hub.html`.
- [ ] Add manual test notes.
- [ ] Do not add real data.
- [ ] Do not add backend/database/auth unless explicitly requested.

## Data Rules

- Prototype `localStorage` is allowed only for demos.
- Real private data must not be committed.
- Real private data should eventually live in backend/API and server-side
  database.
- Secrets and production configs must not be committed.
- GitHub stores code, structure, styles, docs, and clearly fake sample data.
- GitHub must not store real private data or secrets.

## Branch Rules

- Use `Feature/xxx` for new features.
- Use `BugFix/xxx` for fixes.
- Do not work directly on `main`.
- Do not merge or push unless explicitly instructed.
