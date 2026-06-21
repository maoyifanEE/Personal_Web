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
* [ ] Interactive browser behavior was not manually verified in the Codex environment.

### Source Formatting Follow-up

* This entry remains a documentation record only.
* The Hub card wording fix did not change the destination URL.
* The modal close button fix did not change modal behavior.
* The visitor message form still does not persist data.
* The visitor message form still does not call a backend API.
* The admin message page still shows sample placeholder rows only.
* The admin message page still does not load real messages.
* The branch still requires review before any merge to main.

### Verification Boundary

* Automated source checks were used for this cleanup.
* HTTP smoke checks were used for page availability.
* Interactive browser behavior was not manually verified.
* Browser interaction checkboxes must remain unchecked until actually tested.
* Future manual testing should verify modal open and close behavior.
* Future manual testing should verify validation copy in the modal.
* Future manual testing should verify that no save behavior is implied.

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

### Visitor-Side Prototype Boundary

* The floating button is a navigation and UI affordance only.
* The modal is a front-end prototype only.
* The nickname field is validated on the client for prototype feedback.
* The message field is validated on the client for prototype feedback.
* The contact field is optional in the prototype.
* Successful validation shows a not-saved prototype notice.
* Successful validation does not create a message record.
* Successful validation does not send email.
* Successful validation does not send notifications.
* Successful validation does not call a server endpoint.

### Admin-Side Prototype Boundary

* The message management page is a static child app prototype.
* The table rows are sample placeholders only.
* The read status values are sample placeholders only.
* The reply status values are sample placeholders only.
* The action buttons do not perform real state changes.
* The page does not fetch real visitor messages.
* The page does not require real administrator authentication yet.
* The page must not be treated as a protected admin console.

### Future Implementation Notes

* Real visitor messages require a backend API.
* Real visitor messages require server-side database storage.
* Real visitor messages require spam and abuse planning.
* Real admin management requires authentication.
* Real admin management requires authorization.
* Real admin management requires read and reply status persistence.
* Real admin management requires audit-friendly data handling.
* Real admin management must not store private data in GitHub.

## 2026-06-21 - Fix raw Markdown source formatting

### Summary

* Rewrote project documentation as real multi-line Markdown source.
* Added Markdown LF normalization support through .gitattributes.
* Preserved project documentation boundaries for backend, database, auth, and private data.

### Formatting Requirements

* Markdown headings should stay on their own physical lines.
* Markdown bullets should stay on their own physical lines.
* Markdown checklist items should stay on their own physical lines.
* Markdown tables should keep one row per physical line.
* Source files should use standard UTF-8 text.
* Markdown files should use LF line endings.
* Raw GitHub views should remain readable.
* Documentation changes should not alter app behavior.

### Documentation Safety Notes

* Documentation may describe planned backend work.
* Documentation must clearly mark planned work as not implemented.
* Documentation must not claim that static placeholders are secure.
* Documentation must not claim that localStorage is production storage.
* Documentation must not include real private data.
* Documentation must not include secrets.
* Documentation must not include production database files.

## 2026-06-18 - Add Special Subscription placeholder app

### Summary

* Added the Special Subscription placeholder child app.
* Linked it from the private Hub placeholder.
* Did not add real subscription, payment, backend, database, auth, or private data storage.

### Prototype Boundary

* The page is a blank child app placeholder.
* It does not implement subscription management.
* It does not implement payment.
* It does not implement account binding.
* It does not implement API calls.
* It does not store private data.
* It exists so future requirements have a stable route.

## 2026-06-17 - Public homepage and journey page updates

### Summary

* Added ICP filing footer to the public homepage.
* Split the curved path timeline prototype into journey.html.
* Preserved the public cover homepage.
* Changed journey entry to a hidden lower-left entrance.
* Preserved the hidden private entrance to login.html.

### Cover Page Notes

* The public cover page remains the stable first page.
* The ICP filing footer remains visible on the public cover page.
* The hidden private entrance remains separate from the journey entrance.
* Normal cover background clicks should not navigate to journey.html.
* The journey entrance is visually hidden in the lower-left corner.
* The private entrance links to login.html.
* Hidden entrances are navigation devices only.
* Hidden entrances are not access control.

### Journey Page Notes

* journey.html contains the curved path timeline prototype.
* journey.css contains journey-specific styling.
* journey.js contains journey-specific behavior.
* The journey editor remains a local/static prototype.
* The journey editor is not a secure admin system.
* The journey page uses placeholder content only.

## 2026-06-14 - Curved path timeline prototype work

### Summary

* Built the curved path timeline homepage prototype.
* Added the local editor prototype.
* Added freehand curve drawing and path-anchored node behavior.
* Kept the work static and placeholder-only.
* Did not add backend, database, auth, or real personal data.

### Timeline Prototype Notes

* The first timeline version used Area 01 through Area 04.
* Major event nodes and minor event nodes were placeholder data.
* Overview mode showed the main storyline.
* Details mode showed additional minor nodes.
* Later editor work added local editing controls.
* Freehand curve drawing allowed direct route sketching.
* Path percentage node anchoring let nodes follow the curve.
* The timeline remained a front-end prototype.
* The timeline did not add real personal biography data.
* The timeline did not add real city names.
* The timeline did not add real photos.
* The timeline did not add backend persistence.

## Ongoing Project Rules

### Data Rules

* Real private data must not be committed to GitHub.
* Secrets must not be committed to GitHub.
* Database files must not be committed to GitHub.
* Uploads must not be committed to GitHub.
* Logs must not be committed to GitHub.
* Backups must not be committed to GitHub.
* Production-only configuration must not be committed to GitHub.

### Branch Rules

* Feature work should use a Feature branch.
* Fix work should use a BugFix branch when appropriate.
* Work should not happen directly on main unless explicitly requested.
* Merges should happen only when explicitly requested.
* Pushes should happen only when explicitly requested or required by the task.

### Verification Rules

* Mark browser tests as passed only when they were actually run.
* Mark source checks as passed only when commands actually passed.
* Keep automated check output available in task summaries.
* Keep manual test gaps visible instead of implying success.
* Preserve application behavior during documentation-only changes.
