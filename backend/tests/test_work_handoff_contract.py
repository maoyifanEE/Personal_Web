"""Contract and isolated Git behavior tests for two-computer work handoff."""

from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "work-handoff.ps1"
BAT = REPO_ROOT / "work-handoff.bat"
CONTRACT = REPO_ROOT / "config" / "work-handoff-contract.json"
META_BRANCH = "meta/work-handoff"


def run(
    args: list[str],
    cwd: Path,
    *,
    timeout: int = 60,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
        check=False,
        env=env,
    )


def git(cwd: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = run(["git", *args], cwd)
    if check:
        assert result.returncode == 0, result.stderr + result.stdout
    return result


def ps(repo: Path, log_root: Path, *args: str, timeout: int = 60) -> subprocess.CompletedProcess[str]:
    return run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(SCRIPT),
            "-TestMode",
            "-RepositoryRoot",
            str(repo),
            "-LogRoot",
            str(log_root),
            *args,
        ],
        repo,
        timeout=timeout,
    )


def seed_repo(tmp_path: Path) -> tuple[Path, Path, Path, Path]:
    origin = tmp_path / "origin.git"
    git(tmp_path, "init", "--bare", str(origin))
    source = tmp_path / "source"
    git(tmp_path, "clone", str(origin), str(source))
    git(source, "config", "user.email", "test@example.test")
    git(source, "config", "user.name", "Test User")
    (source / "scripts").mkdir()
    (source / "config").mkdir()
    (source / "start-shared-dev.bat").write_text("@echo off\r\nexit /b 0\r\n", encoding="utf-8")
    for path in ["work-handoff.bat", "scripts/work-handoff.ps1", "config/work-handoff-contract.json"]:
      src = REPO_ROOT / path
      dst = source / path
      dst.parent.mkdir(parents=True, exist_ok=True)
      dst.write_bytes(src.read_bytes())
    (source / "app.txt").write_text("main\n", encoding="utf-8")
    git(source, "add", ".")
    git(source, "commit", "-m", "seed")
    git(source, "branch", "-M", "main")
    git(source, "push", "-u", "origin", "main")
    git(origin, "symbolic-ref", "HEAD", "refs/heads/main")
    comp_a = tmp_path / "computer-a"
    comp_b = tmp_path / "computer-b"
    git(tmp_path, "clone", str(origin), str(comp_a))
    git(tmp_path, "clone", str(origin), str(comp_b))
    for repo in [comp_a, comp_b]:
        git(repo, "config", "user.email", "test@example.test")
        git(repo, "config", "user.name", "Test User")
    return origin, source, comp_a, comp_b


def make_branch(repo: Path, name: str, text: str) -> str:
    git(repo, "switch", "-c", name)
    (repo / "app.txt").write_text(text + "\n", encoding="utf-8")
    git(repo, "add", "app.txt")
    git(repo, "commit", "-m", f"update {name}")
    git(repo, "push", "-u", "origin", name)
    return git(repo, "rev-parse", "HEAD").stdout.strip()


def read_metadata(repo: Path) -> dict[str, object]:
    text = git(repo, "show", f"origin/{META_BRANCH}:active-work.json").stdout
    return json.loads(text)


def test_contract_file_is_minimal_and_metadata_safe() -> None:
    data = json.loads(CONTRACT.read_text(encoding="utf-8"))

    assert data == {
        "schemaVersion": 1,
        "repository": "maoyifanEE/Personal_Web",
        "metadataBranch": "meta/work-handoff",
        "metadataFile": "active-work.json",
        "allowedBranchPatterns": ["main", "Feature/<name>", "BugFix/<name>"],
        "requiredFiles": [
            "work-handoff.bat",
            "scripts/work-handoff.ps1",
            "config/work-handoff-contract.json",
        ],
    }


def test_bat_launches_ui_and_returns_powershell_exit_code() -> None:
    text = BAT.read_text(encoding="utf-8")

    assert "scripts\\work-handoff.ps1" in text
    assert "%*" in text
    assert "exit /b %ERRORLEVEL%" in text
    assert 'if /I "%~1"=="--help" goto :usage' in text


