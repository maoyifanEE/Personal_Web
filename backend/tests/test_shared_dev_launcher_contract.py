"""Script contract tests for shared-development launchers."""

from __future__ import annotations

import subprocess
from pathlib import Path
import socket
import json

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]


def synthetic_secret(tmp_path: Path, *, db_name: str = "personal_web_shared_dev", local_port: int = 65432) -> Path:
    db_ssh_config = tmp_path / "db_ssh_config"
    media_ssh_config = tmp_path / "media_ssh_config"
    db_key = tmp_path / "db_key"
    media_key = tmp_path / "media_key"
    known_hosts = tmp_path / "known_hosts"
    db_key.write_text("synthetic", encoding="utf-8")
    media_key.write_text("synthetic", encoding="utf-8")
    known_hosts.write_text("synthetic", encoding="utf-8")
    db_ssh_config.write_text(
        f"""
Host personal-web-shared-db
  HostName shared-db.example.test
  User personal-web-db-tunnel
  Port 22
  IdentityFile {db_key}
  UserKnownHostsFile {known_hosts}
""".strip(),
        encoding="utf-8",
    )
    media_ssh_config.write_text(
        f"""
Host personal-web-shared-media
  HostName shared-media.example.test
  User personal-web-dev
  Port 22
  IdentityFile {media_key}
  UserKnownHostsFile {known_hosts}
""".strip(),
        encoding="utf-8",
    )
    secret = tmp_path / "shared-dev-secrets.env"
    secret.write_text(
        "\n".join(
            [
                "SHARED_DEV_SSH_ALIAS=personal-web-shared-db",
                f"SHARED_DEV_DB_SSH_CONFIG_PATH={db_ssh_config}",
                "SHARED_DEV_DB_LOCAL_HOST=127.0.0.1",
                f"SHARED_DEV_DB_LOCAL_PORT={local_port}",
                "SHARED_DEV_DB_REMOTE_HOST=127.0.0.1",
                "SHARED_DEV_DB_REMOTE_PORT=5432",
                f"SHARED_DEV_DB_NAME={db_name}",
                "SHARED_DEV_DB_USER=personal_web_shared_dev_app",
                "SHARED_DEV_DB_PASSWORD=synthetic password that must not appear in errors",
                "SHARED_DEV_REMOTE_MEDIA_ROOT=/srv/personal-web/shared-dev/homepage",
                "SHARED_DEV_MEDIA_SSH_ALIAS=personal-web-shared-media",
                f"SHARED_DEV_MEDIA_SSH_CONFIG_PATH={media_ssh_config}",
                "SHARED_DEV_MEDIA_CACHE_MAX_MB=1",
                "SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS=1",
            ]
        ),
        encoding="utf-8",
    )
    return secret


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


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
            "-TestMode",
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
            "-TestMode",
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
            "-TestMode",
        ],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert not state_path.exists()


def test_powershell_parser_canonicalizes_deprecated_media_root_before_required_check(tmp_path):
    secret = synthetic_secret(tmp_path)
    text = secret.read_text(encoding="utf-8")
    text = text.replace("SHARED_DEV_REMOTE_MEDIA_ROOT=", "SHARED_DEV_MEDIA_REMOTE_ROOT=")
    secret.write_text(text, encoding="utf-8")
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
            "-TestMode",
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

    assert result.returncode == 0, result.stderr + result.stdout


def test_start_and_stop_shared_dev_with_direct_synthetic_processes(tmp_path):
    for fixed_port in (8000, 4173):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            if sock.connect_ex(("127.0.0.1", fixed_port)) == 0:
                pytest.skip(f"project fixed port {fixed_port} is already occupied")
    tunnel_port = free_port()
    secret = synthetic_secret(tmp_path, local_port=tunnel_port)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")
    state_path = REPO_ROOT / ".runtime" / "shared-dev" / "shared-session-state.json"
    state_path.unlink(missing_ok=True)

    start = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(REPO_ROOT / "scripts" / "start-shared-dev.ps1"),
            "-TestMode",
            "-SecretPath",
            str(secret),
            "-FakeSshExe",
            str(fake_ssh),
            "-TestSyntheticProcesses",
            "-TestSkipPreflights",
            "-TestSkipBrowser",
        ],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=60,
        check=False,
    )

    try:
        assert start.returncode == 0
        assert state_path.exists()
        state_text = state_path.read_text(encoding="utf-8-sig")
        assert "DATABASE_URL" not in state_text
        assert "synthetic password" not in state_text
        state = json.loads(state_text)
        for record in (state["dbTunnel"], state["backend"], state["frontend"]):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                assert sock.connect_ex(("127.0.0.1", int(record.get("port") or record["localPort"]))) == 0
        assert "--reload" not in (REPO_ROOT / "scripts" / "start-shared-dev.ps1").read_text(encoding="utf-8")
        second_start = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(REPO_ROOT / "scripts" / "start-shared-dev.ps1"),
                "-ValidateOnly",
                "-TestMode",
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
        assert second_start.returncode != 0
        assert "already running" in (second_start.stderr + second_start.stdout)
        assert "synthetic password" not in second_start.stderr + second_start.stdout
    finally:
        stop = subprocess.run(
            ["cmd.exe", "/c", str(REPO_ROOT / "stop-shared-dev.bat")],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            timeout=60,
            check=False,
        )
        assert stop.returncode == 0, stop.stderr + stop.stdout
        assert not state_path.exists()

    for port in (tunnel_port, 8000, 4173):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            assert sock.connect_ex(("127.0.0.1", port)) != 0
