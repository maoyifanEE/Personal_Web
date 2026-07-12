# Homepage Remote Publish Plan

## Purpose

This document defines the first safe path for publishing the Homepage/Journey
public display to a remote server.

This is a deployment preparation plan. It does not deploy the site, create
production users, expose admin editing, or make unrelated apps public.

## Phase 1 Goal

The phase-1 public target is narrow:

* Visitors can view the public homepage.
* Visitors can open the public Journey display.
* Visitors can load the published canvas JSON.
* Visitors can load public media files referenced by that published canvas.
* The public homepage can show future-feature entries, but those entries must
  open construction notices instead of private or unfinished workflows.
* Admin editing stays local for now.
* No public registration is added.
* No normal user portal is added.
* Health, tasks, messages, subscriptions, and future tools are not productionized.

Homepage entrance behavior for the first public release:

* The visitor entrance stays active and opens `journey.html?view=public`.
* The user entrance stays visible, shows `暂未开放`, and does not navigate to
  `login.html`, `hub.html`, or any private page.
* The message entrance stays visible and opens the Visitor Messages V1 form.
* The public homepage must not call auth-state APIs just to resolve user-entry
  navigation.
* The public homepage submits visitor messages only through `POST /api/messages`.
* Local development behavior can remain fully functional on `localhost` and
  `127.0.0.1`.
* Public browsers must use the same-origin API base (`/api`) instead of the
  local development backend at `127.0.0.1:8000`.
* Public canvas responses must not expose the internal `updated_by_user_id`
  field.

Other application files can remain in the repository and on disk. Security must
not rely on visitors ignoring those files. The deployment must use an explicit
public route allowlist.

## Why A Publish Bundle Is Needed

Git deploys source code. It does not deploy local PostgreSQL rows or runtime
uploaded media files.

The Journey canvas stores media references by `mediaId`. The remote database
and remote `data/uploads/homepage/` files must therefore match each other.

The publish bundle exists to move only the public Homepage/Journey display data:

* The default row from `homepage_canvas_states`.
* `homepage_media` rows referenced by the saved Journey canvas.
* Referenced files under `data/uploads/homepage/`.

By default, homepage publish bundles are Journey-only. They do not include
`homepage_items` rows or media referenced only by homepage items.

Visible safe `homepage_items` rows can be included only with the explicit
`-IncludeHomepageItems` CLI option. That option is not recommended for the
phase-1 display-only rollout unless a real production homepage item workflow is
intentionally needed.

The bundle must not include:

* Users.
* Sessions.
* Roles.
* Permissions.
* Visitor messages.
* Health data.
* Task data.
* Subscription data.
* Debug logs.
* `.env` files.
* Database files.
* Unrelated uploads.
* Cookies or browser storage.

## Bundle Structure

The export tool writes bundles under `.local_exports/`.

Example structure:

```text
homepage-publish-bundle/
  manifest.json
  homepage_canvas_states.json
  homepage_media.json
  homepage_items.json
  files/
    homepage/
      images/
        <safe media file>
      videos/
        <safe media file>
```

`.local_exports/` is ignored by Git and must not be committed.

## Manifest

`manifest.json` includes:

* `bundleSchemaVersion`
* `exportedAt`
* `sourceGitCommit`
* `sourceAlembicHead`
* `sourceDatabaseAlembicCurrent`
* `sourceCanvasKey`
* `sourceCanvasRevision`
* `appName`
* `homepageItemsScope`
* `mediaIds`
* `fileCount`
* `fileHashes`
* `warnings`
* a public-data handling notice

The current schema is:

```text
homepage-publish-bundle-v1
```

## Export Flow

Run from the repository root:

```powershell
.\scripts\export-homepage-public-bundle.ps1
```

Optional ZIP creation:

```powershell
.\scripts\export-homepage-public-bundle.ps1 -CreateZip
```

The default export is Journey-only and sets:

