# Visual Style Guide

## Purpose

This document records the current visual and navigation rules for the public
cover page, the journey prototype, the private hub placeholder, and child apps.

It is a style and behavior guide only. It does not introduce backend,
authentication, authorization, or database behavior.

## Overall Direction

The project should feel:

- clean
- calm
- personal but not biographical in public prototypes
- quiet around hidden entrances
- clear about the separation between public pages and private placeholders

## Public Cover Homepage

`index.html` is the public cover homepage. It should remain minimal, quiet, and
visitor-facing.

Rules:

- The approved English hero text must not change unless explicitly requested.
- The current cover background and layout should remain stable unless a task
  explicitly asks for visual redesign.
- The ICP filing footer is subtle, visible, and separate from hidden entrances.
- The hidden lower-left journey entrance opens `journey.html`.
- The hidden private entrance opens `login.html`.
- Normal cover background clicks do not navigate to `journey.html`.
- Normal cover background and hero text should not feel like one large button.
- The cover page must not expose private apps directly.

Current cover navigation:

| Interaction | Expected behavior |
| --- | --- |
| Click normal cover background | No navigation |
| Click hidden lower-left journey entrance | Open `journey.html` |
| Click hidden private entrance | Open `login.html` |
| Click ICP footer | Open `https://beian.miit.gov.cn/` |

## Journey Page

`journey.html` is the Curved Path Timeline prototype.

Current status:

- Public/static prototype for now.
- Uses placeholder data only.
- Contains a local editor prototype.
- The editor UI is not a secure admin system.
- Major/minor nodes and Overview/Details behavior are part of the prototype.
- Future production editing must be separated from public visitor mode with real
  authentication and authorization.

Visual direction:

- Warm white page background.
- Soft green, blue, sand, and lavender regions.
- Dark navy or charcoal text.
- Gentle accent colors for nodes.
- Elegant continuous curve, not a game board.
- Major nodes are stronger and more readable.
- Minor nodes are quieter and visible only in Details mode.

Prototype content rules:

- Use placeholder `Area 01` to `Area 04` content.
- Use placeholder `Major Event` and `Minor Event` content.
- Use SVG paths and real HTML/CSS/SVG elements.
- Do not use real personal information.
- Do not use real city names.
- Do not use real experiences.
- Do not use real photos.
- Do not use external images.
- Do not use AI-generated images.
- Future content replacement should use local assets only.

## Journey Editor Prototype

The journey curve, areas, and nodes are data-driven in `journey.js`.

Editor prototype rules:

- The global right-side editor console has been intentionally removed.
- Editing should use a compact floating toolbar, context menus, and object-level
  popovers instead of a persistent dashboard-like form.
- Each area owns its own background, path, path style, node style, and nodes.
- Editor mode allows changing hero, area, curve, and node content directly on
  the journey canvas.
- Curve editing supports freehand drawing.
- Drawn points should be simplified, smoothed, and stored as editable SVG path
  data, never as a raster image.
- Nodes that should follow the route should prefer `anchorMode: "path"` and a
  normalized `pathT` percentage over fixed `x/y` coordinates.
- Bezier handle editing is intentionally not part of the user-facing UI.
- Timeline nodes should render as dots by default.
- Event cards should appear as hover previews, click details, or edit popovers.
- Right-clicking near a curve in edit mode should create nodes at the nearest
  curve point through the contextual menu.
- Node editing supports major/minor type, title, date, description, position,
  offsets, color, and card style.
- Data is saved to browser `localStorage` only.
- JSON export/import exists for future migration to a real admin tool.
- No real personal data should be entered in V1.

## Private Hub and Child Apps

`hub.html` is currently a static private hub placeholder. It is not protected by
real authentication or authorization.

Private hub direction:

- Restrained tool-center feeling.
- Clear navigation.
- Consistent buttons.
- Consistent spacing.
- Desktop and mobile usability.
- No real private data in the static prototype.

Child app UI direction:

- Child app user-facing UI should default to Simplified Chinese.
- Child apps should feel consistent with the project.
- Each app may own its CSS when needed.
- Placeholder apps should stay quiet and mostly empty until requirements are
  defined.
- Prototype editors and hidden entrances are not security mechanisms.

## Page Language

Visible page content can follow the specific task requirements.

- Public homepage approved English text must not change unless explicitly
  requested.
- Private pages and child apps should default to Simplified Chinese.
- Documentation may mix Chinese project notes and English technical terms when
  useful.

## Undecided Items

The following items remain undecided and should not be finalized without a
separate task:

- Long-term primary brand color.
- Long-term typography direction.
- Logo direction.
- Final hidden entrance treatment.
- Final motion style.
- Dark mode support.
