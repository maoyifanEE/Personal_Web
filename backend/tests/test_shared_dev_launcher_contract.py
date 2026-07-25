"""Script contract tests for shared-development launchers."""

from __future__ import annotations

import subprocess
from pathlib import Path
import socket
import json
import os
import time

import pytest

from app.core.shared_dev_secrets import SharedDevSecretError, load_shared_dev_secret_contract


REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = REPO_ROOT / "config" / "shared-dev-secret-contract.json"
STATE_PATH = REPO_ROOT / ".runtime" / "shared-dev" / "shared-session-state.json"


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


def run_launcher(args: list[str], *, timeout: int = 60, capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(REPO_ROOT / "scripts" / "start-shared-dev.ps1"), *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=capture,
        stdout=None if capture else subprocess.DEVNULL,
        stderr=None if capture else subprocess.DEVNULL,
        timeout=timeout,
        check=False,
    )


def write_contract(tmp_path: Path, mutator) -> Path:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    mutator(contract)
    path = tmp_path / "contract.json"
    path.write_text(json.dumps(contract), encoding="utf-8")
    return path


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


@pytest.mark.parametrize(
    "case_name,mutator",
    [
        ("schema", lambda c: c.__setitem__("schemaVersion", 2)),
        ("missing_required", lambda c: c.pop("requiredKeys")),
        ("missing_optional", lambda c: c.pop("optionalKeys")),
        ("non_array_required", lambda c: c.__setitem__("requiredKeys", "x")),
        ("non_string_key", lambda c: c["requiredKeys"].append(123)),
        ("empty_key", lambda c: c["requiredKeys"].append(" ")),
        ("duplicate_required", lambda c: c["requiredKeys"].append(c["requiredKeys"][0])),
        ("duplicate_optional", lambda c: c["optionalKeys"].append(c["optionalKeys"][0])),
        ("overlap", lambda c: c["optionalKeys"].append(c["requiredKeys"][0])),
        ("alias_not_allowed", lambda c: c["deprecatedAliases"].__setitem__("NOT_ALLOWED", "SHARED_DEV_REMOTE_MEDIA_ROOT")),
        ("alias_target_not_allowed", lambda c: c["deprecatedAliases"].__setitem__("SHARED_DEV_MEDIA_REMOTE_ROOT", "NOT_ALLOWED")),
        ("self_alias", lambda c: c["deprecatedAliases"].__setitem__("SHARED_DEV_MEDIA_REMOTE_ROOT", "SHARED_DEV_MEDIA_REMOTE_ROOT")),
        ("alias_cycle", lambda c: c["deprecatedAliases"].update({"SHARED_DEV_MEDIA_REMOTE_ROOT": "SHARED_DEV_REMOTE_MEDIA_ROOT", "SHARED_DEV_REMOTE_MEDIA_ROOT": "SHARED_DEV_MEDIA_REMOTE_ROOT"})),
        ("missing_constant", lambda c: c.pop("expectedDatabaseName")),
        ("empty_constant", lambda c: c.__setitem__("expectedDatabaseName", "")),
        ("wrong_db", lambda c: c.__setitem__("expectedDatabaseName", "personal_web_prod")),
        ("wrong_user", lambda c: c.__setitem__("expectedDatabaseUser", "wrong")),
        ("wrong_db_alias", lambda c: c.__setitem__("expectedDatabaseSshAlias", "personal-web-prod")),
        ("wrong_db_user", lambda c: c.__setitem__("expectedDatabaseSshUser", "root")),
        ("wrong_media_alias", lambda c: c.__setitem__("expectedMediaSshAlias", "media")),
        ("wrong_media_user", lambda c: c.__setitem__("expectedMediaSshUser", "root")),
        ("wrong_root", lambda c: c.__setitem__("expectedRemoteMediaRoot", "/")),
    ],
)
def test_python_and_powershell_reject_invalid_contracts_with_same_safe_category(tmp_path, case_name, mutator):
    contract_path = write_contract(tmp_path, mutator)
    secret = synthetic_secret(tmp_path)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")

    with pytest.raises(SharedDevSecretError) as py_exc:
        load_shared_dev_secret_contract(contract_path)
    assert str(py_exc.value) == "contract_invalid"

    result = run_launcher(
        [
            "-ValidateOnly",
            "-TestMode",
            "-SecretPath",
            str(secret),
            "-FakeSshExe",
            str(fake_ssh),
            "-TestContractPath",
            str(contract_path),
        ],
        timeout=30,
    )

    combined = result.stdout + result.stderr
    assert result.returncode != 0, case_name
    assert "contract_invalid" in combined
    assert "synthetic password" not in combined


