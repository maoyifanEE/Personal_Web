# Two-Computer Work Handoff

Personal_Web uses GitHub as the source of truth for two-computer editing handoff.

## Normal Daily Use

The normal user-facing Windows entry point is a single Desktop shortcut:

```text
Personal Web.lnk
  -> work-handoff.bat
  -> start-shared-dev.bat
  -> shared development starts
  -> website opens
```

Normal startup does not synchronize Git, does not update handoff metadata, and
does not ask the user to choose an operation. It only starts the reviewed shared
development launcher and opens the local Personal_Web site.

The shortcut is for daily site startup only. It is not a cross-computer transfer
button.

## Changing Computers

Only one computer should actively edit this repository at a time.

When leaving one computer, ask Codex to complete the leaving-computer procedure:

```text
checks status
  -> commits
  -> pushes
  -> reports exact branch and commit
```

When receiving work on another computer, ask Codex to complete the
receiving-computer procedure:

```text
checks local state
  -> fetches
  -> switches safely
  -> fast-forwards to the exact commit
  -> validates SSH and secret
  -> starts development
```

Codex may use the existing reviewed internal handoff implementation when the
user explicitly asks for that metadata-backed workflow. There are no separate
user-facing Sync or Handoff BAT files.

## Internal Metadata Model

The application branch and commit are recorded on the dedicated metadata branch
`meta/work-handoff`. That branch is an orphan metadata branch and contains only
`active-work.json`. It is not an application branch and must never be merged into
`main`.

## Metadata

`active-work.json` is canonical UTF-8 JSON with exactly these keys:

```json
{
  "schemaVersion": 1,
  "repository": "maoyifanEE/Personal_Web",
  "branch": "Feature/example",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "recordedAtUtc": "2026-07-27T12:34:56.0000000Z"
}
```

Allowed application branches are `main`, `Feature/<name>`, and `BugFix/<name>`.
The recorded commit is a 40-character lowercase SHA-1 object id.

Metadata commits are created with Git plumbing from the application working tree:
`hash-object`, `mktree`, `commit-tree`, and a normal push to
`refs/heads/meta/work-handoff`. Existing metadata commits are used as the parent,
so updates are ordinary fast-forward history. Force push is not used.

Reads of `meta/work-handoff` first classify the authoritative remote state as
present, absent, or failed. Only a successful empty remote probe is treated as
not initialized. A failed probe stops the operation, and a stale local
`origin/meta/work-handoff` ref is never used as authority.

After the authoritative remote commit is fetched and matched, the metadata
commit is validated before `active-work.json` is read. The object must be a
commit, the first metadata commit may have zero parents, later commits must have
exactly one parent, and the complete recursive tree must contain exactly one
ordinary file:

```text
100644 blob active-work.json
```

Extra files, nested paths, executable files, symlinks, submodule entries, merge
commits, missing JSON, or non-commit objects stop Status, Sync, and Handoff
without repairing or rewriting the metadata branch.

## End And Handoff

`scripts/work-handoff.ps1 -Action EndAndHandoff` records the current already
pushed branch and exact commit. It requires a clean tracked worktree, no Git
operation in progress, a valid SSH origin for `maoyifanEE/Personal_Web`, a valid
application branch, an `origin/<branch>` counterpart, and `HEAD == origin/<branch>`.

Untracked files are listed in sanitized form and are not added to metadata.
Non-conflicting files such as `test.png` may remain.

If a shared-development session is active, the handoff flow asks the user to
confirm browser/Journey changes are saved, then stops the session through
`stop-shared-dev.bat` and requires ports `8000`, `4173`, and `15432` to close.

## Sync And Start

`scripts/work-handoff.ps1 -Action SyncAndStart` fetches the metadata branch,
validates the JSON schema, verifies the remote application branch still points to
the recorded commit, protects untracked files from overwrite, switches or creates
the local target branch, and updates only by fast-forward.

The existing `start-shared-dev.bat` launcher is invoked only after:

```text
HEAD == recorded commit
HEAD == origin/<recorded branch>
tracked worktree clean
```

The existing shared launcher remains responsible for secret validation, SSH
validation, database identity, Alembic compatibility, SFTP validation, and process
startup. Guest reset remains the default; `-KeepSession` maps to the existing
`keep-session` launcher option.

## Internal UI

`scripts/work-handoff.ps1 -Action Ui` remains available as an internal
Codex/diagnostic implementation. It is not exposed by the normal Desktop
shortcut.

The internal UI displays local branch, local abbreviated commit, tracked
worktree status, latest handoff branch, handoff abbreviated commit, handoff time,
and success or failure status. Synchronization uses the exact recorded branch and
commit, not automatically the latest `main`.

Standalone `Status` is filesystem read-only: it does not create or prune handoff
logs, does not write metadata, does not switch branches, and does not start or
stop shared development. User-facing commit display uses 12-character
abbreviations; metadata JSON and exact `HEAD` verification continue to use full
40-character commits.

## Logs

Sanitized logs are written under `.local_logs\handoff` and retained for seven
days. Logs record handoff stages, branch names, abbreviated commits, status, and
failure categories. They do not record secrets, SSH configuration, private keys,
environment variables, database credentials, local user paths, or full remote
URLs.