def test_successful_handoff_initializes_and_appends_metadata_parent(tmp_path: Path) -> None:
    _, _, comp_a, _ = seed_repo(tmp_path)
    logs = tmp_path / "logs"

    first = ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved")
    assert first.returncode == 0, first.stdout + first.stderr
    git(comp_a, "fetch", "origin", f"refs/heads/{META_BRANCH}:refs/remotes/origin/{META_BRANCH}")
    meta = read_metadata(comp_a)
    assert meta["branch"] == "main"
    assert meta["commit"] == git(comp_a, "rev-parse", "HEAD").stdout.strip()
    assert git(comp_a, "ls-tree", "--name-only", f"origin/{META_BRANCH}").stdout.splitlines() == ["active-work.json"]

    feature_commit = make_branch(comp_a, "Feature/example", "feature")
    second = ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved")
    assert second.returncode == 0, second.stdout + second.stderr
    git(comp_a, "fetch", "origin", f"refs/heads/{META_BRANCH}:refs/remotes/origin/{META_BRANCH}")
    meta_commit = git(comp_a, "rev-parse", f"origin/{META_BRANCH}").stdout.strip()
    parents = git(comp_a, "show", "-s", "--format=%P", meta_commit).stdout.split()
    assert len(parents) == 1
    meta = read_metadata(comp_a)
    assert meta["branch"] == "Feature/example"
    assert meta["commit"] == feature_commit


def test_successful_sync_creates_branch_and_starts_launcher_after_exact_head(tmp_path: Path) -> None:
    _, _, comp_a, comp_b = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    target = make_branch(comp_a, "BugFix/example", "bugfix")
    assert ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved").returncode == 0
    launcher = tmp_path / "fake-launcher.bat"
    marker = tmp_path / "launcher-called.txt"
    launcher.write_text(f"@echo off\r\ngit rev-parse HEAD > \"{marker}\"\r\necho %* >> \"{marker}\"\r\nexit /b 0\r\n", encoding="utf-8")

    result = ps(comp_b, logs, "-Action", "SyncAndStart", "-FakeLauncher", str(launcher), "-KeepSession")

    assert result.returncode == 0, result.stdout + result.stderr
    assert git(comp_b, "branch", "--show-current").stdout.strip() == "BugFix/example"
    assert git(comp_b, "rev-parse", "HEAD").stdout.strip() == target
    assert marker.read_text(encoding="utf-8").splitlines() == [target, "keep-session "]


def test_sync_fast_forwards_existing_branch_and_preserves_untracked_file(tmp_path: Path) -> None:
    _, _, comp_a, comp_b = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    target = make_branch(comp_a, "Feature/with-slash-name", "v1")
    assert ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved").returncode == 0
    git(comp_b, "fetch", "origin", "Feature/with-slash-name")
    git(comp_b, "switch", "--track", "-c", "Feature/with-slash-name", "origin/Feature/with-slash-name")
    git(comp_a, "switch", "Feature/with-slash-name")
    (comp_a / "app.txt").write_text("v2\n", encoding="utf-8")
    git(comp_a, "add", "app.txt")
    git(comp_a, "commit", "-m", "v2")
    git(comp_a, "push", "origin", "Feature/with-slash-name")
    new_target = git(comp_a, "rev-parse", "HEAD").stdout.strip()
    assert ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved").returncode == 0
    (comp_b / "test.png").write_bytes(b"safe untracked")
    launcher = tmp_path / "fake-launcher.bat"
    launcher.write_text("@echo off\r\nexit /b 0\r\n", encoding="utf-8")

    result = ps(comp_b, logs, "-Action", "SyncAndStart", "-FakeLauncher", str(launcher))

    assert result.returncode == 0, result.stdout + result.stderr
    assert git(comp_b, "rev-parse", "HEAD").stdout.strip() == new_target
    assert (comp_b / "test.png").read_bytes() == b"safe untracked"
    assert target != new_target