def test_start_and_stop_shared_dev_with_direct_synthetic_processes(tmp_path):
    tunnel_port = free_port()
    backend_port = free_port()
    frontend_port = free_port()
    secret = synthetic_secret(tmp_path, local_port=tunnel_port)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")
    state_path = STATE_PATH
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
            "-TestBackendPort",
            str(backend_port),
            "-TestFrontendPort",
            str(frontend_port),
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
        venv_python = str((REPO_ROOT / "backend" / ".venv" / "Scripts" / "python.exe").resolve())
        for record in (state["dbTunnel"], state["backend"], state["frontend"]):
            assert record["executable"] == venv_python
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
                "-TestBackendPort",
                str(backend_port),
                "-TestFrontendPort",
                str(frontend_port),
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

    for port in (tunnel_port, backend_port, frontend_port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            assert sock.connect_ex(("127.0.0.1", port)) != 0


@pytest.mark.parametrize(
    "scenario",
    [
        "database_preflight_fail",
        "sftp_preflight_fail",
        "backend_exit_before_listener",
        "backend_readiness_timeout",
        "frontend_exit_before_listener",
        "frontend_readiness_timeout",
        "frontend_no_store_failure",
        "state_serialization_failure",
    ],
)
def test_synthetic_startup_failures_clean_started_processes_and_state(tmp_path, scenario):
    tunnel_port = free_port()
    backend_port = free_port()
    frontend_port = free_port()
    secret = synthetic_secret(tmp_path, local_port=tunnel_port)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")
    STATE_PATH.unlink(missing_ok=True)

    result = run_launcher(
        [
            "-TestMode",
            "-SecretPath",
            str(secret),
            "-FakeSshExe",
            str(fake_ssh),
            "-TestSyntheticProcesses",
            "-TestSkipPreflights",
            "-TestSkipBrowser",
            "-TestBackendPort",
            str(backend_port),
            "-TestFrontendPort",
            str(frontend_port),
            "-TestScenario",
            scenario,
        ],
        timeout=90,
    )

    assert result.returncode != 0
    assert "synthetic password" not in result.stdout + result.stderr
    assert not STATE_PATH.exists()
    for port in (tunnel_port, backend_port, frontend_port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            assert sock.connect_ex(("127.0.0.1", port)) != 0


def test_stop_preserves_state_when_recorded_port_is_reused(tmp_path):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    port = free_port()
    listener = subprocess.Popen(
        [
            str(REPO_ROOT / "backend" / ".venv" / "Scripts" / "python.exe"),
            "-c",
            "import socket,time; s=socket.socket(); s.bind(('127.0.0.1', int(__import__('sys').argv[1]))); s.listen(); time.sleep(60)",
            str(port),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        state = {
            "schemaVersion": 1,
            "repositoryRoot": str(REPO_ROOT),
            "profile": "shared_remote",
            "backend": {"pid": 999999, "startTimeUtc": "2000-01-01T00:00:00Z", "executable": "C:/missing/python.exe", "port": port, "role": "backend", "localAddress": "127.0.0.1"},
            "frontend": {"pid": 999998, "startTimeUtc": "2000-01-01T00:00:00Z", "executable": "C:/missing/python.exe", "port": free_port(), "role": "frontend", "localAddress": "127.0.0.1"},
            "dbTunnel": {"pid": 999997, "startTimeUtc": "2000-01-01T00:00:00Z", "executable": "C:/missing/ssh.exe", "port": free_port(), "localPort": free_port(), "role": "database tunnel", "localAddress": "127.0.0.1"},
        }
        STATE_PATH.write_text(json.dumps(state), encoding="utf-8")
        result = subprocess.run(
            ["cmd.exe", "/c", str(REPO_ROOT / "stop-shared-dev.bat")],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        assert result.returncode == 0
        assert STATE_PATH.exists()
        assert listener.poll() is None
    finally:
        listener.terminate()
        try:
            listener.wait(timeout=5)
        except subprocess.TimeoutExpired:
            listener.kill()
        STATE_PATH.unlink(missing_ok=True)


def test_launcher_log_retention_deletes_only_old_recognized_files(tmp_path):
    log_dir = REPO_ROOT / ".local_logs" / "launcher"
    log_dir.mkdir(parents=True, exist_ok=True)
    old_start = log_dir / "start-shared-dev-old.log"
    old_stop = log_dir / "stop-shared-dev-old.log"
    recent_start = log_dir / "start-shared-dev-recent.log"
    unknown_old = log_dir / "unknown-old.log"
    for path in (old_start, old_stop, recent_start, unknown_old):
        path.write_text("synthetic", encoding="utf-8")
    old_time = time.time() - 9 * 24 * 60 * 60
    os.utime(old_start, (old_time, old_time))
    os.utime(old_stop, (old_time, old_time))
    os.utime(unknown_old, (old_time, old_time))

    secret = synthetic_secret(tmp_path)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")
    result = run_launcher(["-ValidateOnly", "-TestMode", "-SecretPath", str(secret), "-FakeSshExe", str(fake_ssh)], timeout=30)
    assert result.returncode == 0
    subprocess.run(["cmd.exe", "/c", str(REPO_ROOT / "stop-shared-dev.bat")], cwd=REPO_ROOT, text=True, capture_output=True, timeout=30, check=False)

    assert not old_start.exists()
    assert not old_stop.exists()
    assert recent_start.exists()
    assert unknown_old.exists()
