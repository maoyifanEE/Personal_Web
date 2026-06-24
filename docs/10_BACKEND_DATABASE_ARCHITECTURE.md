# Backend and Database Architecture

## 1. Purpose

This document defines the backend and database architecture before implementation starts.

It is a planning document.

It does not create backend code.
It does not create database files.
It does not create API routes.
It does not create authentication or authorization code.

The goal is to make the next development stage safe, maintainable, and practical for a personal website
that will eventually store real long-term private data.

## 2. Current Boundary

The current project is still mostly a static front-end preview.

Current boundaries:

* `index.html` is a public static homepage.
* `login.html` is a static mock private entrance only.
* `hub.html` is a static private hub preview only.
* `apps/messages/index.html` is a static admin message management prototype only.
* Task, health, special subscription, and journey pages are static or local prototypes.
* There is no real backend.
* There is no real database.
* There is no real API.
* There is no real authentication.
* There is no real authorization.
* There is no real cloud sync.

Hidden links are not security.

The fixed test password in login.html is not security.

Direct URL access to private preview pages is still possible.

No real private data should be stored until backend, database, authentication, authorization, backup,
and admin data-management rules are implemented correctly.

## 3. Target Architecture

The target production architecture should be:

```text
Phone / desktop browser
        |
        | HTTPS
        v
Nginx reverse proxy
        |
        | local private upstream
        v
Backend API service
        |
        | private database connection
        v
PostgreSQL database
        |
        +--> backup jobs
        |
        +--> admin data center views
```

Target components:

* Browser: public homepage, private tools, admin UI, and future data-management screens.
* Nginx HTTPS: public TLS endpoint and reverse proxy to the backend API.
* Backend API: the only normal application path between browser and database.
* PostgreSQL: production database on the server, not exposed to the public internet.
* Admin data center: protected UI for viewing and managing all stored data.
* Backups: server-side backups outside the Git repository.
* Environment variables: server-only configuration.
* Secrets: stored outside GitHub, for example in /etc/personal-web/.env.

Server folder concept:

```text
/var/www/Personal_Web/          # deployed repository code
/etc/personal-web/.env          # server-only production secrets
/var/lib/personal-web/data/     # database runtime data and uploads if needed
/var/backups/personal-web/      # protected backups
```

These paths are architecture documentation only.

Do not create these server files in this repository.

## 4. Recommended Stack

### Option A: Node.js / Express + PostgreSQL

Strengths:

* JavaScript matches the current front-end language.
* Express is small and familiar.
* Many PostgreSQL, session, validation, and migration libraries exist.
* Easy to deploy as a single service behind Nginx.

Risks:

* Express is minimal, so security structure must be assembled carefully.
* Validation, error handling, route organization, and OpenAPI documentation require discipline.
* The ecosystem offers many choices, which can make AI-assisted work drift if not constrained.

### Option B: Python / FastAPI + PostgreSQL

Strengths:

* FastAPI has clear route structure, typed request models, and automatic API documentation.
* Pydantic validation can make API input boundaries explicit.
* SQLAlchemy and Alembic provide mature database and migration patterns.
* Python is readable for architecture-heavy backend work.
* The typed request/response style is useful for AI-assisted development because contracts stay visible.

Risks:

* It introduces a second language next to the existing front-end JavaScript.
* Deployment needs a Python service runner such as Uvicorn behind Nginx.
* The user must become comfortable with Python virtual environments and migrations.

### Recommendation

Recommended stack for this project:

* Backend runtime: Python / FastAPI.
* Database: PostgreSQL.
* Database access: SQLAlchemy.
* Migration tool: Alembic.
* Password hashing: Argon2id or bcrypt through a maintained password-hashing library.
* Session/token approach: decide later; prefer secure server-side sessions first unless API-only mobile
  clients become a hard requirement.
* Process manager: systemd service on the Linux server.
* Reverse proxy: Nginx HTTPS in front of the backend service.

Reasoning:

This is a small personal website on one remote Linux server.

The main risk is not raw throughput.

The main risk is accidentally mixing prototypes, private data, secrets, and production behavior.