def test_dirty_unpushed_ahead_diverged_and_collision_states_block(tmp_path: Path) -> None:
    _, _, comp_a, comp_b = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    target = make_branch(comp_a, "Feature/example", "feature")
    assert ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved").returncode == 0

    (comp_a / "app.txt").write_text("dirty staged\n", encoding="utf-8")
    git(comp_a, "add", "app.txt")
    assert ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved").returncode != 0
    git(comp_a, "restore", "--staged", "app.txt")
    assert ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved").returncode != 0
    git(comp_a, "restore", "app.txt")
    (comp_a / "app.txt").write_text("unpushed\n", encoding="utf-8")
    git(comp_a, "add", "app.txt")
    git(comp_a, "commit", "-m", "unpushed")
    unpushed = ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved")
    assert unpushed.returncode != 0
    assert "commit" in unpushed.stdout

    git(comp_b, "fetch", "origin", "Feature/example")
    git(comp_b, "switch", "--track", "-c", "Feature/example", "origin/Feature/example")
    (comp_b / "app.txt").write_text("ahead\n", encoding="utf-8")
    git(comp_b, "add", "app.txt")
    git(comp_b, "commit", "-m", "ahead")
    launcher = tmp_path / "fake-launcher.bat"
    launcher.write_text("@echo off\r\nexit /b 0\r\n", encoding="utf-8")
    assert "local_branch_ahead_or_diverged" in ps(comp_b, logs, "-Action", "SyncAndStart", "-FakeLauncher", str(launcher)).stdout

    publisher = tmp_path / "publisher"
    git(tmp_path, "clone", str(tmp_path / "origin.git"), str(publisher))
    git(publisher, "config", "user.email", "test@example.test")
    git(publisher, "config", "user.name", "Test User")
    git(publisher, "switch", "-c", "BugFix/collision")
    (publisher / "collide.txt").write_text("target tracked\n", encoding="utf-8")
    git(publisher, "add", "collide.txt")
    git(publisher, "commit", "-m", "add collision target")
    git(publisher, "push", "-u", "origin", "BugFix/collision")
    assert ps(publisher, logs, "-Action", "EndAndHandoff", "-AssumeSaved").returncode == 0

    comp_c = tmp_path / "computer-c"
    git(tmp_path, "clone", str(tmp_path / "origin.git"), str(comp_c))
    git(comp_c, "config", "user.email", "test@example.test")
    git(comp_c, "config", "user.name", "Test User")
    git(comp_c, "switch", "main")
    (comp_c / "collide.txt").write_text("untracked collision\n", encoding="utf-8")
    result = ps(comp_c, logs, "-Action", "SyncAndStart", "-FakeLauncher", str(launcher))
    assert "untracked_collision" in result.stdout
    assert target


def test_malformed_metadata_and_remote_moved_block_sync(tmp_path: Path) -> None:
    _, _, comp_a, comp_b = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    make_branch(comp_a, "Feature/example", "feature")
    assert ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved").returncode == 0
    git(comp_a, "switch", "Feature/example")
    (comp_a / "app.txt").write_text("advanced\n", encoding="utf-8")
    git(comp_a, "add", "app.txt")
    git(comp_a, "commit", "-m", "advanced")
    git(comp_a, "push", "origin", "Feature/example")
    launcher = tmp_path / "fake-launcher.bat"
    launcher.write_text("@echo off\r\nexit /b 0\r\n", encoding="utf-8")
    assert "remote_branch_moved_after_handoff" in ps(comp_b, logs, "-Action", "SyncAndStart", "-FakeLauncher", str(launcher)).stdout

    bad = tmp_path / "bad"
    git(tmp_path, "clone", str(tmp_path / "origin.git"), str(bad))
    git(bad, "config", "user.email", "test@example.test")
    git(bad, "config", "user.name", "Test User")
    git(bad, "fetch", "origin", META_BRANCH)
    git(bad, "switch", "-c", META_BRANCH, f"origin/{META_BRANCH}")
    (bad / "active-work.json").write_text('{"schemaVersion":1,"repository":"evil","branch":"Feature/example","commit":"bad","recordedAtUtc":"2026-07-27T12:34:56.0000000Z"}\n', encoding="utf-8")
    git(bad, "add", "active-work.json")
    git(bad, "commit", "-m", "bad metadata")
    git(bad, "push", "origin", f"HEAD:refs/heads/{META_BRANCH}")
    result = ps(comp_b, logs, "-Action", "Status")
    assert result.returncode != 0


