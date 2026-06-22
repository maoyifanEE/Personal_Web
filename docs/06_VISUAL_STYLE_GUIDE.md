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
* The hidden lower-left journey entrance opens `journey.html`.
* The hidden private entrance opens `login.html`.
* Normal cover background clicks do not navigate.
* The cover should not feel like a giant button.
* The hidden journey entrance should stay visually hidden or nearly invisible.
* The hidden private entrance should remain separate from the journey entrance.

## Journey Page

* `journey.html` is the curved path timeline prototype.
* It uses placeholder data only for now.
* It is a public/static prototype in the current project stage.
* The editor UI is prototype-level and not secure admin.
* Major and minor nodes are part of the journey prototype.
* The Overview and Details switch is part of the prototype.
* Freehand curve editing and path-anchored nodes are prototype editor features.
* Hand-drawn curve input should be treated as rough direction, not exact final geometry.
* The final journey path should be generated from algorithm-fitted guide anchors and smooth spline curves.
* Smoothness and visual polish may override exact hand-drawn fidelity.
* Adjacent journey areas should align path endpoints so the timeline does not show broken or disconnected transitions.
* Vertically offset journey areas should still connect smoothly at their shared boundary.
* The curve debug overlay and debug JSON export may be used to inspect raw points, guide anchors, final spline samples, and boundary diagnostics.
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
* Do not turn hidden entrances into visible navigation unless requested.
* Do not replace static prototypes with framework applications unless requested.
* Do not add external libraries or CDNs for visual changes.

## Manual Visual Review Checklist

* [ ] `index.html` still looks like the public cover homepage.
* [ ] Public hero text is unchanged unless the task requested it.
* [ ] ICP footer remains visible and subtle.
* [ ] Hidden journey entrance remains hidden and opens `journey.html`.
* [ ] Hidden private entrance remains hidden and opens `login.html`.
* [ ] Normal cover background clicks do not navigate.
* [ ] `journey.html` still opens as the timeline prototype.
* [ ] `hub.html` still opens as a static placeholder.
* [ ] Child apps still open from the hub.
* [ ] No real private data appears in static pages.

## Merge Readiness Notes

Documentation-only visual guide changes should not change app behavior.

If HTML, CSS, or JavaScript is changed, run a browser smoke test.

If only Markdown is changed, verify raw Markdown source formatting.