```text
homepageItemsScope = excluded
```

Optional homepage item export:

```powershell
.\scripts\export-homepage-public-bundle.ps1 -CreateZip -IncludeHomepageItems
```

This sets:

```text
homepageItemsScope = replace_with_bundle_rows
```

The export script:

* Reads `DATABASE_URL` from the process environment or `backend/.env`.
* Does not print the database password.
* Reads only the default published canvas.
* Recursively finds `mediaId` references in the canvas JSON.
* Includes media referenced by Journey stickers and node gallery images.
* Excludes `homepage_items` by default.
* Includes visible safe homepage items only when `-IncludeHomepageItems` is provided.
* Copies only referenced files under `data/uploads/homepage/`.
* Rejects absolute paths.
* Rejects paths containing `..`.
* Rejects paths outside `data/uploads/homepage/`.
* Rejects symlinked media files.
* Writes SHA256 hashes into the manifest.
* Reports missing files as warnings.

## Local UI Export From Journey Editor

Local admins can also export a publish bundle from the Journey editor.

Workflow:

1. Open `journey.html?edit=1`.
2. Confirm the current user has `homepage:edit`.
3. Edit the canvas locally.
4. Click `保存画布`.
5. Click `导出发布包`.
6. The browser downloads a `homepage-publish-bundle-YYYYMMDD-HHMMSS.zip` file.

The Journey editor UI export is always Journey-only. It does not export
`homepage_items` rows or media that is referenced only by homepage item rows.

The UI export calls:

```text
POST /api/homepage/publish-bundle/export
```

This endpoint is local-admin-only:

* It requires an authenticated user with `homepage:edit`.
* It requires CSRF validation.
* It is disabled when `APP_ENV=production`.
* It must not be added to the public Nginx allowlist.
* It must not be documented as a public endpoint.

The export still reads from the database and runtime files. If the Journey
editor has unsaved browser changes, the UI blocks export and asks the admin to
click `保存画布` first.

Remote import remains command-line and dry-run first in v1.

## Import Flow

Run from the repository root on the target machine:

```powershell
.\scripts\import-homepage-public-bundle.ps1 -BundlePath <bundle-folder> -DryRun
```

`-BundlePath` can point to either an unpacked bundle folder or a downloaded
bundle ZIP. ZIP entries are checked for absolute paths and `..` traversal before
they are unpacked under `.local_exports/`.

After reviewing the dry-run report:

```powershell
.\scripts\import-homepage-public-bundle.ps1 -BundlePath <bundle-folder>
```

The import script:

* Reads `DATABASE_URL` from the process environment or `backend/.env`.
* Does not print the database password.
* Verifies `manifest.json`.
* Verifies `bundleSchemaVersion`.
* Verifies SHA256 hashes for every bundled media file.
* Rejects unsafe media paths.
* Checks current Git commit when available.
* Checks current Alembic database revision.
* Refuses Git or Alembic mismatch unless `-Force` is explicitly used.
* Creates a timestamped backup before real import.
* Imports media files into `data/uploads/homepage/`.
* Upserts homepage media rows by id.
* Hides existing visible homepage item rows that are not present in the bundle.
* Upserts visible homepage item rows by id.
* Upserts the default homepage canvas row by `canvas_key`.

Import backups are written under `.local_backups/`, which is ignored by Git.

### Ubuntu/Linux Import Commands

On the production Ubuntu server, run the underlying Python helper directly from
the repository root. Do not run a real import until the dry-run succeeds and the
bundle has been reviewed.

Dry-run:

```bash
cd /var/www/personal_web
source backend/.venv/bin/activate
python scripts/homepage_publish_bundle.py import --bundle-path /path/to/homepage-publish-bundle --dry-run
```

Real import after review:

```bash
cd /var/www/personal_web
source backend/.venv/bin/activate
python scripts/homepage_publish_bundle.py import --bundle-path /path/to/homepage-publish-bundle
```

