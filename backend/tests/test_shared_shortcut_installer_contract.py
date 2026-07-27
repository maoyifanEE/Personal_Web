"""Contract tests for the shared desktop shortcut installer."""

from __future__ import annotations

import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CREATE_SCRIPT = REPO_ROOT / "scripts" / "create-shared-launch-shortcut.ps1"
INSTALL_SCRIPT = REPO_ROOT / "scripts" / "install-shared-shortcut.ps1"
INSTALL_BAT = REPO_ROOT / "install-shared-shortcut.bat"
COMPAT_BAT = REPO_ROOT / "install-local-shortcut.bat"
LOCAL_LAUNCHER = REPO_ROOT / "start-local-dev.bat"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_shared_shortcut_targets_shared_launcher_with_empty_arguments() -> None:
    script = read(CREATE_SCRIPT)

    assert '$shortcutName = "Personal Web.lnk"' in script
    assert 'Join-Path $repoRoot "work-handoff.bat"' in script
    assert 'Join-Path $repoRoot "start-shared-dev.bat"' in script
    assert "$shortcut.TargetPath = $handoffBatPath" in script
    assert "$shortcut.WorkingDirectory = $repoRoot" in script
    assert '$shortcut.Arguments = ""' in script
    assert 'Synchronize Personal_Web work branch, then start shared development' in script


def test_shared_shortcut_paths_are_dynamic_and_not_user_specific() -> None:
    script = read(CREATE_SCRIPT)

    assert "$PSScriptRoot" in script
    assert '[Environment]::GetFolderPath("Desktop")' in script
    current_user = "maoyi"
    assert "C:\\Users\\" + current_user not in script
    assert "C:/Users/" + current_user not in script


def test_tracked_sources_do_not_hardcode_current_user_path() -> None:
    tracked_files = subprocess.run(
        ["git", "ls-files"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    ).stdout.splitlines()

    username = b"maoyi"
    forbidden = (b"C:\\Users\\" + username, b"C:/Users/" + username)
    offenders: list[str] = []
    for relative in tracked_files:
        data = (REPO_ROOT / relative).read_bytes()
        if any(value in data for value in forbidden):
            offenders.append(relative)

    assert offenders == []


def test_local_launcher_remains_manual_local_fallback() -> None:
    batch = read(LOCAL_LAUNCHER)

    assert "scripts\\start-local-dev.ps1" in batch
    assert "start-shared-dev.ps1" not in batch
    assert "start-shared-dev.bat" not in batch


def test_direct_shared_launcher_remains_available() -> None:
    assert (REPO_ROOT / "start-shared-dev.bat").is_file()
    handoff = read(REPO_ROOT / "work-handoff.bat")

    assert "scripts\\work-handoff.ps1" in handoff
    assert "exit /b %ERRORLEVEL%" in handoff


def test_old_local_shortcut_removal_requires_exact_target_and_working_directory() -> None:
    script = read(CREATE_SCRIPT)

    assert '$oldLocalShortcutName = "Personal Web Local.lnk"' in script
    assert "Test-ShortcutMatches -Shortcut $oldLocalShortcut -TargetPath $localBatPath -WorkingDirectory $repoRoot -Arguments \"\"" in script
    assert "Remove-Item -LiteralPath $oldLocalShortcutPath -Force" in script
    assert "Preserved nonmatching old local shortcut" in script


def test_unrelated_same_name_shortcut_is_not_overwritten() -> None:
    script = read(CREATE_SCRIPT)

    assert "Test-ShortcutBelongsToRepository" in script
    assert "Existing Personal Web shortcut belongs to repository" in script
    assert "Refusing to overwrite unrelated Personal Web.lnk" in script


def test_compatibility_installer_invokes_shared_installer() -> None:
    compat = read(COMPAT_BAT)

    assert "install-shared-shortcut.bat" in compat
    assert "shared-remote development" in compat
    assert "install-local-shortcut.ps1" not in compat
    assert "Personal Web Local" not in compat


def test_installer_entry_points_use_shared_shortcut_creator() -> None:
    install_script = read(INSTALL_SCRIPT)
    install_bat = read(INSTALL_BAT)

    assert "scripts\\create-shared-launch-shortcut.ps1" in install_script
    assert "scripts\\install-shared-shortcut.ps1" in install_bat


def test_shortcut_creation_does_not_launch_application() -> None:
    combined = "\n".join(
        [
            read(CREATE_SCRIPT),
            read(INSTALL_SCRIPT),
            read(INSTALL_BAT),
            read(COMPAT_BAT),
        ]
    ).lower()

    assert "start-process" not in combined
    assert "invoke-item" not in combined
    assert "shell.application" not in combined
    assert "wscript.shell" in combined
