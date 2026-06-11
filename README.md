# Personal_Web

Personal_Web 是一个长期个人网站项目。当前阶段是 **static preview**：只包含纯静态页面、样式、脚本和项目文档。

长期方向是：

- public visitor-facing website；
- private personal tools hub。

当前只整理静态基础，不实现真实业务功能。

## Current stage

- Current stage: static preview
- No backend
- No database
- No real login
- No authentication
- No authorization
- No private data storage
- No external CDN
- No external resources outside this project folder

## Safety warnings

- Do not enter real passwords.
- Do not store private data in the current static version.
- The hidden entrance is only a visual placeholder, not a security mechanism.
- Real security must be implemented later with proper authentication and authorization.

## How to open

Open the homepage directly:

```text
index.html
```

Or run a local static server from the project root:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

The placeholder pages can also be opened directly:

```text
login.html
hub.html
```

## Desktop shortcut

To create a Windows desktop shortcut, run this from the project root:

```powershell
./scripts/create_desktop_shortcut.ps1
```

The script creates `Personal_Web.lnk` on the desktop and opens `index.html` through the default file association. If the project folder moves, recreate the shortcut.

Generated `.lnk` files must not be committed.

## File structure

```text
Personal_Web/
├── index.html
├── login.html
├── hub.html
├── styles.css
├── script.js
├── assets/
│   └── icon.svg
├── scripts/
│   └── create_desktop_shortcut.ps1
├── docs/
│   ├── 00_PROJECT_OVERVIEW.md
│   ├── 01_INFORMATION_ARCHITECTURE.md
│   ├── 02_PUBLIC_SITE_DESIGN.md
│   ├── 03_PERSONAL_HUB_DESIGN.md
│   ├── 04_USER_ROLE_PERMISSION.md
│   ├── 05_APP_MODULES.md
│   ├── 06_VISUAL_STYLE_GUIDE.md
│   ├── 07_ROUTE_AND_SECURITY_RULES.md
│   ├── 08_DESIGN_DECISIONS.md
│   ├── PROJECT_GUIDE.md
│   ├── PROJECT_HISTORY.md
│   └── assets/
│       └── README.md
├── README.md
└── .gitignore
```

Key paths:

- `index.html`
- `login.html`
- `hub.html`
- `styles.css`
- `script.js`
- `assets/icon.svg`
- `scripts/create_desktop_shortcut.ps1`
- `docs/00_PROJECT_OVERVIEW.md`
- `docs/01_INFORMATION_ARCHITECTURE.md`
- `docs/02_PUBLIC_SITE_DESIGN.md`
- `docs/03_PERSONAL_HUB_DESIGN.md`
- `docs/04_USER_ROLE_PERMISSION.md`
- `docs/05_APP_MODULES.md`
- `docs/06_VISUAL_STYLE_GUIDE.md`
- `docs/07_ROUTE_AND_SECURITY_RULES.md`
- `docs/08_DESIGN_DECISIONS.md`
- `docs/PROJECT_GUIDE.md`
- `docs/PROJECT_HISTORY.md`
- `docs/assets/README.md`

## Current pages

- `index.html`: public visitor-facing homepage.
- `login.html`: static private entrance placeholder. It does not authenticate anyone.
- `hub.html`: static Personal Hub placeholder. It must not be used for private data.

## Project docs

The `docs/` folder records the long-term direction, information architecture, role model, route model, visual style, and design decisions.

Important principles:

- Public pages and private tools must stay separated.
- Hidden entrance is only a visual design element.
- Future private routes must rely on real authentication, authorization, server-side checks, and route protection.
- Any future backend, database, or authentication work must be designed and verified separately.