FastAPI plus typed request models and Alembic migrations gives the project clearer contracts before code grows.

That clarity is helpful for an AI-assisted non-professional developer because future tasks can point to
explicit schemas, route groups, and validation models.

## 5. Data Ownership and Storage Rules

Code belongs in GitHub.

Real private data belongs in the production database.

Secrets belong in server-only environment files.

Backups are not GitHub files.

Uploads are not GitHub files.

Logs are not GitHub files.

Production database files are not GitHub files.

Rules:

* `.env.example` may contain placeholders only.
* `.env` must never be committed.
* Production credentials must live outside the repository.
* Real user records must not be hard-coded into HTML, CSS, JavaScript, Markdown, or JSON files.
* Test data may exist in the database during development, but it must be clearly marked as test data.
* Database schema migrations may be versioned in GitHub.
* Actual database contents must not be versioned in GitHub.

## 6. Data Categories

Planned data domains:

* Users.
* Roles.
* Sessions or authentication records.
* Visitor messages.
* Task list data.
* Health management data.
* Special subscription data.
* Journey data if later persisted.
* Admin audit logs.
* Data management metadata.
* Backup metadata.

Data sensitivity varies by domain.

Health data, account data, admin actions, and private notes should be treated as sensitive from the beginning.

Visitor messages are user-submitted private data.

Task and subscription data may become sensitive because they describe personal activity and spending.

## 7. Formal Data vs Test Data

The project needs a project-wide data classification model.

Every user-created or admin-created data record should be identifiable as one of:

* `production`
* `test`
* `demo`
* `imported`
* `archived`

Recommended canonical field:

* `data_scope`

Reason:

`data_scope` is short, easy to filter, and broad enough to cover production, test, demo, imported, and archived data.

Recommended values:

```text
production
test
demo
imported
archived
```

Recommended supporting fields:

* `created_by`
* `updated_by`
* `deleted_at`
* `deleted_by`
* `delete_reason`
* `source_app`
* `admin_note`

Compatibility field:

* `is_test`

`is_test` may be useful as a derived or compatibility field.

It should not be the canonical classification because it cannot represent demo, imported, or archived states.

Admin filtering requirements:

* Filter by app or module.
* Filter by production, test, demo, imported, or archived data.
* Filter by active, archived, soft-deleted, or purged eligibility.
* Filter by owner or user.
* Filter by creation time.
* Filter by update time.

Each persisted app table should either include data_scope directly or inherit it through a shared metadata table
if a future schema chooses that pattern.

For this project, direct fields on each app table are simpler and easier to inspect.

## 8. Soft Delete and Purge Policy

Default delete should be soft delete.

Soft-deleted records remain recoverable.

Soft delete should set:

* `deleted_at`
* `deleted_by`
* `delete_reason`

Permanent purge should be admin-only.

Purge should require explicit confirmation.

Purge should be audited.

Test data can be bulk soft-deleted.

Test data can be bulk purged only after backup or export confirmation.

Production data should not be bulk-purged casually.

Production purge should require:

* Admin authentication.
* Admin authorization.
* Record count preview.
* Backup or export confirmation.
* Human-readable purge reason.
* Audit log entry.

## 9. Admin Data Center UI

Recommended route concept:

* `/admin/data`

Reason:

`/admin/data` makes the future route clearly backend-protected and admin-only.

The current static project uses the apps folder for front-end child app prototypes.

The future admin data center should not look like another unprotected static child app.

During early front-end prototyping, a static mock may live under apps/admin-data/index.html.

Production should move to protected /admin/data.

Required admin UI areas:

* Overview dashboard.
* Data category sidebar.
* Unified table view.
* Filters.
* Search.
* Record detail panel.
* Production, test, demo, imported, and archived badges.
* Soft delete button.
* Restore button.
* Purge button.
* Export button.
* Audit log view.
* Backup status view.

Required data areas:

* Visitor messages.
* Tasks.
* Health records.
* Subscriptions.
* Users.
* Audit logs.

The admin data center must be protected by real admin authentication and authorization before production use.

