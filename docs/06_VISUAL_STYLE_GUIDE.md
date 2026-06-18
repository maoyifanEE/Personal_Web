# Visual Style Guide

## 1. Overall Feeling

Current direction:

- Clean
- Calm
- Personal but not biographical in the public prototype
- Quiet hidden entrance
- Clear separation between public homepage and private tools

## 2. Public Site Style

The public site should feel like a visitor-facing front page, not a private
dashboard and not an app launcher.

Recommended direction:

- Minimal structure
- Gentle motion
- Soft visual regions
- Real HTML/CSS/SVG elements
- Hidden entrance naturally integrated into the page

## Public Homepage / Curved Path Timeline

Homepage concept: **Curved Path Timeline Homepage**.

This first version is a structural prototype for a Curved Path Journey Timeline.
It is not a game, not a Duolingo clone, not a level progression system, and not
a private dashboard.

Rules for V1:

- Use placeholder `Area 01` to `Area 04` content.
- Use placeholder `Major Event` and `Minor Event` content.
- Overview shows major nodes only.
- Details shows major and minor nodes.
- The path is SVG and should stay editable.
- Nodes and areas should stay data-driven.
- No real personal information.
- No real city names.
- No real experiences.
- No real photos.
- No external images.
- No AI-generated images.
- Future content replacement should use local assets only.

Visual direction:

- Warm white page background
- Soft green, blue, sand, and lavender regions
- Dark navy or charcoal text
- Gentle accent colors for nodes
- Elegant continuous curve, not a game board
- Major nodes are stronger and more readable
- Minor nodes are quieter and visible only in Details mode

## Homepage Editor Prototype

The homepage curve, areas, and nodes are data-driven in `journey.js`.

Editor prototype rules:

- The global right-side editor console has been intentionally removed.
- Editing should use a compact floating toolbar, context menus, and object-level
  popovers instead of a persistent dashboard-like form.
- Each area owns its own background, path, path style, node style, and nodes.
- Editor mode allows changing hero, area, curve, and node content directly on
  the homepage canvas.
- Curve editing also supports a freehand drawing mode. Drawn points should be
  simplified, smoothed, and stored as editable SVG path data, never as a raster
  image.
- Nodes that should follow the route should prefer `anchorMode: "path"` and a
  normalized `pathT` percentage over fixed `x/y` coordinates.
- Bezier handle editing is intentionally not part of the user-facing UI.
- Timeline nodes should render as dots by default. Event cards should appear as
  hover previews, click details, or edit popovers.
- Right-clicking near a curve in edit mode should create nodes at the nearest
  curve point through the contextual menu.
- Node editing supports major/minor type, title, date, description, position,
  offsets, color, and card style.
- Data is saved to browser `localStorage` only.
- JSON export/import exists for future migration to a real admin tool.
- No real personal data should be entered in V1.
- No external images are allowed.
- No AI-generated images are used.
- The future production version should separate admin editing from public
  visitor mode with real authentication and authorization.

## Public Homepage Structure

`index.html` is the public cover page. It should remain minimal, stable, and
visitor-facing.

`journey.html` is the curved path timeline prototype. It can be iterated
independently without replacing the cover page.

Structure rules:

- The cover page keeps the ICP filing footer.
- The hidden entrance to `login.html` remains separate from the journey page.
- Clicking non-link cover areas may enter `journey.html`.
- ICP footer links, hidden entrance links, and future buttons must not trigger
  journey navigation.
- The journey page must use placeholder content only.
- Do not expose private apps from the cover page.
- Do not put real personal data in the prototype.

## 3. Personal Hub Style

The Personal Hub should feel more like a restrained tool center. It should not
be exposed from the public homepage except through the subtle hidden entrance
flow.

Recommended direction:

- Clear navigation
- Consistent buttons
- Consistent spacing
- Desktop and mobile usability
- No real private data in the static prototype

## 4. Page Language

Visible page content can follow the specific task requirements. The current
homepage prototype intentionally uses English placeholder content.

## 5. TBD

The following items remain undecided and should not be finalized without a
separate task:

- Long-term primary brand color
- Long-term typography direction
- Logo direction
- Final hidden entrance treatment
- Final motion style
- Dark mode support
