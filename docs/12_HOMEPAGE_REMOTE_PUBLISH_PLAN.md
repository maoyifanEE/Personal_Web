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
* Admin editing stays local for now.
* No public registration is added.
* No normal user portal is added.
* Health, tasks, messages, subscriptions, and future tools are not productionized.

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
* `homepage_media` rows referenced by the canvas or visible homepage items.
* Visible `homepage_items` rows used by the public homepage display.
* Referenced files under `data/uploads/homepage/`.

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

The export script:

* Reads `DATABASE_URL` from the process environment or `backend/.env`.
* Does not print the database password.
* Reads only the default published canvas.
* Recursively finds `mediaId` references in the canvas JSON.
* Includes visible homepage items and their media references.
* Copies only referenced files under `data/uploads/homepage/`.
* Rejects absolute paths.
* Rejects paths containing `..`.
* Rejects paths outside `data/uploads/homepage/`.
* Rejects symlinked media files.
* Writes SHA256 hashes into the manifest.
* Reports missing files as warnings.

## Import Flow

Run from the repository root on the target machine:

```powershell
.\scripts\import-homepage-public-bundle.ps1 -BundlePath <bundle-folder> -DryRun
```

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
* Upserts visible homepage item rows by id.
* Upserts the default homepage canvas row by `canvas_key`.

Import backups are written under `.local_backups/`, which is ignored by Git.

## Backup And Rollback

Before a real import, the tool creates:

```text
.local_backups/homepage-import-backup-YYYYMMDD-HHMMSS/
```

The backup includes:

* The previous default `homepage_canvas_states` row.
* Existing `homepage_media` rows that may be overwritten.
* Existing `homepage_items` rows that may be overwritten.
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
* Optionally `GET /api/homepage/public` if the public homepage uses it.

Routes and endpoints that must not be public in v1:

* Admin write APIs.
* Media upload APIs.
* Canvas `PUT` and reset APIs.
* Debug APIs.
* Dev tools.
* User/session management APIs.
* Unrelated app APIs.
* `login.html`, `hub.html`, and private app pages unless production auth is
  intentionally hardened later.

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

## Public Health Check

The public display health script is:

```powershell
.\scripts\check-remote-homepage-public.ps1 -BaseUrl https://DOMAIN
```

It checks:

* `GET /journey.html?view=public`
* `GET /api/homepage/canvas`
* Canvas data presence.
* One referenced media file when the canvas contains media stickers.

It does not test admin endpoints.

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
