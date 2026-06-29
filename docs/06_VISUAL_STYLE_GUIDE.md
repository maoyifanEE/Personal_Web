# Visual Style Guide

## Purpose

This document records visual and navigation style rules for the current static front-end preview.

It should guide small visual changes without turning documentation into a full design system.

It should also prevent old navigation behavior from returning by accident.

## Public Cover Homepage

* `index.html` is the public cover homepage.
* The cover page should remain minimal, quiet, and stable.
* The approved public hero text should not be changed unless explicitly requested.
* The public cover homepage is not an app launcher.
* The public cover homepage is not the private hub.
* The public cover homepage is not the journey prototype itself.
* The ICP footer is subtle and visible.
* The ICP footer links to `https://beian.miit.gov.cn/`.
* The visible visitor entrance opens `journey.html`.
* The visible user entrance opens `login.html`.
* Normal cover background clicks do not navigate.
* The cover should not feel like a giant button.
* The visitor and user entrance buttons should stay quiet, compact, and visually separate from the hero text.
* The entrance buttons are visible navigation only and are not security controls.

## Journey Page

* `journey.html` is the curved path timeline prototype.
* It uses placeholder data only for now.
* It is a public/static prototype in the current project stage.
* The editor UI is prototype-level and not secure admin.
* Major and minor nodes are part of the journey prototype.
* The Overview and Details switch is part of the prototype.
* The normal journey editor should present one complete editable sketch canvas, not separate Area 01 / 02 / 03 regions.
* The sketch canvas should feel like an invisible homepage layer in preview, not a visible drawing-board card.
* Preview mode should not show a grid, border, dashed outline, white paper rectangle, or card shadow around the canvas.
* The sketch canvas should render full-bleed across the browser width while keeping the internal `0..1000` coordinate system.
* Pointer interaction should use the same SVG/layer coordinate surface as the visible strokes, nodes, stickers, background, and interaction layer.
* The canonical canvas starts as a blank sketch state with background, strokes, nodes, stickers, and `nextNodeNumber`.
* Old Area, route, routeStroke, canvas route, and text box data must not be migrated into the visible canvas.
* Freehand drawing should work anywhere on the canvas.
* The active stroke pipeline is direct and simple: remove near duplicates, resample by equal distance, smooth with repeated Chaikin-style passes, then render a dense rounded SVG path.
* New strokes may snap to true free endpoints and merge at the data level.
* Erasing part of a stroke should split the remaining runs into independent strokes with new free endpoints.
* Endpoint dots should appear only for true free endpoints in editor mode.
* Nodes are created by right-clicking near a stroke projection.
* Nodes store line-topology metadata such as `strokeId`, `segmentIndex`, and `componentId`, not old route percentages.
* Dragging a node should keep it attached to the nearest projection along the same connected stroke component.
* The editor should stay simple: hand drawing, eraser, node/select, background upload, sticker upload, save, clear canvas, exit edit, canvas height, and collapsed curve settings.
* Text box creation is not part of the current Journey sketch editor.
* Normal preview should stay clean: no raw dashed stroke, dense debug points, endpoint dots, or editor toolbar.
* Debug overlays and geometry tests are editor/developer tools only and should not clutter normal public preview.
* The journey canvas may use a replaceable background image in the editor.
* Background images should adapt to canvas height through `object-fit` and `object-position`, not fixed image heights.
* Journey stickers are transparent irregular images such as PNG, WebP, or SVG.
* Stickers should render as natural transparent images without rectangular cards or white backgrounds.
* Stickers may be added by dragging a local image into the editor drop zone or using the upload control.
* Dragged local images are stored as Data URLs for local prototype preview only.
* Final project assets should live under `assets/journey/backgrounds/` or `assets/journey/stickers/` and be referenced with relative paths.
* Sticker positions and sizes should use percent coordinates so they remain stable when canvas size changes.
* Sticker editor actions should be direct: drag the image, resize with a corner handle, rotate with a top handle, and delete from the selected sticker.
* The journey page should not contain real private personal history yet.
* The journey page should not contain real photos.
* The journey page should not expose private app data.

## Login and Hub

* `login.html` is a static login placeholder.
* It is not real authentication.
* `hub.html` is a static private hub placeholder.
* It is not real authorization.
* Direct URL access is still possible until backend security exists.
* The hub may link to child app prototypes.
* The hub should not be treated as a secure private dashboard yet.

## Child Apps

* Child apps should use clean Simplified Chinese UI by default.
* Each child app may keep app-local CSS.
* Each child app should remain visually consistent with the quiet project tone.
* Child apps should include a simple return link to `../../hub.html`.
* Child apps should not expose real private data in static files.
* Child apps should not introduce external visual dependencies without approval.
* The Task List app is a prototype.
* The Health Management app is a prototype and may involve sensitive concepts.
* The Special Subscription app is a blank placeholder.

## Visual Consistency Rules

* Use system fonts unless a future design task explicitly changes typography.
* Avoid external font CDNs.
* Avoid external image URLs.
* Avoid generated decorative assets unless explicitly requested.
* Keep public pages calm and uncluttered.
* Keep private placeholder pages simple and readable.
* Keep child apps focused on their own task area.
* Do not mix one app visual system into another app without a reason.
* Do not add heavy animations to placeholder pages.
* Do not add game-like mechanics to the journey timeline.
* Do not add coins, XP, locked levels, leaderboards, or game progression.

## Forbidden Visual Changes Without Approval

* Do not change the public homepage hero text without explicit request.
* Do not change the public homepage background without explicit request.
* Do not remove the ICP footer.
* Do not display a public security filing number until approval exists.
* Do not expose private apps from the public cover page.
* Do not turn visible entrance buttons into a large app launcher unless requested.
* Do not replace static prototypes with framework applications unless requested.
* Do not add external libraries or CDNs for visual changes.

## Manual Visual Review Checklist

* [ ] `index.html` still looks like the public cover homepage.
* [ ] Public hero text is unchanged unless the task requested it.
* [ ] ICP footer remains visible and subtle.
* [ ] Visible visitor entrance opens `journey.html`.
* [ ] Visible user entrance opens `login.html`.
* [ ] Normal cover background clicks do not navigate.
* [ ] `journey.html` still opens as the timeline prototype.
* [ ] `hub.html` still opens as a static placeholder.
* [ ] Child apps still open from the hub.
* [ ] No real private data appears in static pages.

## Merge Readiness Notes

Documentation-only visual guide changes should not change app behavior.

If HTML, CSS, or JavaScript is changed, run a browser smoke test.

If only Markdown is changed, verify raw Markdown source formatting.


## Floating Toolbar and Message Modal

The public cover page may include a subtle bottom-right floating toolbar.

The floating toolbar should not dominate the cover page.

The `留言` button opens a modal front-end prototype.

The modal should clearly state that real submission requires backend and database support.

The modal should remain keyboard accessible.

The modal should work on mobile widths.

The floating toolbar must not make the whole cover page feel like a large button.

The floating toolbar should not block the ICP footer in an unusable way.
