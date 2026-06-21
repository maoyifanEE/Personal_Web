# Route and Security Rules

This document records route categories and current security limits.

Current stage: static front-end preview. There is no backend, no database, no
real login, no authentication, and no authorization yet.

## 1. Public Routes

Public pages can be opened directly:

- `/` / `index.html`
- `journey.html`

`index.html` is the public cover homepage. `journey.html` is currently a
public/static curved path timeline prototype with placeholder data only.

## 2. Login Placeholder

- `login.html`

This page is only a static login placeholder. It does not authenticate anyone
and must not be treated as secure.

## 3. Private Placeholder Routes

- `hub.html`
- `apps/tasks/index.html`
- `apps/health/index.html`
- `apps/special-subscription/index.html`

These pages are private-tool placeholders or child app prototypes, but direct
URL access is still possible until real backend authentication and authorization
exist.

## 4. Hidden Entrance Rule

Hidden buttons and hidden links are visual navigation devices only.

They are not:

- access control
- authentication
- authorization
- route protection
- private data protection

Current hidden entrances:

- Hidden lower-left journey entrance: opens `journey.html`.
- Hidden private entrance: opens `login.html`.

Do not rely on hidden entrances to protect data.

## 5. Data Rule

Do not store real private data until real security exists.

Static files, sample data, local JSON, Markdown, HTML, CSS, and JavaScript must
not contain real private data, secrets, database files, uploads, logs, backups,
or production-only config.

## 6. Future Security Principle

Long-term private features require:

- real authentication
- real authorization
- server-side permission checks
- protected routes
- backend/API design
- server-side database ownership for real private data

Frontend hiding and visual navigation are not enough.