Normal production import should not use `--force`. A Git, Alembic, hash, or path
failure means the operator must stop and inspect the mismatch before trying
again.

The real import prints `backupPath=<path>` in the import report. Backups are
written under:

```text
.local_backups/homepage-import-backup-YYYYMMDD-HHMMSS/
```

Keep those backups on the server or in a server backup location. Do not commit
them to GitHub.

The import behavior depends on `homepageItemsScope`:

* `excluded`: Journey-only. No `homepage_items` rows are upserted. Existing
  visible remote homepage items are set to `is_visible = false` so the remote
  public display does not keep old smoke-test or test-card data.
* `replace_with_bundle_rows`: visible remote `homepage_items` are made to match
  the bundle by hiding stale visible rows and then upserting bundled rows.

Old bundles without `homepageItemsScope` remain compatible. If
`homepage_items.json` contains rows, import treats the bundle as
`replace_with_bundle_rows`. If it does not contain rows, import treats it as
`excluded` and reports a warning.

Old `homepage_media` rows may remain in the database for history or rollback.
They should not remain publicly reachable unless the current published Journey
canvas or a currently visible homepage item references them.

## Backup And Rollback

Before a real import, the tool creates:

```text
.local_backups/homepage-import-backup-YYYYMMDD-HHMMSS/
```

The backup includes:

* The previous default `homepage_canvas_states` row.
* Existing `homepage_media` rows that may be overwritten.
* Existing `homepage_items` rows that may be overwritten.
* Existing visible `homepage_items` rows that will be hidden as stale.
* Existing media files that may be overwritten.
* A backup manifest.

Rollback is manual in this phase. The backup is intentionally plain JSON plus
copied files so it can be inspected before use.

## Public Allowlist Strategy

The phase-1 deployment must be display-only.

Public static routes may include:

* `/`
* `/index.html`
* `/journey.html`
* Required CSS and JS files for homepage and Journey display.
* Required static assets and favicon files.

Public API routes may include:

* `GET /api/homepage/canvas`
* `GET /api/homepage/media/{id}/file`

`GET /api/homepage/public` is not part of the phase-1 allowlist because the
current public homepage does not require homepage item rows.

Routes and endpoints that must not be public in v1:

* Admin write APIs.
* Media upload APIs.
* Canvas `PUT` and reset APIs.
* Publish bundle export APIs.
* Debug APIs.
* Dev tools.
* User/session management APIs.
* Unrelated app APIs.
* `login.html`, `hub.html`, and private app pages unless production auth is
  intentionally hardened later.

The example Nginx template for this phase lives at:

```text
deploy/nginx/personal-web-public.conf.example
```

The example backend service and environment templates live at:

```text
deploy/systemd/personal-web-backend.service.example
deploy/production.env.example
```

These templates are not deployment. They are reviewed starting points for the
later server task.

## Server Architecture

Target production architecture:

```text
Visitor browser
        |
      HTTPS
        v
Nginx public allowlist
        |
        +--> static Homepage/Journey files
        |
        +--> selected read-only /api/homepage routes
                 |
                 v
             FastAPI backend
                 |
                 v
          PostgreSQL database
```

Runtime media storage:

```text
data/uploads/homepage/
```

This folder is runtime data. It must not be committed to GitHub.

Before starting the systemd service, create the controlled writable runtime
directories with ownership matching the selected non-root service account:

```bash
sudo install -d -o personal-web -g personal-web -m 0750 \
  /var/www/personal_web/.local_logs \
  /var/www/personal_web/data/uploads/homepage \
  /var/backups/personal-web
```

Directory purposes:

* `/var/www/personal_web/.local_logs` stores sanitized seven-day backend JSONL
  diagnostics.
* `/var/www/personal_web/data/uploads/homepage` stores imported Journey media.
* `/var/backups/personal-web` is the controlled backup location for deployment
  and import operations.

