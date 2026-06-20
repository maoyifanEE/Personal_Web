# Personal_Web

Personal_Web is a long-term personal website project.

Current stage: static front-end preview.

## Current Public Homepage

The public homepage, `index.html`, is the stable public cover page. A hidden
lower-left entrance on the cover opens `journey.html`, which contains the
**Curved Path Timeline Homepage** prototype with a visible local admin/editor
mode. Normal cover background clicks do not navigate to `journey.html`.

It uses placeholder content only:

- Placeholder areas: `Area 01` to `Area 04`
- Placeholder events: `Major Event` and `Minor Event`
- Placeholder dates and descriptions
- CSS/SVG placeholder image blocks

No real personal data is included. The homepage does not use real cities, real
experiences, real photos, AI-generated images, external image URLs, external
fonts, CDN resources, or external dependencies.

The curved path, areas, and event nodes are structured for editing in
`journey.js`. Each area owns its own background, SVG path segment, path style,
node styles, and nodes. The visible `编辑主页` button opens a local editor
prototype for changing area styles, drawing freehand curves, smoothing drawn
paths, anchoring nodes by path percentage, adding/editing nodes, saving to
`localStorage`, and exporting/importing JSON.

The editor now uses contextual direct editing instead of a persistent global
console: a compact floating toolbar handles mode/save/data actions, while hero,
area, curve, and node settings open near the object being edited.

Editor storage key:

```text
personal_web_homepage_timeline_v1
```

This editor is only a static browser-based prototype. It has no backend,
database, login, authentication, authorization, or production CMS. Before a real
public launch, the editor should be hidden from visitor mode or moved behind
real admin access.

## Current Stage

- Static preview
- No backend
- No database
- No real login
- No authentication
- No authorization
- Local homepage editor persistence uses browser `localStorage` only
- `journey.html` is a local/static prototype page, not a production CMS
- No private data storage
- No cloud sync
- No real reminders
- No external CDN
- No external resources outside this project folder
- Generated `.lnk` files are ignored and must not be committed

## Safety Warnings

- Do not enter real passwords.
- Do not store private data in the current static version.
- The hidden entrance is only a visual placeholder, not a security mechanism.
- The hidden entrance leads to `login.html` first.
- The hidden lower-left journey entrance leads to `journey.html`; it is separate
  from the private entrance.
- The ICP footer remains separate and opens `https://beian.miit.gov.cn/`.
- `login.html` is a future login/private entrance placeholder.
- `hub.html` is only a static Personal Hub placeholder.
- Child apps are local prototypes only.
- Real security must be implemented later with proper authentication,
  authorization, server-side checks, and route protection.

## How To Open

Open the homepage directly:

```text
index.html
```

Or run a local static server from the project root:

```powershell
python -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

The placeholder pages can also be opened directly:

```text
login.html
hub.html
```

## Desktop Shortcut

To create a Windows desktop shortcut, run this from the project root:

```powershell
./scripts/create_desktop_shortcut.ps1
```

The script creates `Personal_Web.lnk` on the desktop and opens `index.html`
through the default file association. If the project folder moves, recreate the
shortcut.

The desktop shortcut icon uses `assets/shortcut-icon-current.ico`, generated
from `assets/icon.jpg`.

Generated `.lnk` files must not be committed.

## File Structure

```text
Personal_Web/
|-- index.html
|-- journey.html
|-- journey.css
|-- journey.js
|-- login.html
|-- hub.html
|-- apps/
|   |-- tasks/
|   |   |-- index.html
|   |   |-- tasks.css
|   |   `-- tasks.js
|   |-- health/
|   |   |-- index.html
|   |   |-- health.css
|   |   `-- health.js
|   `-- special-subscription/
|       |-- index.html
|       `-- special-subscription.css
|-- styles.css
|-- script.js
|-- assets/
|-- scripts/
`-- docs/
```

## Current Pages

- `index.html`: public cover homepage with the ICP filing footer, the existing
  hidden private entrance to `login.html`, and a hidden lower-left entrance to
  `journey.html`. Normal cover background clicks do not navigate.
- `journey.html`: Curved Path Timeline Homepage prototype/editor with placeholder content only.
- `login.html`: static private entrance placeholder. It does not authenticate anyone.
- `hub.html`: static Personal Hub placeholder. It must not be used for private data.
- `apps/tasks/index.html`: task-list local front-end prototype.
- `apps/health/index.html`: health-management local front-end prototype.
- `apps/special-subscription/index.html`: 特别订阅 static blank placeholder child app.
  It has no backend, database, authentication, payment, API, or real subscription logic.

## Project Docs

The `docs/` folder records the long-term direction, information architecture,
route model, visual style, and project history.

Important principles:

- Public pages and private tools must stay separated.
- Hidden entrance is only a visual design element.
- Future private routes must rely on real authentication, authorization,
  server-side checks, and route protection.
- Any future backend, database, or authentication work must be designed and
  verified separately.
- The public homepage must not expose private app content.