No direct database access should be exposed to the browser.

## 10. Security Requirements

Non-negotiable requirements:

* HTTPS only for production browser traffic.
* Database is not exposed publicly.
* Browser never connects directly to PostgreSQL.
* Secrets are not stored in GitHub.
* Passwords are hashed, never stored in plaintext.
* Admin routes require authentication.
* Admin APIs require authorization.
* Object-level authorization checks are required.
* Server-side validation is required for every write route.
* Public submission endpoints need rate limiting.
* CSRF or equivalent session protection is required when cookie sessions are used.
* Audit logging is required for admin data changes.
* Backups must be protected.
* Real data must not be stored in static files.
* Error responses must not leak secrets, stack traces, or unrelated private data.
* Production logs must not contain plaintext passwords or full sensitive payloads.

## 11. API Design Principles

Do not implement API routes yet.

Future route groups may include:

* `/api/auth/*`
* `/api/admin/data/*`
* `/api/messages/*`
* `/api/tasks/*`
* `/api/health/*`
* `/api/subscriptions/*`

Principles:

* Every write route validates input server-side.
* Every private route checks authenticated user identity.
* Every admin route checks admin role.
* Every record-level route checks object ownership or permission.
* API responses must not leak unrelated user data.
* Public routes should expose the minimum fields required.
* Admin routes should return enough metadata for filtering, audit, restore, and export.
* Bulk actions must provide count previews and audit records.
* Delete actions should soft-delete by default.
* Purge actions should be separate from delete actions.

## 12. Database Schema Planning

Do not write final SQL migrations yet.

Draft table groups:

### `users`

Purpose:

* Store administrator and future allowed-user accounts.

Important fields:

* `id`
* `email`
* `display_name`
* `password_hash`
* `role`
* `is_active`
* `created_at`
* `updated_at`
* `last_login_at`

Needs `data_scope`:

* Usually no, because user accounts are control-plane records.

Needs soft delete fields:

* Yes, for account deactivation history.

Security notes:

* Store password hashes only.
* Never store plaintext passwords.
* Email uniqueness should be enforced.

### `roles` or role enum

Purpose:

* Define owner, administrator, and future allowed-user permissions.

Important fields:

* `id` or enum value.
* `name`
* `description`
* `created_at`

Needs `data_scope`:

* No.

Needs soft delete fields:

* Usually no for enum; maybe yes for table-based roles.

Security notes:

* Role changes must be audited.

### `sessions`

Purpose:

* Store server-side login sessions if that auth design is chosen.

Important fields:

* `id`
* `user_id`
* `session_hash`
* `created_at`
* `expires_at`
* `revoked_at`
* `ip_hash`
* `user_agent_hash`

Needs `data_scope`:

* No.

Needs soft delete fields:

* Revocation fields are more appropriate.

Security notes:

* Store hashed session identifiers only.
* Support logout and forced revocation.

### `visitor_messages`

Purpose:

* Store real visitor submissions.

Important fields:

* `id`
* `created_at`
* `nickname`
* `contact`
* `message_content`
* `read_status`
* `reply_status`
* `admin_reply`
* `replied_at`
* `data_scope`
* `source_app`
* `admin_note`
* `deleted_at`
* `deleted_by`
* `delete_reason`

Needs `data_scope`:

* Yes.

Needs soft delete fields:

* Yes.

Security notes:

* Public create route needs rate limiting.
* Admin read route requires admin authorization.

### `tasks`

Purpose:

* Store task list records after migration from local prototype storage.

Important fields:

* `id`
* `owner_user_id`
* `title`
* `description`
* `status`
* `priority`
* `due_at`
* `completed_at`
* `data_scope`
* `source_app`
* `admin_note`
* `created_at`
* `updated_at`
* `deleted_at`

Needs `data_scope`:

* Yes.

Needs soft delete fields:

* Yes.

Security notes:

* Record access must check owner or admin role.

### `health_items`

Purpose:

* Store health management records.

Important fields:

