# Homepage and Journey Flow Specification

## Purpose

This document defines the expected local-development flow for the homepage,
login, Hub, Journey public preview, Journey editor, and diagnostics.

It is the acceptance reference for the Homepage/Journey canvas framework.

It does not deploy production services.

It does not make static routes production-secure.

## Current Boundary

The project now has a local FastAPI and PostgreSQL foundation.

The project also has local-development Auth/RBAC v1.

Production deployment is not implemented.

Production authentication and production authorization are not implemented.

Static frontend pages are not fully wired to backend APIs yet.

Homepage entrance buttons are navigation only.

They are not security controls.

## Homepage Entrances

The homepage has two visible low-key entrance buttons:

* `访客入口`
* `用户入口`

The visitor entrance must always open the public Journey preview:

```text
./journey.html?view=public
```

The user entrance is auth-aware:

* If the browser has a valid local session, it points to `./hub.html`.
* If the browser is not authenticated, it points to `./login.html`.
* If the backend is unavailable, it falls back to `./login.html`.

The ICP footer must remain visible and must link to:

```text
https://beian.miit.gov.cn/
```

Entrance buttons must not overlap the ICP footer on mobile.

## Login Flow

`login.html` is connected to the local backend Auth/RBAC v1 API.

When the page opens:

* It checks the current auth state.
* If already authenticated, it redirects to `hub.html`.
* If unauthenticated, it stays on the login form.
* If the backend is unavailable, it stays usable and shows a clear error when login is attempted.

Login errors should distinguish:

* backend unavailable
* invalid credentials
* backend setup or database/seed error

Credentialed fetch and CSRF behavior must be preserved.

## Hub Flow

`hub.html` is a local role-aware static hub shell.

It is not production route protection.

For authenticated local users, the Hub shows private app previews.

For admins or users with `homepage:edit`, the Hub shows:

```text
首页画布编辑 -> ./journey.html?edit=1
```

Normal users must not see the Journey editor entry.

## Journey Mode Model

Journey has two route modes:

* public preview
* editor mode

Public preview is the default.

The following URLs are public preview:

```text
./journey.html
./journey.html?view=public
```

Editor mode requires both conditions:

* URL contains `?edit=1`
* the current local user has `homepage:edit` permission or admin role

If either condition is missing, Journey remains in preview mode.

Guests and normal users can view the published canvas.

They cannot mutate the canvas.

Mutation handlers must guard editor actions before changing state.

## Canvas State Sources

Journey uses two different storage concepts.

Local browser draft:

* stored in `localStorage`
* useful while editing locally
* not the published source of truth
* not shared across browsers

Database published canvas:

* read through `GET /api/homepage/canvas`
* saved through `PUT /api/homepage/canvas`
* reset through `POST /api/homepage/canvas/reset`
* visible to guests and normal users in public preview
* writable only by users with `homepage:edit`

The UI must clearly distinguish:

* `保存本地草稿`
* `发布到数据库`
* `重新加载数据库`
* `重置发布画布`

Data URL images must not be published to the database.

The backend rejects them until real upload persistence exists.

## Backend Canvas API

Current local-development API routes:

* `GET /api/homepage/canvas`
* `PUT /api/homepage/canvas`
* `POST /api/homepage/canvas/reset`

Read behavior:

* public
* returns the current shared canvas if it exists
* returns `exists=false` when no shared canvas has been published

Save behavior:

* requires authenticated local session
* requires CSRF token
* requires `homepage:edit`
* rejects stale revisions with `409`
* rejects Data URL payloads with `400`

Reset behavior:

* requires authenticated local session
* requires CSRF token
* requires `homepage:edit`
* removes the published shared canvas row
* does not delete the browser-local draft

## Diagnostics

Diagnostics are local-development only.

Frontend diagnostics:

* `debug-logger.js`
* `window.PersonalWebDebug`
* bounded browser `localStorage` debug entries
* JSON export from the browser
* optional upload to the local backend debug endpoint

Backend diagnostics:

* JSONL files under `.local_logs/`
* request start, complete, and error events
* RBAC permission grant/deny events
* CSRF grant/deny events
* homepage canvas read/save/reset events

Debug routes:

* `GET /api/debug/status`
* `POST /api/debug/client-log`

These routes must be available only in local development tools mode.

They must not be treated as production logging infrastructure.

Sensitive values must be redacted:

* passwords
* tokens
* sessions
* CSRF values
* cookies
* authorization headers
* database URLs
* secrets
* Data URL payloads

Local debug outputs must not be committed to GitHub.

## Local Debug Collection

The debug bundle script is:

```powershell
.\scripts\collect-debug-logs.ps1
```

It collects local `.local_logs/` files and Git status into a local zip bundle.

The bundle is ignored by Git.

## Non-Goals

This flow does not:

* deploy to production
* configure Nginx
* configure Certbot
* create a production database
* add upload persistence
* make static pages production-secure
* add public registration
* expose the database directly to browsers

## Acceptance Checklist

* [ ] Homepage opens.
* [ ] `访客入口` opens `journey.html?view=public`.
* [ ] `用户入口` opens `login.html` when unauthenticated.
* [ ] `用户入口` opens `hub.html` when authenticated.
* [ ] Login redirects authenticated users to Hub.
* [ ] Hub shows Journey editor entry only for admin or `homepage:edit`.
* [ ] Journey default route is public preview.
* [ ] Journey editor opens only with `?edit=1` and permission.
* [ ] Local draft save and database publish messages are distinct.
* [ ] Published canvas can be reloaded.
* [ ] Published canvas can be reset by an authorized admin.
* [ ] Debug log page opens.
* [ ] Frontend debug export works.
* [ ] Backend receives client debug logs in development mode.
* [ ] `.local_logs/` stays out of Git.
