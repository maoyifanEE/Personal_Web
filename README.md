# Personal_Web

Personal_Web is a long-term personal website project.

Current stage: static front-end preview.

## Current Public Homepage

The public homepage, `index.html`, is now a **Curved Path Timeline Homepage**
prototype.

It uses placeholder content only:

- Placeholder areas: `Area 01` to `Area 04`
- Placeholder events: `Major Event` and `Minor Event`
- Placeholder dates and descriptions
- CSS/SVG placeholder image blocks

No real personal data is included. The homepage does not use real cities, real
experiences, real photos, AI-generated images, external image URLs, external
fonts, CDN resources, or external dependencies.

The curved path, areas, and event nodes are structured for future editing in
`script.js`. Future changes can adjust area order, area height, event type,
event position, node offset, and SVG path shape through centralized data instead
of rewriting the page markup.

## Current Stage

- Static preview
- No backend
- No database
- No real login
- No authentication
- No authorization
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
|-- login.html
|-- hub.html
|-- apps/
|   |-- tasks/
|   |   |-- index.html
|   |   |-- tasks.css
|   |   `-- tasks.js
|   `-- health/
|       |-- index.html
|       |-- health.css
|       `-- health.js
|-- styles.css
|-- script.js
|-- assets/
|-- scripts/
`-- docs/
```

## Current Pages

- `index.html`: public Curved Path Timeline Homepage prototype.
- `login.html`: static private entrance placeholder. It does not authenticate anyone.
- `hub.html`: static Personal Hub placeholder. It must not be used for private data.
- `apps/tasks/index.html`: task-list local front-end prototype.
- `apps/health/index.html`: health-management local front-end prototype.

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
