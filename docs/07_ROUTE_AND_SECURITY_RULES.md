# Route and Security Rules

## Purpose

This document records current route categories and security boundaries.

It is not an implementation document.

It does not add authentication.

It does not add authorization.

It does not add backend route protection.

It explains what is public, what is a placeholder, and what must not be treated as secure yet.

## Current Route Categories

| Category | Route | Current status | Security status |
| --- | --- | --- | --- |
| Public page | `index.html` | Public cover page | Public |
| Public prototype | `journey.html` | Curved path timeline prototype | Public/static prototype |
| Login placeholder | `login.html` | Static login placeholder | Not real authentication |
| Private placeholder | `hub.html` | Static hub placeholder | Not real authorization |
| Child app prototype | `apps/tasks/index.html` | Task List prototype | Direct URL access possible |
| Child app prototype | `apps/health/index.html` | Health Management prototype | Direct URL access possible |
| Child app placeholder | `apps/special-subscription/index.html` | Special Subscription placeholder | Direct URL access possible |
| Admin UI prototype | `apps/messages/index.html` | Message Management prototype | Direct URL access possible |

## Important Security Boundary

* Hidden entrances are visual navigation only.
* Hidden entrances are not authentication.
* Hidden entrances are not authorization.
* Hidden entrances are not access control.
* Hidden entrances are not private data protection.
* `login.html` is a static placeholder.
* `hub.html` is a static placeholder.
* Child app pages can still be opened directly by URL.
* Static pages must not contain real private data.
* Future backend, authentication, authorization, and security are planned only.
* They are not implemented in the current project.

## Current Data Rule

* Static files must not contain real private data.
* Markdown files must not contain real private data.
* HTML files must not contain real private data.
* CSS files must not contain real private data.
* JavaScript files must not contain real private data.
* JSON sample files must not contain real private data.
* Database files must not be committed.
* Uploads must not be committed.
* Logs must not be committed.
* Backups must not be committed.
* Production config must not be committed.
* Prototype `localStorage` is allowed for demos only.
* Prototype `localStorage` is not secure long-term storage.

## Future Required Security Model

The following items are planned and not implemented yet:

* Real authentication.
* Server-side session or token handling.
* Authorization checks.
* Protected private routes.
* Protected APIs.
* User-specific data isolation.
* Secure server-side database.
* Server-side permission checks.
* Backup and recovery rules.
* Production secret management.

Frontend hiding and visual navigation are not enough.

Real private data must wait for the future security model.

## Merge Readiness Notes

* This document defines current security boundaries only.
* Static placeholders must not be treated as real protection.
* Real private data must wait for backend authentication and authorization.
* Future security implementation must use a dedicated branch.
* Manual verification should confirm that no current route claims real protection.

## Manual Security Review Checklist

* [ ] Public pages are clearly marked public.
* [ ] Placeholder private pages are not described as secure.
* [ ] Hidden entrances are described as navigation only.
* [ ] Static login is not described as real authentication.
* [ ] Static hub is not described as real authorization.
* [ ] Child apps do not claim protected access.
* [ ] Real private data is not added to static files.
* [ ] Backend work is marked planned until implemented.
* [ ] Database work is marked planned until implemented.
* [ ] Authentication work is marked planned until implemented.
* [ ] Authorization work is marked planned until implemented.


## Visitor Message Route Boundary

The visitor message modal on `index.html` is a front-end prototype only.

Submitting the visitor message form does not persist data in the current project.

`apps/messages/index.html` is an admin message management UI prototype only.

It is not a real protected admin page yet.

Direct URL access is possible until backend authentication and authorization exist.

Real visitor messages require backend API routes, database storage, and admin authorization before production use.
