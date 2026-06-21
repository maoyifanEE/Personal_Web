# Personal_Web

Personal_Web is a long-term personal website and personal tools project.

Current stage: **static front-end preview**.

The project currently has no backend, no database, no real login,
no authentication, no authorization, and no cloud sync. Private pages and child
apps are static/local prototypes, not secure production tools.

## Current Pages

| Page | Category | Current status |
| --- | --- | --- |
| `index.html` | Public cover homepage | Contains ICP footer, hidden journey entrance, and hidden private entrance. Normal cover background clicks do not navigate. |
| `journey.html` | Public/static prototype | Curved Path Timeline prototype with placeholder data and a local editor prototype. Not a secure admin page. |
| `login.html` | Hidden/private placeholder | Static login placeholder. It does not authenticate anyone. |
| `hub.html` | Hidden/private placeholder | Static Personal Hub placeholder. It is not protected by real authorization. |
| `apps/tasks/index.html` | Child app prototype | 任务清单 static/local prototype. |
| `apps/health/index.html` | Child app prototype | 健康管理 static/local prototype. |
| `apps/special-subscription/index.html` | Child app placeholder | 特别订阅 blank placeholder. |

Detailed child app status and development rules live in
`docs/05_APP_MODULES.md`.

## Navigation Rules

- The ICP footer opens `https://beian.miit.gov.cn/`.
- The hidden lower-left journey entrance opens `journey.html`.
- The hidden private entrance opens `login.html`.
- Normal cover background clicks do not open `journey.html`.
- `hub.html` links to child app prototypes.
- Hidden entrances are visual navigation devices only. They are not security.

## Data Safety

- Real private data must never be committed to GitHub.
- Secrets, `.env`, database files, uploads, logs, backups, and production config
  must never be committed.
- Current `localStorage` usage is prototype-only. It is not long-term private
  data storage.
- Future backend/database/auth work is planned, not implemented.
- Before adding data-related behavior, read `docs/00_DESIGN_GUIDE.md`.
- Before route/auth/security work, read `docs/07_ROUTE_AND_SECURITY_RULES.md`.
- Before backend/database work, read `docs/09_BACKEND_DATABASE_PLAN.md`.

## Development Rules

- Do not work directly on `main`.
- Use `Feature/xxx` branches for new features.
- Use `BugFix/xxx` branches for fixes.
- Read `docs/05_APP_MODULES.md` before adding or changing child apps.
- Read `docs/08_PROJECT_STRUCTURE_STANDARD.md` before changing project
  structure.

## How To Open Locally

Run from the project root:

```powershell
python -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

Useful direct URLs:

```text
http://127.0.0.1:4173/journey.html
http://127.0.0.1:4173/login.html
http://127.0.0.1:4173/hub.html
http://127.0.0.1:4173/apps/tasks/index.html
http://127.0.0.1:4173/apps/health/index.html
http://127.0.0.1:4173/apps/special-subscription/index.html
```

## File Structure

```text
Personal_Web/
|-- index.html
|-- journey.html
|-- journey.css
|-- journey.js
|-- login.html
|-- hub.html
|-- styles.css
|-- script.js
|-- apps/
|   |-- tasks/
|   |-- health/
|   `-- special-subscription/
|-- assets/
|-- scripts/
`-- docs/
```

## Documentation Map

- `docs/00_DESIGN_GUIDE.md`: code, deployment, and data ownership model.
- `docs/05_APP_MODULES.md`: child app registry and module standards.
- `docs/06_VISUAL_STYLE_GUIDE.md`: visual and navigation style rules.
- `docs/07_ROUTE_AND_SECURITY_RULES.md`: route and security rules.
- `docs/08_PROJECT_STRUCTURE_STANDARD.md`: project structure standard.
- `docs/09_BACKEND_DATABASE_PLAN.md`: planned backend/database boundary.
- `docs/PROJECT_HISTORY.md`: project change history.