* `id`
* `owner_user_id`
* `record_type`
* `recorded_at`
* `value`
* `unit`
* `note`
* `data_scope`
* `source_app`
* `created_at`
* `updated_at`
* `deleted_at`

Needs `data_scope`:

* Yes.

Needs soft delete fields:

* Yes.

Security notes:

* Health data is sensitive.
* Default admin views should avoid unnecessary detail previews.

### `special_subscriptions`

Purpose:

* Store future subscription or payment-tracking records.

Important fields:

* `id`
* `owner_user_id`
* `name`
* `provider`
* `status`
* `amount`
* `currency`
* `billing_cycle`
* `next_billing_at`
* `data_scope`
* `created_at`
* `updated_at`
* `deleted_at`

Needs `data_scope`:

* Yes.

Needs soft delete fields:

* Yes.

Security notes:

* Do not store full payment credentials.
* Payment integration must be planned separately.

### `audit_logs`

Purpose:

* Record admin and security-relevant actions.

Important fields:

* `id`
* `actor_user_id`
* `action`
* `target_table`
* `target_id`
* `created_at`
* `ip_hash`
* `user_agent_hash`
* `summary`

Needs `data_scope`:

* No, because audit logs are system records.

Needs soft delete fields:

* Usually no.

Security notes:

* Audit logs should be append-only in normal use.
* Purging audit logs should be rare and documented.

### `admin_data_actions`

Purpose:

* Store bulk admin data-management actions such as archive, export, restore, and purge requests.

Important fields:

* `id`
* `actor_user_id`
* `action_type`
* `target_app`
* `target_scope`
* `record_count`
* `reason`
* `created_at`
* `completed_at`
* `status`

Needs `data_scope`:

* It should record target scope, but it is itself a system record.

Needs soft delete fields:

* Usually no.

Security notes:

* Purge actions must be auditable.

### `backup_runs`

Purpose:

* Track backup and restore job status.

Important fields:

* `id`
* `started_at`
* `finished_at`
* `status`
* `backup_type`
* `storage_location_label`
* `checksum`
* `created_by`
* `notes`

Needs `data_scope`:

* No.

Needs soft delete fields:

* No.

Security notes:

* Do not store backup secrets.
* Do not expose real backup file paths publicly.

## 13. Migration and Backup Strategy

Schema migrations must be versioned in GitHub.

Actual database contents must not be committed.

Migration rules:

* Each schema change should have a migration file.
* Migrations should be reviewed before deployment.
* Destructive migrations require backup confirmation.
* Production migration commands should run on the server, not in the public browser.

Backup rules:

* Production backups live outside the repository.
* Backup files should be ignored by Git.
* Backup jobs should record status in backup_runs.
* Before destructive admin operations, backup or export should exist.
* Restore process should be documented before real data becomes important.
* Backups should be access-controlled and protected from public web access.

## 14. Implementation Phases

### Phase 1: Architecture docs only

Goal:

* Define backend, database, security, data ownership, and admin data-management architecture.

Files likely touched:

* `docs/10_BACKEND_DATABASE_ARCHITECTURE.md`
* `docs/09_BACKEND_DATABASE_PLAN.md`
* `docs/00_DESIGN_GUIDE.md`
* `docs/07_ROUTE_AND_SECURITY_RULES.md`
* `README.md`

Must not do:

* Do not add backend code.
* Do not add database files.
* Do not add API routes.
* Do not add authentication.

Acceptance criteria:

* Documentation clearly says backend is still not implemented.
* Architecture choices and risks are documented.

### Phase 2: Backend skeleton

Goal:

* Add backend service skeleton, environment config pattern, PostgreSQL connection, health check endpoint,
  and migration baseline.

Files likely touched:

* Future backend service folder.
* Future migration folder.
* `.env.example` with placeholders only.
* Documentation.

Must not do:

* Do not store real private data.
* Do not expose database publicly.
* Do not implement private app data storage yet.

Acceptance criteria:

* Backend starts locally with placeholder config.
* Health check works.
* Database connection uses server-side config only.
* Baseline migration exists.

### Phase 3: Real admin login

Goal:

* Implement admin user table, password hashing, session or token design, and protected routes.

