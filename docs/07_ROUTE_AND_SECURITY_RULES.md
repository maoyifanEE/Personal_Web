# Route and Security Rules

## Purpose

This document records route categories and current security limits.

Current stage: **static front-end preview**. There is no backend, no database,
no real login, no authentication, and no authorization yet.

## Current Route Categories

| Category | Route | Current status | Security status |
| --- | --- | --- | --- |
| Public cover | `/` / `index.html` | Public cover homepage | Public page |
| Public/static prototype | `journey.html` | Curved Path Timeline prototype with placeholder data | Public page for now; editor is not secure admin |
| Login placeholder | `login.html` | Static login placeholder | Not real authentication |
| Private hub placeholder | `hub.html` | Static Personal Hub placeholder | Not protected; direct URL access is possible |
| Child app prototype | `apps/tasks/index.html` | Task List prototype | Not protected; no real backend sync |
| Child app prototype | `apps/health/index.html` | Health Management prototype | Not protected; health data is sensitive |
| Child app placeholder | `apps/special-subscription/index.html` | Special Subscription blank placeholder | Not protected; no subscription/payment logic |

## Important Security Boundary

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

Important limits:

- `login.html` is a static placeholder.
- `hub.html` and child app pages can still be opened directly by URL.
- Do not rely on hidden entrances to protect data.
- Do not store real private data until real authentication, backend, and
  database support exist.

## Data Rule

Static files, sample data, local JSON, Markdown, HTML, CSS, and JavaScript must
not contain:

- real private data
- secrets
- database files
- uploads
- logs
- backups
- production-only configuration

Prototype `localStorage` can be used for demos, but it is not secure long-term
private data storage.

## Future Required Security Model

The following items are **planned / not implemented yet**:

- real authentication
- server-side session or token handling
- authorization checks
- protected private routes
- protected APIs
- user-specific data isolation
- secure server-side database
- server-side permission checks

Frontend hiding and visual navigation are not enough.