All three directories must exist before the service starts. The real owner and
group must match the service account used in the final systemd unit. Backend
diagnostics writes are best-effort and remain non-fatal even if this directory
setup is wrong, but the directory setup should still be correct before
production traffic reaches the service.

The FastAPI process should bind only to `127.0.0.1:8000`. Nginx is the public
HTTPS boundary and must proxy only the explicitly allowed read-only API routes.
Everything else should return 403 or 404.

## Security Requirements

For this phase:

* `APP_ENV` must be `production` on the server.
* `ALLOW_DEV_TOOLS` must be false on the server.
* No dev seed users such as `1 / 1` or `2 / 2` may be production users.
* No open registration is added.
* No public admin editing is added.
* No secrets are stored in the bundle.
* No sessions are stored in the bundle.
* No users, roles, or permissions are stored in the bundle.
* Uploaded media remains public only through existing public media rules.
* Admin, write, debug, reset, and dev endpoints stay out of the public allowlist.
* The real production environment file belongs outside GitHub, for example
  `/etc/personal-web/personal-web.env`.
* The real environment file must not use wildcard CORS, development seed
  credentials, or the default session secret.

## Public Health Check

The public display health script is:

```powershell
.\scripts\check-remote-homepage-public.ps1 -BaseUrl https://DOMAIN
```

It checks:

* HTTPS homepage.
* `GET /journey.html?view=public`
* `GET /api/homepage/canvas`
* Canvas schema, revision, and `exists` fields.
* Absence of `updated_by_user_id` in public canvas JSON.
* One referenced media file when the canvas contains media stickers.
* Rejection of private static routes.
* Rejection of private, write, debug, auth, dev, message, media-admin, item, and
  unknown API routes.

Optional HTTP redirect check:

```powershell
.\scripts\check-remote-homepage-public.ps1 -BaseUrl https://DOMAIN -HttpBaseUrl http://DOMAIN
```

## Future One-Click Publish

The example skeleton is:

```powershell
.\scripts\publish-homepage-to-remote.example.ps1
```

It contains placeholders only:

* `REMOTE_HOST`
* `REMOTE_USER`
* `REMOTE_REPO_PATH`
* `REMOTE_BUNDLE_PATH`
* `DOMAIN`
* `SSH_KEY_PATH`

Future intended flow:

1. Export locally.
2. Upload the bundle with `scp` or `rsync`.
3. SSH to the remote server.
4. Run remote import with `-DryRun`.
5. Run real remote import after review.
6. Run the public health check.
7. Print the final public URL.

This example must not be edited with real hostnames, usernames, private key
paths, domains, passwords, or server IP addresses.

## Rollout Phases

### Step 1: This Branch

Add export/import/version-check tooling and documentation.

Acceptance:

* Export tooling exists.
* Import dry-run tooling exists.
* Hash and path safety checks exist.
* Public allowlist strategy is documented.
* No deployment is performed.

### Step 2: Manual Server Preparation

Configure the remote server with the same codebase, remote PostgreSQL, FastAPI,
Nginx, persistent upload storage, and production environment variables.

Then import a reviewed homepage publish bundle.

Acceptance:

* Public homepage and Journey display load.
* Public canvas API returns data.
* Public referenced media files load.
* Admin/write/debug/dev routes are not public.

### Step 3: Future One-Click Publish

After manual deployment proves the flow, build a real publish script:

```text
local export
  -> upload
  -> remote dry-run import
  -> remote import
  -> remote health check
```

The future script must still avoid committing secrets or runtime data.

## Operational Notes

Before any real import:

* Review the bundle contents.
* Run `-DryRun`.
* Confirm Git and Alembic compatibility.
* Confirm backup location.
* Confirm the target server is not exposing admin/write/debug endpoints.

After import:

* Run the public health check.
* Check server logs without committing them.
* Keep backups outside Git.
* Do not commit imported runtime media files.