Files likely touched:

* Backend auth routes.
* User model.
* Session model.
* Login UI integration.
* Security docs.

Must not do:

* Do not store plaintext passwords.
* Do not protect routes only in frontend JavaScript.
* Do not use static mock password for production.

Acceptance criteria:

* Admin can log in with real server-side verification.
* Protected routes reject unauthenticated access.
* Logout or session revocation exists.

### Phase 4: Admin data center UI shell

Goal:

* Add protected admin data center shell with read-only database overview and audit log foundation.

Files likely touched:

* Admin UI route.
* Backend admin data endpoints.
* Audit log table and service.

Must not do:

* Do not allow destructive actions before backup and audit rules exist.
* Do not expose admin data to non-admin users.

Acceptance criteria:

* Admin can view categories and counts.
* Admin can filter by data_scope.
* Audit log records admin view or action events as designed.

### Phase 5: Visitor message real storage

Goal:

* Store visitor messages through backend API and manage them in admin UI.

Files likely touched:

* Visitor message API.
* `visitor_messages` table migration.
* Visitor message frontend.
* Admin data center message view.

Must not do:

* Do not store messages in localStorage, sessionStorage, cookies, static JSON, or GitHub files.
* Do not expose all messages publicly.

Acceptance criteria:

* Visitor message submit writes to database.
* Admin can read, mark, archive, soft-delete, restore, and export messages.
* Public endpoint is rate limited.

### Phase 6: Task, health, and subscription migration

Goal:

* Move static/local prototype data areas to real backend storage.

Files likely touched:

* Task API and table.
* Health API and table.
* Subscription API and table.
* Front-end app integrations.
* Migration or import tools.

Must not do:

* Do not migrate real personal data without backup/export plan.
* Do not mix test and production data without data_scope.

Acceptance criteria:

* Data syncs through backend across browsers.
* Records include data_scope.
* Admin data center can filter and manage records.

### Phase 7: Backup, restore, and deployment hardening

Goal:

* Add backup automation, restore documentation, deployment hardening, and monitoring.

Files likely touched:

* Deployment docs.
* Backup scripts or service definitions in a future implementation branch.
* Admin backup status view.

Must not do:

* Do not commit backup files.
* Do not commit server secrets.
* Do not expose backup directories to Nginx public web roots.

Acceptance criteria:

* Backup and restore process is documented and tested.
* Destructive admin actions require backup/export confirmation.
* Nginx, backend service, and database exposure are reviewed.

## 15. Risks and Decisions Needed

User decisions needed before coding:

* Confirm Python / FastAPI or choose Node.js / Express instead.
* Confirm PostgreSQL as the production database instead of SQLite.
* Confirm production admin route path, recommended as /admin/data.
* Confirm canonical data classification field name, recommended as data_scope.
* Confirm backup policy and retention expectations.
* Confirm whether future auth should use server-side sessions or JWT-style tokens.
* Confirm whether visitor messages become a public submission form first or private-only form first.
* Confirm whether health data needs extra privacy handling in admin views.
* Confirm whether test data can be bulk purged after export confirmation.

## 16. Glossary

Database:

* The server-side system that stores real application data.

Backend:

* The server-side application that receives browser requests, checks permissions, validates input,
  and talks to the database.

API:

* A defined set of backend routes that the browser calls to read or write data.

Migration:

* A versioned database schema change.

Environment variable:

* A server-side configuration value provided outside the code.

Secret:

* A private value such as a database password, signing key, or access token.

Authentication:

* Proving who the user is.

Authorization:

* Deciding what the authenticated user is allowed to do.

Role:

* A permission category such as owner or administrator.

Session:

* A server-recognized login state for a browser or device.

Soft delete:

* Marking a record as deleted without physically removing it.

Purge:

* Permanently removing data so normal restore is not available.

Audit log:

* A record of important admin or security-relevant actions.

Backup:

* A protected copy of data used for recovery.

Production data:

* Real long-term data intended to be kept.

Test data:

* Temporary development or verification data that should be easy to filter, delete, or purge later.
