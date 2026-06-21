# Backend and Database Plan

## Current Status

The following systems are **not implemented yet**:

- Backend: not implemented
- Database: not implemented
- API: not implemented
- Authentication: not implemented
- Authorization: not implemented
- Cloud sync: not implemented

This repository is currently a static front-end preview.

## Why This Document Exists

The project will eventually need backend/database support for real private data,
multi-device sync, login, authorization, and safer long-term storage.

This document exists to prevent future work from inventing backend/database
architecture casually inside unrelated feature branches.

It is a planning and boundary document only. It does not implement backend code,
database files, API routes, authentication, or authorization.

## Future Data Ownership Model

Follow `docs/00_DESIGN_GUIDE.md`.

Long-term ownership rules:

- Code belongs in GitHub.
- Real private data does not belong in GitHub.
- Secrets do not belong in GitHub.
- Database files do not belong in GitHub.
- Uploads, logs, and backups do not belong in GitHub.
- Production config does not belong in GitHub.

## Planned Future Components

The following components are **planned only / not implemented yet**:

- Backend server
- Authentication
- Authorization
- Database
- Backup system
- API layer
- Admin/user roles
- Server-side validation

Do not claim these exist until they are implemented in a dedicated task.

## Planned User Roles

The following roles are **planned only / not implemented yet**:

- Owner / administrator
- Allowed user / member
- Public visitor

Do not implement roles in this documentation task.

## Future App Data Areas

Future backend/database work may eventually cover:

- Task List data
- Health Management data
- Special Subscription data
- Journey page data
- User/account data

This document intentionally does not define exact tables or schemas yet.

## Rules for Future Backend Work

- Backend work must be done in a dedicated branch.
- Database schema must be documented before implementation.
- API routes must be documented before implementation.
- Authentication and authorization must be designed before storing real private
  data.
- No real private data should be committed during development.
- Any migration from `localStorage` to server storage must include a
  backup/export plan.
- Backend work must not weaken `.gitignore` safety rules.

## Not Implemented Yet

The following are not implemented in the current project:

- Real backend
- Real database
- Real login
- Real authorization
- Real cloud sync
- Real reminders
- Real payment/subscription integration

This document is only a plan.
