# Two-Computer Work Handoff

Personal_Web uses GitHub as the source of truth for two-computer editing handoff.

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

## UI

`work-handoff.bat` opens the compact Windows UI by default. The primary buttons
are:

```text
同步并开始工作
结束工作并交接
```

The optional checkbox is unchecked by default:

```text
保留当前登录状态
```

The UI displays local branch, local abbreviated commit, tracked worktree status,
latest handoff branch, handoff abbreviated commit, handoff time, and success or
failure status. It loads this read-only status automatically when the UI opens.
Refresh uses the same status path. Synchronization uses the exact recorded
branch and commit, not automatically the latest `main`.

## Logs

Sanitized logs are written under `.local_logs\handoff` and retained for seven
days. Logs record handoff stages, branch names, abbreviated commits, status, and
failure categories. They do not record secrets, SSH configuration, private keys,
environment variables, database credentials, local user paths, or full remote
URLs.