def test_metadata_push_race_fails_without_force(tmp_path: Path) -> None:
    _, _, comp_a, comp_b = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    make_branch(comp_a, "Feature/a", "a")
    make_branch(comp_b, "BugFix/b", "b")
    paused = subprocess.Popen(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(SCRIPT),
            "-TestMode",
            "-RepositoryRoot",
            str(comp_a),
            "-LogRoot",
            str(logs),
            "-Action",
            "EndAndHandoff",
            "-AssumeSaved",
            "-TestPauseBeforeMetadataPushSeconds",
            "3",
        ],
        cwd=comp_a,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(1)
    second = ps(comp_b, logs, "-Action", "EndAndHandoff", "-AssumeSaved")
    assert second.returncode == 0, second.stdout + second.stderr
    out, err = paused.communicate(timeout=30)
    assert paused.returncode != 0
    assert "metadata_push_rejected" in out + err


def test_mutex_blocks_second_invocation(tmp_path: Path) -> None:
    _, _, comp_a, _ = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    mutex = "Local\\PersonalWebHandoffTestMutex"
    holder = subprocess.Popen(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            f"$m=New-Object System.Threading.Mutex($false,'{mutex}'); $m.WaitOne() | Out-Null; Start-Sleep -Seconds 5; $m.ReleaseMutex(); $m.Dispose()",
        ],
        cwd=comp_a,
    )
    try:
        time.sleep(1)
        result = ps(comp_a, logs, "-Action", "Status", "-TestMutexName", mutex)
        assert result.returncode != 0
        assert "handoff_operation_already_running" in result.stdout
    finally:
        holder.terminate()
        holder.wait(timeout=10)


def test_status_is_read_only_and_metadata_branch_is_isolated(tmp_path: Path) -> None:
    _, _, comp_a, _ = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    before = git(comp_a, "rev-parse", "HEAD").stdout.strip()
    result = ps(comp_a, logs, "-Action", "Status")

    assert result.returncode == 0, result.stdout + result.stderr
    assert git(comp_a, "rev-parse", "HEAD").stdout.strip() == before
    assert git(comp_a, "branch", "--show-current").stdout.strip() == "main"
    assert git(comp_a, "ls-remote", "--heads", "origin", META_BRANCH).stdout.strip() == ""


def test_production_code_uses_no_destructive_git_commands_and_logs_are_sanitized() -> None:
    text = SCRIPT.read_text(encoding="utf-8")
    lower = text.lower()
    forbidden = [
        "reset --hard",
        "git clean",
        "git stash",
        "git rebase",
        "push --force",
        "force-with-lease",
        "branch -d",
        "tag -f",
        "checkout -f",
        "discard-changes",
    ]

    assert [item for item in forbidden if item in lower] == []
    assert '"push", "origin", "${newCommit}:refs/heads/${metadataBranch}"' in text
    assert '"merge", "--ff-only", "origin/${branch}"' in text
    assert ".local_logs\\handoff" in text
    assert "GIT_TERMINAL_PROMPT" in text


def test_ui_button_text_and_test_only_flags_are_explicit() -> None:
    text = SCRIPT.read_text(encoding="utf-8")

    assert "鍚屾骞跺紑濮嬪伐浣?" in text
    assert "缁撴潫宸ヤ綔骞朵氦鎺?" in text
    assert "fake_launcher_requires_test_mode" in text
    assert "test_mode_rejects_production_repository" in text
    assert "test_mode_rejects_production_log_root" in text
