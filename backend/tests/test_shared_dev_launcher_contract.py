"""Script contract tests for shared-development launchers."""

from __future__ import annotations

import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def synthetic_secret(tmp_path: Path, *, db_name: str = "personal_web_shared_dev") -> Path:
    db_ssh_config = tmp_path / "db_ssh_config"
    media_ssh_config = tmp_path / "media_ssh_config"
    db_ssh_config.write_text(
        """
Host shared-db
  HostName shared-db.example.test
  User dbtunnel
  Port 22
  IdentityFile C:/synthetic/key
  UserKnownHostsFile C:/synthetic/known_hosts
""".strip(),
        encoding="utf-8",
    )
    media_ssh_config.write_text(
        """
Host shared-media
  HostName shared-media.example.test
  User personal-web-dev
  Port 22
  IdentityFile C:/synthetic/media-key
  UserKnownHostsFile C:/synthetic/known_hosts
""".strip(),
        encoding="utf-8",
    )
    secret = tmp_path / "shared-dev-secrets.env"
    secret.write_text(
        "\n".join(
            [
                "SHARED_DEV_SSH_ALIAS=shared-db",
                f"SHARED_DEV_DB_SSH_CONFIG_PATH={db_ssh_config}",
                "SHARED_DEV_DB_LOCAL_HOST=127.0.0.1",
                "SHARED_DEV_DB_LOCAL_PORT=65432",
                "SHARED_DEV_DB_REMOTE_HOST=127.0.0.1",
                "SHARED_DEV_DB_REMOTE_PORT=5432",
                f"SHARED_DEV_DB_NAME={db_name}",
                "SHARED_DEV_DB_USER=personal_web_shared_dev_app",
                "SHARED_DEV_DB_PASSWORD=synthetic password that must not appear in errors",
                "SHARED_DEV_REMOTE_MEDIA_ROOT=/remote/root",
                "SHARED_DEV_MEDIA_SSH_ALIAS=shared-media",
                f"SHARED_DEV_MEDIA_SSH_CONFIG_PATH={media_ssh_config}",
                "SHARED_DEV_MEDIA_CACHE_MAX_MB=1",
                "SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS=1",
            ]
        ),
        encoding="utf-8",
    )
    return secret


def test_start_shared_dev_validate_only_uses_synthetic_secret(tmp_path):
    secret = synthetic_secret(tmp_path)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")

    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(REPO_ROOT / "scripts" / "start-shared-dev.ps1"),
            "-ValidateOnly",
            "-SecretPath",
            str(secret),
            "-FakeSshExe",
            str(fake_ssh),
        ],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "Validation/dry-run completed" in result.stdout
    assert not (REPO_ROOT / ".runtime" / "shared-dev" / "shared-session-state.json").exists()
    assert "synthetic password" not in result.stdout
    assert "alembic upgrade" not in result.stdout.lower()
    assert "seed_dev_auth_users" not in result.stdout


def test_start_shared_dev_rejects_production_like_database_without_secret_value(tmp_path):
    secret = synthetic_secret(tmp_path, db_name="personal_web_prod")
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")

    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(REPO_ROOT / "scripts" / "start-shared-dev.ps1"),
            "-ValidateOnly",
            "-SecretPath",
            str(secret),
            "-FakeSshExe",
            str(fake_ssh),
        ],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )

    assert result.returncode != 0
    assert "synthetic password" not in result.stdout
    assert "synthetic password" not in result.stderr


def test_launcher_and_stop_scripts_do_not_include_shared_migration_or_seed_commands():
    launcher = (REPO_ROOT / "scripts" / "start-shared-dev.ps1").read_text(encoding="utf-8").lower()
    stop_script = (REPO_ROOT / "scripts" / "stop-shared-dev.ps1").read_text(encoding="utf-8").lower()

    assert "alembic upgrade head" not in launcher
    assert "seed_dev_auth_users" not in launcher
    assert "stop-process -id ([int]$record.pid)" in stop_script
    assert "schemaversion" in stop_script


def test_start_shared_batch_help_does_not_launch_services():
    result = subprocess.run(
        ["cmd.exe", "/c", str(REPO_ROOT / "start-shared-dev.bat"), "--help"],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )

    assert result.returncode == 0
    assert "Usage:" in result.stdout


def test_start_shared_batch_unknown_argument_fails():
    result = subprocess.run(
        ["cmd.exe", "/c", str(REPO_ROOT / "start-shared-dev.bat"), "unknown"],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )

    assert result.returncode == 2
    assert "Unknown argument" in result.stdout


def test_start_shared_batch_keep_session_mapping_is_explicit():
    batch = (REPO_ROOT / "start-shared-dev.bat").read_text(encoding="utf-8")

    assert 'keep-session' in batch
    assert '-KeepSession' in batch


def test_start_shared_dry_run_leaves_no_persistent_state(tmp_path):
    secret = synthetic_secret(tmp_path)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")
    state_path = REPO_ROOT / ".runtime" / "shared-dev" / "shared-session-state.json"
    state_path.unlink(missing_ok=True)

    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(REPO_ROOT / "scripts" / "start-shared-dev.ps1"),
            "-DryRun",
            "-SecretPath",
            str(secret),
            "-FakeSshExe",
            str(fake_ssh),
        ],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert not state_path.exists()
