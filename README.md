# Personal_Web

Personal_Web is a long-term personal website and personal tools project.

Current stage: **static front-end preview**.

There is no backend, no database, no real login, no authentication, no
authorization, and no cloud sync yet. Private pages and child apps are currently
static/local prototypes, not secure production tools.

## Current Pages

### Public Pages

- `index.html`: public cover homepage.
  - Contains the ICP filing footer.
  - Contains a hidden lower-left entrance to `journey.html`.
  - Contains a separate hidden private entrance to `login.html`.
  - Normal cover background clicks do not navigate.
- `journey.html`: Curved Path Timeline prototype.
  - Uses placeholder data only.
  - Includes a local editor prototype.
  - This is not a secure admin page.

### Hidden / Private Placeholders

- `login.html`: static login placeholder. It does not authenticate anyone.
- `hub.html`: static Personal Hub placeholder. It is not protected by real
  authorization and links to child app prototypes.

### Child Apps

- `apps/tasks/index.html`: 任务清单 local/static prototype.
- `apps/health/index.html`: 健康管理 local/static prototype.
- `apps/special-subscription/index.html`: 特别订阅 blank placeholder.

Detailed child app status and development rules live in
`docs/05_APP_MODULES.md`.

## Navigation Rules

- The ICP footer opens `https://beian.miit.gov.cn/`.
- The hidden lower-left journey entrance opens `journey.html`.
- The hidden private entrance opens `login.html`.
- `hub.html` links to child apps.
- Hidden entrances are visual navigation devices only. They are not security.

## Data Safety

- Real private data must never be committed to GitHub.
- Secrets, `.env`, database files, uploads, logs, backups, and production config
  must never be committed.
- Current `localStorage` usage is prototype-only. It is not long-term private
  data storage.
- Before adding data-related behavior, read `docs/00_DESIGN_GUIDE.md`.
- Route and security expectations are documented in
  `docs/07_ROUTE_AND_SECURITY_RULES.md`.

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
- `docs/PROJECT_HISTORY.md`: project change history.
