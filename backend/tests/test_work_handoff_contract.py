"""Contract and isolated Git behavior tests for two-computer work handoff."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import base64
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "work-handoff.ps1"
BAT = REPO_ROOT / "work-handoff.bat"
CONTRACT = REPO_ROOT / "config" / "work-handoff-contract.json"
META_BRANCH = "meta/work-handoff"


def sha256(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()


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
    return ps_with_script(SCRIPT, repo, log_root, *args, timeout=timeout)


def ps_with_script(
    script: Path,
    repo: Path,
    log_root: Path,
    *args: str,
    timeout: int = 60,
) -> subprocess.CompletedProcess[str]:
    return run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script),
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


def copy_repo_to_path(source: Path, target: Path) -> None:
    ignore = shutil.ignore_patterns(".git", ".local_logs", ".pytest_cache", "backend/.venv")
    shutil.copytree(source, target, ignore=ignore)


def fake_git_with_ls_remote(tmp_path: Path, body: str) -> Path:
    tmp_path.mkdir(parents=True, exist_ok=True)
    fake = tmp_path / "fake-git.bat"
    fake.write_text(
        "\r\n".join(
            [
                "@echo off",
                "if /I not \"%~1\"==\"ls-remote\" goto delegate",
                *body.splitlines(),
                "exit /b %ERRORLEVEL%",
                ":delegate",
                "git %*",
                "exit /b %ERRORLEVEL%",
            ]
        )
        + "\r\n",
        encoding="utf-8",
    )
    return fake


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


def snapshot_status_immutable_state(repo: Path, log_root: Path) -> dict[str, object]:
    files = sorted(
        str(path.relative_to(repo)).replace("\\", "/")
        for path in repo.rglob("*")
        if ".git" not in path.relative_to(repo).parts and path.is_file()
    )
    logs = {}
    if log_root.exists():
        for path in sorted(log_root.glob("work-handoff-*.log")):
            stat = path.stat()
            logs[path.name] = {"hash": sha256(path), "mtime_ns": stat.st_mtime_ns}
    refs = git(repo, "for-each-ref", "--format=%(refname) %(objectname)").stdout
    return {
        "files": files,
        "log_root_exists": log_root.exists(),
        "logs": logs,
        "refs": refs,
        "branch": git(repo, "branch", "--show-current").stdout.strip(),
        "head": git(repo, "rev-parse", "HEAD").stdout.strip(),
        "tracked": git(repo, "status", "--short").stdout,
    }


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
    assert "%*" not in text
    assert 'set "ARG1=%~1"' in text
    assert 'set "ARG2=%~2"' in text
    assert "-Action Ui" in text
    assert "-Action Status" in text
    assert "-Action SyncAndStart" in text
    assert "-Action EndAndHandoff" in text
    assert "exit /b %ERRORLEVEL%" in text
    assert 'if /I "%ARG1%"=="--help" goto :usage' in text


def test_bat_help_invalid_and_metacharacters_are_safe(tmp_path: Path) -> None:
    sentinel = tmp_path / "sentinel.txt"
    help_result = run(["cmd.exe", "/d", "/c", str(BAT), "--help"], REPO_ROOT)
    invalid = run(["cmd.exe", "/d", "/c", str(BAT), "unknown"], REPO_ROOT)
    too_many = run(["cmd.exe", "/d", "/c", str(BAT), "status", "extra"], REPO_ROOT)
    payload = f'unknown & echo owned > "{sentinel}"'
    injected = run(f'cmd.exe /d /s /c call "{BAT}" "{payload}"', REPO_ROOT)

    assert help_result.returncode == 0
    assert invalid.returncode == 2
    assert too_many.returncode == 2
    assert injected.returncode == 2
    assert not sentinel.exists()
    assert payload not in invalid.stdout
    assert payload not in injected.stdout


def test_native_windows_argument_quoting_edge_cases(tmp_path: Path) -> None:
    _, _, comp_a, _ = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    result = ps(
        comp_a,
        logs,
        "-TestQuoteArgumentsBase64",
        base64.b64encode(
            json.dumps(
                [
                    "",
                    "plain",
                    "space value",
                    "tab\tvalue",
                    'quote"value',
                    "C:\\Path With Spaces\\",
                    "slashes\\\\quote\"end",
                ]
            ).encode("utf-8")
        ).decode("ascii"),
    )

    assert result.returncode == 0, result.stdout + result.stderr
    quoted = result.stdout.split("TEST_QUOTED_ARGUMENTS=", 1)[1].splitlines()[0]
    assert quoted == (
        '"" plain "space value" "tab\tvalue" "quote\\"value" '
        '"C:\\Path With Spaces\\\\" "slashes\\\\quote\\"end"'
    )


def test_remote_handoff_probe_classifies_absent_present_and_failed_states(tmp_path: Path) -> None:
    _, _, comp_a, _ = seed_repo(tmp_path)
    logs = tmp_path / "logs"

    absent = ps(comp_a, logs, "-Action", "Status")
    assert absent.returncode == 0, absent.stdout + absent.stderr
    assert "Handoff branch: (not initialized)" in absent.stdout

    first = ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved")
    assert first.returncode == 0, first.stdout + first.stderr
    present = ps(comp_a, logs, "-Action", "Status")
    head = git(comp_a, "rev-parse", "HEAD").stdout.strip()
    assert present.returncode == 0, present.stdout + present.stderr
    assert f"Local commit: {head[:12]}" in present.stdout
    assert f"Handoff commit: {head[:12]}" in present.stdout
    assert head in json.dumps(read_metadata(comp_a))

    failing_git = fake_git_with_ls_remote(tmp_path, "exit /b 128")
    failed = ps(comp_a, logs, "-Action", "Status", "-GitExe", str(failing_git))
    assert failed.returncode != 0
    assert "metadata_remote_probe_failed" in failed.stdout
    assert "not initialized" not in failed.stdout


def test_remote_handoff_probe_rejects_malformed_wrong_ref_and_multiple_lines(tmp_path: Path) -> None:
    _, _, comp_a, _ = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    valid = "0123456789abcdef0123456789abcdef01234567"
    cases = [
        f"echo not-a-commit refs/heads/{META_BRANCH}",
        f"echo {valid} refs/heads/{META_BRANCH}-extra",
        f"echo {valid} refs/heads/{META_BRANCH}\r\necho fedcba9876543210fedcba9876543210fedcba98 refs/heads/{META_BRANCH}",
    ]

    for index, body in enumerate(cases):
        fake_git = fake_git_with_ls_remote(tmp_path / f"case-{index}", body)
        fake_git.parent.mkdir(exist_ok=True)
        result = ps(comp_a, logs / str(index), "-Action", "Status", "-GitExe", str(fake_git))
        assert result.returncode != 0
        assert "metadata_remote_probe_failed" in result.stdout
        assert "not initialized" not in result.stdout


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


def test_stale_remote_tracking_metadata_ref_is_never_authoritative(tmp_path: Path) -> None:
    origin, _, comp_a, comp_b = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    before_branch = git(comp_b, "branch", "--show-current").stdout.strip()
    before_head = git(comp_b, "rev-parse", "HEAD").stdout.strip()
    (comp_b / "keep.txt").write_text("untracked\n", encoding="utf-8")

    assert ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved").returncode == 0
    git(comp_b, "fetch", "origin", f"refs/heads/{META_BRANCH}:refs/remotes/origin/{META_BRANCH}")
    stale_json = git(comp_b, "show", f"origin/{META_BRANCH}:active-work.json").stdout
    git(origin, "update-ref", "-d", f"refs/heads/{META_BRANCH}")
    launcher = tmp_path / "fake-launcher.bat"
    marker = tmp_path / "launcher-called.txt"
    launcher.write_text(f"@echo off\r\necho called> \"{marker}\"\r\nexit /b 0\r\n", encoding="utf-8")

    status = ps(comp_b, logs, "-Action", "Status")
    sync = ps(comp_b, logs, "-Action", "SyncAndStart", "-FakeLauncher", str(launcher))

    assert status.returncode == 0, status.stdout + status.stderr
    assert "Handoff branch: (not initialized)" in status.stdout
    assert "Handoff commit:" not in status.stdout
    assert stale_json
    assert sync.returncode != 0
    assert "handoff_not_initialized" in sync.stdout
    assert not marker.exists()
    assert git(comp_b, "branch", "--show-current").stdout.strip() == before_branch
    assert git(comp_b, "rev-parse", "HEAD").stdout.strip() == before_head
    assert git(comp_b, "status", "--short").stdout == "?? keep.txt\n"
    assert (comp_b / "keep.txt").read_text(encoding="utf-8") == "untracked\n"


def test_remote_probe_failure_fails_status_ui_initial_and_refresh_without_launcher(tmp_path: Path) -> None:
    _, _, comp_a, comp_b = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    make_branch(comp_a, "BugFix/probe-failure", "probe failure")
    assert ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved").returncode == 0
    failing_git = fake_git_with_ls_remote(tmp_path / "failing-git", "exit /b 128")
    launcher = tmp_path / "fake-launcher.bat"
    marker = tmp_path / "launcher-called.txt"
    launcher.write_text(f"@echo off\r\necho called> \"{marker}\"\r\nexit /b 0\r\n", encoding="utf-8")
    before_branch = git(comp_b, "branch", "--show-current").stdout.strip()
    before_head = git(comp_b, "rev-parse", "HEAD").stdout.strip()

    status = ps(comp_b, logs, "-Action", "Status", "-GitExe", str(failing_git))
    initial = ps(comp_b, logs, "-Action", "Ui", "-SuppressUi", "-GitExe", str(failing_git))
    refresh = ps(comp_b, logs, "-TestInvokeUiChildAction", "Status", "-GitExe", str(failing_git))
    sync = ps(comp_b, logs, "-Action", "SyncAndStart", "-FakeLauncher", str(launcher), "-GitExe", str(failing_git))

    for result in [status, initial, refresh, sync]:
        assert result.returncode != 0
        assert "metadata_remote_probe_failed" in result.stdout
        assert "not initialized" not in result.stdout
    assert "UI_INITIAL_STATUS=failure" in initial.stdout
    assert "UI_CHILD_STATUS=failure" in refresh.stdout
    assert not marker.exists()
    assert git(comp_b, "branch", "--show-current").stdout.strip() == before_branch
    assert git(comp_b, "rev-parse", "HEAD").stdout.strip() == before_head


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


def test_ui_child_process_invocation_handles_paths_with_spaces(tmp_path: Path) -> None:
    spaced_root = tmp_path / "Repository With Spaces" / "Personal Web"
    spaced_root.mkdir(parents=True)
    _, _, comp_a, comp_b = seed_repo(spaced_root)
    logs = spaced_root / "Log Root With Spaces"
    script_b = comp_b / "scripts" / "work-handoff.ps1"
    unexpected = spaced_root / "unexpected-from-split.txt"
    child_observation = spaced_root / "child observation.txt"

    status = ps_with_script(
        script_b,
        comp_b,
        logs,
        "-Action",
        "Ui",
        "-SuppressUi",
        "-TestChildObservationPath",
        str(child_observation),
    )

    assert status.returncode == 0, status.stdout + status.stderr
    assert "UI_INITIAL_STATUS=success" in status.stdout
    assert child_observation.read_text(encoding="utf-8").splitlines() == [
        f"SCRIPT={script_b}",
        f"REPO={comp_b}",
    ]
    assert git(comp_b, "ls-remote", "--heads", "origin", META_BRANCH).stdout.strip() == ""

    target = make_branch(comp_a, "BugFix/path-spaces", "space path")
    handoff_setup = ps_with_script(
        comp_a / "scripts" / "work-handoff.ps1",
        comp_a,
        logs,
        "-Action",
        "EndAndHandoff",
        "-AssumeSaved",
    )
    assert handoff_setup.returncode == 0, handoff_setup.stdout + handoff_setup.stderr

    launcher_dir = spaced_root / "Fake Launcher With Spaces"
    launcher_dir.mkdir()
    launcher = launcher_dir / "start shared fake.bat"
    marker = spaced_root / "launcher marker.txt"
    launcher.write_text(
        "\r\n".join(
            [
                "@echo off",
                f'echo LAUNCHER=%~f0> "{marker}"',
                f'echo CWD=%CD%>> "{marker}"',
                f'echo ARG1=%~1>> "{marker}"',
                f'echo ARG2=%~2>> "{marker}"',
                "exit /b 0",
            ]
        )
        + "\r\n",
        encoding="utf-8",
    )
    temp_before = {path.name for path in Path(os.environ["TEMP"]).glob("personal-web-handoff-*.txt")}

    sync = ps_with_script(
        script_b,
        comp_b,
        logs,
        "-TestInvokeUiChildAction",
        "SyncAndStart",
        "-FakeLauncher",
        str(launcher),
        "-KeepSession",
        "-TestChildObservationPath",
        str(child_observation),
        timeout=90,
    )

    assert sync.returncode == 0, sync.stdout + sync.stderr
    assert "UI_CHILD_STATUS=success" in sync.stdout
    assert "UI_CHILD_KEEP_SESSION=True" in sync.stdout
    assert git(comp_b, "rev-parse", "HEAD").stdout.strip() == target
    assert marker.read_text(encoding="utf-8").splitlines() == [
        f"LAUNCHER={launcher}",
        f"CWD={comp_b}",
        "ARG1=keep-session",
        "ARG2=",
    ]

    end = ps_with_script(
        script_b,
        comp_b,
        logs,
        "-TestInvokeUiChildAction",
        "EndAndHandoff",
        timeout=90,
    )

    temp_after = {path.name for path in Path(os.environ["TEMP"]).glob("personal-web-handoff-*.txt")}
    assert end.returncode == 0, end.stdout + end.stderr
    assert "UI_CHILD_STATUS=success" in end.stdout
    assert temp_after == temp_before
    assert not unexpected.exists()


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


def test_fetch_readback_mismatch_blocks_before_metadata_read_or_launcher(tmp_path: Path) -> None:
    _, _, comp_a, comp_b = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    target = make_branch(comp_a, "Feature/mismatch", "mismatch")
    assert ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved").returncode == 0
    real_meta_commit = git(comp_a, "ls-remote", "--heads", "origin", META_BRANCH).stdout.split()[0]
    fake_commit = "f" * 40
    assert real_meta_commit != fake_commit
    fake_git = fake_git_with_ls_remote(tmp_path / "fake-mismatch", f"echo {fake_commit} refs/heads/{META_BRANCH}")
    launcher = tmp_path / "fake-launcher.bat"
    marker = tmp_path / "launcher-called.txt"
    launcher.write_text(f"@echo off\r\necho called> \"{marker}\"\r\nexit /b 0\r\n", encoding="utf-8")
    before_branch = git(comp_b, "branch", "--show-current").stdout.strip()
    before_head = git(comp_b, "rev-parse", "HEAD").stdout.strip()

    result = ps(comp_b, logs, "-Action", "SyncAndStart", "-FakeLauncher", str(launcher), "-GitExe", str(fake_git))

    assert result.returncode != 0
    assert "metadata_fetch_readback_mismatch" in result.stdout
    assert not marker.exists()
    assert git(comp_b, "branch", "--show-current").stdout.strip() == before_branch
    assert git(comp_b, "rev-parse", "HEAD").stdout.strip() == before_head
    assert target


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
        result = ps(comp_a, logs, "-Action", "SyncAndStart", "-TestMutexName", mutex)
        assert result.returncode != 0
        assert "handoff_operation_already_running" in result.stdout
    finally:
        holder.terminate()
        holder.wait(timeout=10)


def test_ui_does_not_hold_operation_mutex_and_child_helper_reports_exit(tmp_path: Path) -> None:
    _, _, comp_a, _ = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    operation_mutex = "Local\\PersonalWebHandoffOperationMutex"
    holder = subprocess.Popen(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            f"$m=New-Object System.Threading.Mutex($false,'{operation_mutex}'); $m.WaitOne() | Out-Null; Start-Sleep -Seconds 5; $m.ReleaseMutex(); $m.Dispose()",
        ],
        cwd=comp_a,
    )
    try:
        time.sleep(1)
        ui = ps(comp_a, logs, "-Action", "Ui", "-SuppressUi", "-TestMutexName", operation_mutex)
        assert ui.returncode == 0, ui.stdout + ui.stderr
        assert "UI suppressed" in ui.stdout
    finally:
        holder.terminate()
        holder.wait(timeout=10)

    success = ps(comp_a, logs, "-TestInvokeUiChildAction", "SyncAndStart", "-TestChildExitCode", "0", "-KeepSession")
    failure = ps(comp_a, logs, "-TestInvokeUiChildAction", "SyncAndStart", "-TestChildExitCode", "9")

    assert success.returncode == 0
    assert "UI_CHILD_STATUS=success" in success.stdout
    assert "UI_CHILD_KEEP_SESSION=True" in success.stdout
    assert "UI_BUTTONS_REENABLED=True" in success.stdout
    assert failure.returncode != 0
    assert "UI_CHILD_STATUS=failure" in failure.stdout
    assert "UI_BUTTONS_REENABLED=True" in failure.stdout
    assert "completed" not in failure.stdout.lower()


def test_ui_handoff_confirmation_cancel_invokes_no_child(tmp_path: Path) -> None:
    _, _, comp_a, _ = seed_repo(tmp_path)
    logs = tmp_path / "logs"

    result = ps(comp_a, logs, "-TestInvokeUiChildAction", "EndAndHandoff", "-TestChildExitCode", "0", "-TestUiCancelConfirmation")

    assert result.returncode == 0
    assert "UI_CHILD_CANCELLED" in result.stdout
    assert "UI_CHILD_INVOKED=False" in result.stdout
    assert "synthetic_child" not in result.stdout


def test_port_inspection_failure_blocks(tmp_path: Path) -> None:
    _, _, comp_a, _ = seed_repo(tmp_path)
    logs = tmp_path / "logs"

    result = ps(comp_a, logs, "-Action", "SyncAndStart", "-TestPortInspectionFailure")

    assert result.returncode != 0
    assert "port_inspection_failed:8000" in result.stdout


def test_status_is_read_only_and_metadata_branch_is_isolated(tmp_path: Path) -> None:
    _, _, comp_a, _ = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    before = snapshot_status_immutable_state(comp_a, logs)
    result = ps(comp_a, logs, "-Action", "Status")

    assert result.returncode == 0, result.stdout + result.stderr
    after = snapshot_status_immutable_state(comp_a, logs)
    assert after == before
    assert git(comp_a, "ls-remote", "--heads", "origin", META_BRANCH).stdout.strip() == ""


def test_status_ui_initial_and_refresh_helpers_are_filesystem_read_only(tmp_path: Path) -> None:
    _, _, comp_a, comp_b = seed_repo(tmp_path)
    logs = tmp_path / "logs"
    make_branch(comp_a, "BugFix/status", "status")
    assert ps(comp_a, logs, "-Action", "EndAndHandoff", "-AssumeSaved").returncode == 0
    before = snapshot_status_immutable_state(comp_b, logs)

    status = ps(comp_b, logs, "-Action", "Status")
    initial = ps(comp_b, logs, "-Action", "Ui", "-SuppressUi")
    refresh = ps(comp_b, logs, "-TestInvokeUiChildAction", "Status")

    after = snapshot_status_immutable_state(comp_b, logs)
    assert status.returncode == 0, status.stdout + status.stderr
    assert initial.returncode == 0, initial.stdout + initial.stderr
    assert refresh.returncode == 0, refresh.stdout + refresh.stderr
    assert "UI_INITIAL_STATUS=success" in initial.stdout
    assert "UI_CHILD_STATUS=success" in refresh.stdout
    assert after == before
    local_commit = git(comp_b, "rev-parse", "HEAD").stdout.strip()
    handoff_commit = read_metadata(comp_a)["commit"]
    assert f"Local commit: {local_commit[:12]}" in status.stdout
    assert f"Handoff commit: {handoff_commit[:12]}" in status.stdout
    assert str(handoff_commit) not in status.stdout
    assert len(str(handoff_commit)) == 40


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
    assert 'git {0}' not in text
    assert '($Arguments -join " ")' not in text


def test_ui_button_text_and_test_only_flags_are_explicit() -> None:
    text = SCRIPT.read_text(encoding="utf-8")
    doc = (REPO_ROOT / "docs" / "15_TWO_COMPUTER_WORK_HANDOFF.md").read_text(encoding="utf-8")
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")

    assert "同步并开始工作" in text
    assert "结束工作并交接" in text
    assert "工作已交接" in text
    assert "分支" in text
    assert "当前分支或 commit 尚未完整推送，交接已停止。" in text
    assert "保留当前登录状态" in text
    for mojibake in ["閸氬本", "缂佹挻", "瀹搞儰缍", "瑜版挸澧"]:
        assert mojibake not in text
    assert "fake_launcher_requires_test_mode" in text
    assert "test_mode_rejects_production_repository" in text
    assert "test_mode_rejects_production_log_root" in text
    assert 'Invoke-HandoffChildProcess -ChildAction "Status"' in text
    assert "$initial = Invoke-HandoffChildProcess -ChildAction \"Status\"" in text
    assert "& $setStatusFromResult $result" in text
    assert "Personal Web.lnk\n  -> work-handoff.bat\n  -> work-handoff UI" in readme
    assert "start-shared-dev.bat only after synchronization succeeds" in readme
    assert "not automatically the latest `main`" in readme
    assert "targets `work-handoff.bat`" in readme
    assert "targets\n`start-shared-dev.bat`" not in readme
    assert "同步并开始工作" in doc
    assert "结束工作并交接" in doc
    assert "保留当前登录状态" in doc
    assert "automatically when the UI opens" in doc
