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

The Journey canvas and homepage media admin slices are local-development
exceptions that already talk to local backend APIs.

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

## Local Launcher Session Reset

The Windows local launcher opens the homepage with:

```text
http://127.0.0.1:4173/?devLogout=1
```

This flag is honored only on `127.0.0.1` and `localhost`.

When present, the homepage:

* logs `index.dev_session_reset.detected`
* calls the local logout API if available
* renders the homepage as guest/public navigation
* removes the query parameter with `history.replaceState`
* does not clear Journey drafts
* does not clear published database canvas state
* does not clear debug logs

The goal is to avoid an old admin session cookie making local startup look like
the app automatically starts as admin.

To preserve the existing browser session intentionally:

```powershell
.\start-local-dev.bat keep-session
```

or:

```powershell
.\scripts\start-local-dev.ps1 -KeepSession
```

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

For admins or users with `homepage:edit`, the Hub also shows:

```text
首页内容管理 -> ./apps/homepage-admin/index.html
```

Normal users must not see the homepage content management entry.

## Homepage Content Admin Flow

`apps/homepage-admin/index.html` is a local-development admin UI for the
existing homepage media and display item APIs.

It requires a valid local session and either the admin role or `homepage:edit`.

It can:

* upload image or video media into `data/uploads/homepage/`
* list and preview uploaded media through the admin-only file route
* edit media title, description, sort order, and enabled state
* create homepage display items
* edit visibility, metadata, sort order, display type, and media reference
* soft-hide display items
* preview the public `GET /api/homepage/public` payload
* find smoke-test display items for cleanup

Uploading media does not publish the file by itself.

A media file becomes publicly fetchable only when:

* the media row is enabled
* at least one visible homepage display item references it, or
* the published default Journey canvas references it by `mediaId`

Journey sticker upload also uses the homepage media upload API.

Runtime uploads under `data/uploads/homepage/` must not be committed to Git.

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

Journey uses PostgreSQL as the normal source of truth for the shared canvas.

Database saved canvas:

* read through `GET /api/homepage/canvas`
* saved through `PUT /api/homepage/canvas`
* visible to guests and normal users in public preview
* writable only by users with `homepage:edit`

Local browser cache:

* stored in `localStorage` only as an invisible fallback/cache
* must not be presented as the primary workflow
* must not silently override a newer database canvas
* should be cleared or refreshed after successful database save

The normal Journey editor workflow is:

* upload sticker media through the existing homepage media API
* edit strokes, nodes, and stickers on the canvas
* click one `????` button
* save the canvas JSON through `PUT /api/homepage/canvas`
* notify other same-origin Journey tabs to refresh when practical

The normal toolbar must not expose local-draft, manual database reload, database
publish, or reset-published-canvas wording.

Data URL images must not be published to the database.

Journey sticker images should be uploaded through the homepage media API and saved
as `mediaId` references before saving the canvas.

Background images and old local sticker drafts may still contain Data URLs as
local browser-only fallback data, but the database save must reject them.

The backend rejects any Data URL that remains in the canvas payload.

## Backend Canvas API

Current local-development API routes:

* `GET /api/homepage/canvas`
* `PUT /api/homepage/canvas`
* `POST /api/homepage/canvas/reset`

Read behavior:

* public
* returns the current shared canvas if it exists
* returns `exists=false` when no shared canvas has been saved

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
* is not part of the normal Journey editor toolbar workflow

## Diagnostics

Diagnostics are local-development only.

Frontend diagnostics:

* `debug-logger.js`
* `window.PersonalWebDebug`
* bounded browser `localStorage` debug entries
* JSON export from the browser
* text summary export from the browser
* optional upload to the local backend debug endpoint

`window.PersonalWebDebug` exposes:

* `log`
* `info`
* `warn`
* `error`
* `getLogs`
* `clearLogs`
* `exportLogs`
* `exportTextSummary`
* `exportFullDebugBundle`
* `snapshot`
* `sanitize`
* `sendToBackend`
* `sessionId`

Compatibility aliases:

* `entries`
* `clear`

Backend diagnostics:

* JSONL files under `.local_logs/`
* request start, complete, and error events
* RBAC permission grant/deny events
* CSRF grant/deny events
* homepage canvas read/save/reset events

Client auth/API diagnostics should include request metadata only:

* request ID
* HTTP method
* path
* status code
* duration in milliseconds
* error category
* whether CSRF was required
* whether a CSRF header was attached

Debug routes:

* `GET /api/debug/status`
* `POST /api/debug/client-log`
* `POST /api/debug/export-bundle`

These routes must be available only in local development tools mode.

They must not be treated as production logging infrastructure.

`POST /api/debug/client-log` must reject oversized payloads before writing logs:

* too many entries
* too large total JSON payload
* too large individual entry JSON payload

`POST /api/debug/export-bundle` creates and returns a local zip bundle in
development tools mode. It does not require auth because guest/public-flow logs
are often needed.

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

Diagnostic redaction must be precise. Generic application keys such as
`canvasKey`, `storageKey`, `schemaVersion`, `routeMode`, `path`, `url`, `role`,
`roles`, `permissions`, `revision`, `baseRevision`, `currentRevision`,
`strokeCount`, `nodeCount`, and `stickerCount` are not secrets and should remain
visible in local diagnostics.

Local debug outputs must not be committed to GitHub.

## Local Debug Collection

The debug bundle script is:

```powershell
.\scripts\collect-debug-logs.ps1
```

It collects local `.local_logs/` files and Git status into a local zip bundle.

It creates both:

* a `.zip` debug bundle
* a text summary file

The script collects only local troubleshooting context:

* Git state
* environment summary without `.env` contents
* local port listeners for `8000` and `4173`
* backend status probes without cookies or auth headers
* `.local_logs/backend`
* `.local_logs/frontend`
* `.local_logs/launcher`
* a safe tracked file inventory

The script must not collect:

* `.env`
* `.venv`
* database files
* uploads
* backups
* previous debug bundles
* large binary files

The bundle and summary are ignored by Git.

Recommended no-terminal workflow for admins:

1. Log in as a local development admin.
2. Open `hub.html`.
3. Click the visible `本地调试日志` card.
4. Click `导出完整调试包 ZIP`.
5. Send the downloaded zip to ChatGPT.

Guest and normal user behavior:

* Guests cannot export the complete debug ZIP.
* Normal authenticated users cannot export the complete debug ZIP.
* The direct `debug-log.html` page may still show local browser logs.
* Browser-only JSON/TXT export may remain available for local frontend logs.
* Complete debug ZIP export still requires an admin login.

Direct URL fallback:

```text
http://127.0.0.1:4173/debug-log.html
```

CLI fallback:

```powershell
.\scripts\collect-debug-logs.ps1
```

The Hub debug card and homepage debug link must be visible only when both are true:

* the host is `localhost` or `127.0.0.1`
* the current authenticated account is an admin or has `admin:access`

完整调试包 ZIP 导出是本地开发功能，但仍然要求 admin 登录。

Review the zip before sharing it if privacy is a concern.

The browser-triggered zip includes:

* sanitized browser debug logs
* browser snapshot and page summary
* backend logs under `.local_logs/backend`
* frontend logs under `.local_logs/frontend`
* launcher logs under `.local_logs/launcher`
* safe git and environment summaries

The browser-triggered zip excludes:

* `.env`
* `.venv`
* database files
* uploads
* backups
* previous debug bundles
* raw Data URLs
* cookies, tokens, passwords, secrets, and full database URLs

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
