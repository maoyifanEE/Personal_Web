# Project History

## 2026-06-21 - Fix remaining visitor message prototype text

### Goal

* Fix the remaining broken Hub card text for the visitor message management entry.
* Fix the visitor message modal close button visible text.
* Keep the visitor message feature as a front-end prototype only.
* Do not add backend, database, API, authentication, authorization, or storage persistence.

### Completed

* Updated the Hub message management card text so it renders as readable Simplified Chinese in the browser.
* Updated the message modal close button to use a readable close symbol.
* Cleaned this project history file so it no longer contains broken question-mark placeholders.
* Preserved the prototype-only boundary for visitor messages.

### Changed Files

* hub.html
* index.html
* docs/PROJECT_HISTORY.md

### Not Changed

* No backend code was added.
* No database files were added.
* No API routes were added.
* No authentication or authorization was added.
* No localStorage, sessionStorage, or cookie persistence was added.
* Existing task, health, and special subscription apps were not changed.

### Test Results

* [x] Broad broken question-mark scan passes.
* [x] Forbidden storage pattern scan passes.
* [x] JavaScript syntax checks pass.
* [ ] Interactive browser behavior was manually verified.

## 2026-06-21 - Add visitor message UI prototype

### Goal

* Create the Feature/visitor-message-prototype branch from latest main.
* Add a bottom-right floating visitor message entry on the public homepage.
* Add a visitor message modal UI prototype.
* Add a static admin message management placeholder page.
* Add a Hub entry for message management.
* Clearly document that real visitor messages require backend, database, authentication, and admin authorization.
* Do not implement localStorage, sessionStorage, cookie persistence, backend, database, API, authentication, or authorization.

### Completed

* Added the visitor message floating tool and modal structure to index.html.
* Added modal styles and responsive layout to styles.css.
* Added modal open, close, Escape, overlay, and validation behavior to script.js.
* Added a Hub entry for message management.
* Added apps/messages/index.html as the admin UI prototype.
* Added apps/messages/messages.css for the admin prototype page.
* Added apps/messages/messages.js for prototype initialization logging.
* Updated README and docs to document the future backend and database requirements.

### Changed Files

* index.html
* styles.css
* script.js
* hub.html
* apps/messages/index.html
* apps/messages/messages.css
* apps/messages/messages.js
* README.md
* docs/00_DESIGN_GUIDE.md
* docs/05_APP_MODULES.md
* docs/06_VISUAL_STYLE_GUIDE.md
* docs/07_ROUTE_AND_SECURITY_RULES.md
* docs/08_PROJECT_STRUCTURE_STANDARD.md
* docs/09_BACKEND_DATABASE_PLAN.md
* docs/PROJECT_HISTORY.md

### Test Results

* [x] Homepage, Hub, and message admin page returned HTTP 200.
* [x] JavaScript syntax checks passed.
* [x] Forbidden storage pattern scan passed.
* [x] No backend, database, API, auth, or message persistence was added.
* [ ] Full interactive browser test was not completed in that task.

## 2026-06-21 - Fix raw Markdown source formatting

### Summary

* Rewrote project documentation as real multi-line Markdown source.
* Added Markdown LF normalization support through .gitattributes.
* Preserved project documentation boundaries for backend, database, auth, and private data.

## 2026-06-18 - Add Special Subscription placeholder app

### Summary

* Added the Special Subscription placeholder child app.
* Linked it from the private Hub placeholder.
* Did not add real subscription, payment, backend, database, auth, or private data storage.

## 2026-06-17 - Public homepage and journey page updates

### Summary

* Added ICP filing footer to the public homepage.
* Split the curved path timeline prototype into journey.html.
* Preserved the public cover homepage.
* Changed journey entry to a hidden lower-left entrance.
* Preserved the hidden private entrance to login.html.

## 2026-06-14 - Curved path timeline prototype work

### Summary

* Built the curved path timeline homepage prototype.
* Added the local editor prototype.
* Added freehand curve drawing and path-anchored node behavior.
* Kept the work static and placeholder-only.
* Did not add backend, database, auth, or real personal data.
