# Personal_Web

## Current Stage

`Personal_Web` is a long-term personal website and personal tools platform.

The current project stage is a static front-end preview.

Current implementation boundaries:

* Backend is not implemented.
* Database is not implemented.
* Real login is not implemented.
* Authentication is not implemented.
* Authorization is not implemented.
* Cloud sync is not implemented.
* Private pages are placeholders and are not secure yet.
* Real private data must not be committed to GitHub.

The repository may contain source code, static structure, safe assets, project notes, and clearly fake sample data.

The repository must not contain real private data, secrets, production database files, uploads, logs, backups, or production-only configuration.

## Current Pages

| Page | Purpose | Current status |
| --- | --- | --- |
| `index.html` | Public cover homepage | Implemented static page |
| `journey.html` | Curved path timeline prototype | Static/local prototype |
| `login.html` | Login placeholder | Not real authentication |
| `hub.html` | Private hub placeholder | Not real authorization |
| `apps/tasks/index.html` | Task List prototype | Static/local prototype |
| `apps/health/index.html` | Health Management prototype | Static/local prototype |
| `apps/special-subscription/index.html` | Special Subscription placeholder | Blank placeholder |

The journey prototype includes editable curve paths.
Hand-drawn strokes are treated as rough direction input, then converted into a designer-route Bezier curve.
The fitting uses a few route waypoints, one tangent direction per waypoint, and paired handles to keep internal joins visually continuous.
The quality gates keep broad shape landmarks while limiting raw-to-final deviation and curvature spikes.
Adjacent journey areas align endpoints and adjust only local boundary handles so the timeline reads as one continuous path without destroying each area's shape.
The journey editor can show and export front-end curve debug data for raw points, designer waypoints, tangent vectors, Bezier segments, final samples, per-area metrics, and boundary diagnostics.

## Navigation Behavior

* Hidden lower-left entrance on `index.html` opens `journey.html`.
* Normal cover background clicks do not navigate.
* Hidden private entrance opens `login.html`.
* ICP footer opens `https://beian.miit.gov.cn/`.
* `hub.html` links to child app prototypes.
* Hidden entrances are navigation devices, not security mechanisms.
* Direct URL access is still possible for placeholder private pages.

## Data Safety

Code and documentation may be committed to GitHub.

Real private data must not be committed to GitHub.

The following items must stay out of GitHub:

* Real private data.
* Real account passwords.
* API keys.
* Access tokens.
* SSH private keys.
* Production certificates.
* Database files.
* Uploaded private files.
* Server logs.
* Backups.
* Production-only configuration.
* Local `.env` files with real secrets.

`localStorage` is allowed only for early static prototypes.

`localStorage` is not final long-term private data storage.

Long-term private data should eventually move to a backend API and a server-side database.

## File Structure

```text
Personal_Web/
|-- index.html
|-- journey.html
|-- login.html
|-- hub.html
|-- styles.css
|-- script.js
|-- journey.css
|-- journey.js
|-- apps/
|   |-- tasks/
|   |   `-- index.html
|   |-- health/
|   |   `-- index.html
|   `-- special-subscription/
|       `-- index.html
`-- docs/
    |-- 00_DESIGN_GUIDE.md
    |-- 05_APP_MODULES.md
    |-- 06_VISUAL_STYLE_GUIDE.md
    |-- 07_ROUTE_AND_SECURITY_RULES.md
    |-- 08_PROJECT_STRUCTURE_STANDARD.md
    |-- 09_BACKEND_DATABASE_PLAN.md
    `-- PROJECT_HISTORY.md
```

## Documentation Map

* `docs/00_DESIGN_GUIDE.md`: ownership, data safety, and deployment boundaries.
* `docs/05_APP_MODULES.md`: child app registry and app module standards.
* `docs/06_VISUAL_STYLE_GUIDE.md`: visual and navigation style rules.
* `docs/07_ROUTE_AND_SECURITY_RULES.md`: route categories and security limits.
* `docs/08_PROJECT_STRUCTURE_STANDARD.md`: structure and branch standards.
* `docs/09_BACKEND_DATABASE_PLAN.md`: future backend and database planning.
* `docs/PROJECT_HISTORY.md`: project change history.

## Development Rules

* Do not work directly on `main` unless explicitly instructed.
* Use `Feature/xxx` for new features.
* Use `BugFix/xxx` for fixes.
* Update relevant docs when adding or changing modules.
* Read `docs/00_DESIGN_GUIDE.md` before data-related work.
* Read `docs/05_APP_MODULES.md` before adding child apps.
* Read `docs/07_ROUTE_AND_SECURITY_RULES.md` before route or security work.
* Do not add backend, database, or auth unless explicitly requested.
* Do not add real private data to static files.
* Keep app-specific code inside the relevant app folder.
* Keep documentation readable in raw Markdown source form.

## Local Preview

Run this command from the repository root:

```bash
python -m http.server 4173
```

Then open these URLs as needed:

* `http://127.0.0.1:4173/`
* `http://127.0.0.1:4173/journey.html`
* `http://127.0.0.1:4173/login.html`
* `http://127.0.0.1:4173/hub.html`
* `http://127.0.0.1:4173/apps/tasks/index.html`
* `http://127.0.0.1:4173/apps/health/index.html`
* `http://127.0.0.1:4173/apps/special-subscription/index.html`

## Current Non-Goals

* Real backend server.
* Real database.
* Real login.
* Real authorization.
* Real cloud synchronization.
* Real payment or subscription integration.
* Production CMS.
* Multi-user permission system.

## Merge Readiness Note

Documentation fixes should not change website behavior.

Application behavior should be verified separately when application files are changed.
