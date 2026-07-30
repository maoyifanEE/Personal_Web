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
REAL_LOG_ROOT = REPO_ROOT / ".local_logs" / "launcher"


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


def isolated_roots(tmp_path: Path) -> tuple[Path, Path]:
    runtime = tmp_path / "runtime"
    logs = tmp_path / "launcher-logs"
    runtime.mkdir()
    logs.mkdir()
    return runtime, logs


def isolated_args(runtime: Path, logs: Path) -> list[str]:
    return ["-TestRuntimeRoot", str(runtime), "-TestLauncherLogRoot", str(logs)]


def snapshot_real_runtime() -> tuple[bool, str | None, int | None, set[str]]:
    state_text = STATE_PATH.read_text(encoding="utf-8", errors="ignore") if STATE_PATH.exists() else None
    state_mtime = STATE_PATH.stat().st_mtime_ns if STATE_PATH.exists() else None
    logs = set()
    if REAL_LOG_ROOT.exists():
        logs = {p.name for p in REAL_LOG_ROOT.iterdir()}
    return STATE_PATH.exists(), state_text, state_mtime, logs


def assert_real_runtime_unchanged(snapshot: tuple[bool, str | None, int | None, set[str]]) -> None:
    existed, text, mtime, logs = snapshot
    assert STATE_PATH.exists() is existed
    if existed:
        assert STATE_PATH.read_text(encoding="utf-8", errors="ignore") == text
        assert STATE_PATH.stat().st_mtime_ns == mtime
    if REAL_LOG_ROOT.exists():
        assert {p.name for p in REAL_LOG_ROOT.iterdir()} == logs
    else:
        assert logs == set()


def snapshot_real_state() -> tuple[bool, str | None, int | None]:
    state_text = STATE_PATH.read_text(encoding="utf-8", errors="ignore") if STATE_PATH.exists() else None
    state_mtime = STATE_PATH.stat().st_mtime_ns if STATE_PATH.exists() else None
    return STATE_PATH.exists(), state_text, state_mtime


def assert_real_state_unchanged(snapshot: tuple[bool, str | None, int | None]) -> None:
    existed, text, mtime = snapshot
    assert STATE_PATH.exists() is existed
    if existed:
        assert STATE_PATH.read_text(encoding="utf-8", errors="ignore") == text
        assert STATE_PATH.stat().st_mtime_ns == mtime


def run_launcher(args: list[str], *, timeout: int = 60, capture: bool = True, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(REPO_ROOT / "scripts" / "start-shared-dev.ps1"), *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=capture,
        stdout=None if capture else subprocess.DEVNULL,
        stderr=None if capture else subprocess.DEVNULL,
        env=env,
        timeout=timeout,
        check=False,
    )


def run_stop(runtime: Path, logs: Path, *, timeout: int = 60) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(REPO_ROOT / "scripts" / "stop-shared-dev.ps1"),
            "-TestMode",
            "-TestRuntimeRoot",
            str(runtime),
            "-TestLauncherLogRoot",
            str(logs),
        ],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def port_is_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def write_fake_powershell(tmp_path: Path) -> tuple[Path, Path]:
    fake_dir = tmp_path / "fake-bin"
    fake_dir.mkdir()
    fake = fake_dir / "powershell.exe"
    marker = tmp_path / "fake-powershell-invoked.txt"
    marker_literal = str(marker).replace("\\", "\\\\")
    source = f'''
using System;
using System.IO;
public class FakePowerShell {{
  public static int Main(string[] args) {{
    File.WriteAllText("{marker_literal}", string.Join("\\n", args));
    string configuredExit = Environment.GetEnvironmentVariable("FAKE_POWERSHELL_EXIT");
    if (!String.IsNullOrEmpty(configuredExit)) {{
      return Int32.Parse(configuredExit);
    }}
    return 99;
  }}
}}
'''
    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            f"Add-Type -TypeDefinition @'\n{source}\n'@ -OutputAssembly '{fake}' -OutputType ConsoleApplication",
        ],
        cwd=tmp_path,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return fake_dir, marker


def run_local_batch_safe(
    args: list[str],
    tmp_path: Path,
    *,
    fake_exit: int = 99,
    input_text: str | None = None,
) -> tuple[subprocess.CompletedProcess[str], Path]:
    fake_dir, marker = write_fake_powershell(tmp_path)
    env = {
        **os.environ,
        "PATH": str(fake_dir) + os.pathsep + os.environ["PATH"],
        "FAKE_POWERSHELL_EXIT": str(fake_exit),
    }
    result = subprocess.run(
        ["cmd.exe", "/d", "/c", str(REPO_ROOT / "start-local-dev.bat"), *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        input=input_text,
        env=env,
        timeout=15,
        check=False,
    )
    return result, marker


def run_local_batch_quoted_arg_safe(
    payload: str,
    tmp_path: Path,
    *,
    sentinel: Path,
) -> tuple[subprocess.CompletedProcess[str], Path]:
    fake_dir, marker = write_fake_powershell(tmp_path)
    env = {
        **os.environ,
        "PATH": str(fake_dir) + os.pathsep + os.environ["PATH"],
        "FAKE_POWERSHELL_EXIT": "99",
    }
    command = f'cmd.exe /d /s /c call "{REPO_ROOT / "start-local-dev.bat"}" "{payload}"'
    result = subprocess.run(
        command,
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        env=env,
        timeout=15,
        check=False,
    )
    return result, marker


def write_contract(tmp_path: Path, mutator) -> Path:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    mutator(contract)
    path = tmp_path / "contract.json"
    path.write_text(json.dumps(contract), encoding="utf-8")
    return path


def synthetic_launch_args(
    secret: Path,
    fake_ssh: Path,
    runtime: Path,
    logs: Path,
    backend_port: int,
    frontend_port: int,
    extra: list[str] | None = None,
) -> list[str]:
    args = [
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
        *isolated_args(runtime, logs),
    ]
    if extra:
        args.extend(extra)
    return args


def synthetic_ssh_processes_for(path_fragment: str) -> list[int]:
    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-Command",
            (
                "Get-CimInstance Win32_Process -Filter \"name='ssh.exe'\" | "
                f"Where-Object {{ $_.CommandLine -like '*{path_fragment}*' }} | "
                "Select-Object -ExpandProperty ProcessId"
            ),
        ],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        timeout=10,
        check=False,
    )
    return [int(line.strip()) for line in result.stdout.splitlines() if line.strip().isdigit()]


def python_exe() -> str:
    return str((REPO_ROOT / "backend" / ".venv" / "Scripts" / "python.exe").resolve())


class ProcessRef:
    def __init__(self, pid: int):
        self.pid = pid


def process_record(proc: subprocess.Popen | ProcessRef, port: int, role: str, *, topology: str = "direct", child: ProcessRef | None = None) -> dict:
    parent = process_info(proc.pid)
    record = {
        "pid": proc.pid,
        "startTimeUtc": parent["startTimeUtc"],
        "executable": parent["executable"],
        "port": port,
        "role": role,
        "localAddress": "127.0.0.1",
        "listenerRequired": True,
        "listenerTopology": topology,
    }
    if child is not None:
        child_info = process_info(child.pid)
        record.update(
            {
                "listenerPid": child.pid,
                "listenerStartTimeUtc": child_info["startTimeUtc"],
                "listenerExecutable": child_info["executable"],
                "listenerParentPid": proc.pid,
            }
        )
    return record


def process_info(pid: int) -> dict:
    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-Command",
            f"$p=Get-Process -Id {pid}; [ordered]@{{startTimeUtc=$p.StartTime.ToUniversalTime().ToString(\"o\"); executable=$p.MainModule.FileName}} | ConvertTo-Json -Compress",
        ],
        text=True,
        capture_output=True,
        timeout=10,
        check=True,
    )
    return json.loads(result.stdout)


def wait_for_port(port: int, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.1)
    raise AssertionError(f"port {port} did not open")


def listener_pid(port: int) -> int:
    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-Command",
            f"(Get-NetTCPConnection -LocalPort {port} -State Listen | Where-Object {{$_.LocalAddress -eq '127.0.0.1'}} | Select-Object -First 1 -ExpandProperty OwningProcess)",
        ],
        text=True,
        capture_output=True,
        timeout=10,
        check=True,
    )
    return int(result.stdout.strip())


def any_listener_pid(port: int) -> int:
    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-Command",
            f"(Get-NetTCPConnection -LocalPort {port} -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess)",
        ],
        text=True,
        capture_output=True,
        timeout=10,
        check=True,
    )
    return int(result.stdout.strip())


def parent_pid(pid: int) -> int:
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-Command", f"(Get-CimInstance Win32_Process -Filter \"ProcessId={pid}\").ParentProcessId"],
        text=True,
        capture_output=True,
        timeout=10,
        check=True,
    )
    return int(result.stdout.strip())


def start_listener(port: int, host: str = "127.0.0.1") -> subprocess.Popen:
    return subprocess.Popen(
        [
            python_exe(),
            "-c",
            "import socket,time,sys; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind((sys.argv[1], int(sys.argv[2]))); s.listen(); time.sleep(120)",
            host,
            str(port),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def start_parent_child_listener(tmp_path: Path, port: int) -> tuple[subprocess.Popen, ProcessRef]:
    child = tmp_path / "child_listener.ps1"
    child.write_text(
        "$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'), [int]$args[0]); $listener.Start(); Start-Sleep -Seconds 120\n",
        encoding="utf-8",
    )
    child_pid_file = tmp_path / "child.pid"
    parent = tmp_path / "parent_listener.ps1"
    parent.write_text(
        "$p = Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$args[0],$args[1]) -WindowStyle Hidden -PassThru; Set-Content -LiteralPath $args[2] -Value $p.Id; Start-Sleep -Seconds 120\n",
        encoding="utf-8",
    )
    proc = subprocess.Popen(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(parent), str(child), str(port), str(child_pid_file)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + 10
    while time.time() < deadline and not child_pid_file.exists():
        time.sleep(0.1)
    assert child_pid_file.exists()
    child_proc = ProcessRef(int(child_pid_file.read_text()))
    wait_for_port(port)
    return proc, child_proc


def write_state(runtime: Path, *, backend: dict, frontend: dict | None = None, tunnel: dict | None = None, schema: int = 3) -> Path:
    state_path = runtime / "shared-session-state.json"
    gone = {
        "pid": 999999,
        "startTimeUtc": "2000-01-01T00:00:00.0000000Z",
        "executable": "C:/missing/python.exe",
        "port": free_port(),
        "role": "gone",
        "localAddress": "127.0.0.1",
        "listenerTopology": "direct",
    }
    state = {
        "schemaVersion": schema,
        "repositoryRoot": str(REPO_ROOT),
        "profile": "shared_remote",
        "backend": backend,
        "frontend": frontend or {**gone, "role": "frontend"},
        "dbTunnel": tunnel or {**gone, "role": "database tunnel", "localPort": gone["port"]},
    }
    state_path.write_text(json.dumps(state, sort_keys=True), encoding="utf-8")
    return state_path


def test_start_shared_dev_validate_only_uses_synthetic_secret(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    snapshot = snapshot_real_runtime()
    secret = synthetic_secret(tmp_path)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")

    result = run_launcher(
        [
            "-ValidateOnly",
            "-SecretPath",
            str(secret),
            "-FakeSshExe",
            str(fake_ssh),
            "-TestMode",
            *isolated_args(runtime, logs),
        ],
        timeout=30,
    )

    assert result.returncode == 0, result.stderr
    assert "Validation/dry-run completed" in result.stdout
    assert not (runtime / "shared-session-state.json").exists()
    assert "synthetic password" not in result.stdout
    assert "alembic upgrade" not in result.stdout.lower()
    assert "seed_dev_auth_users" not in result.stdout
    assert_real_runtime_unchanged(snapshot)


def test_validate_only_without_test_mode_accepts_explicit_temporary_secret_and_starts_no_processes(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    snapshot = snapshot_real_state()
    secret = synthetic_secret(tmp_path)
    state_path = REPO_ROOT / ".runtime" / "shared-dev" / "shared-session-state.json"
    before_env = {
        key: os.environ.get(key)
        for key in [
            "DATABASE_URL",
            "PERSONAL_WEB_DATA_PROFILE",
            "HOMEPAGE_MEDIA_STORAGE_BACKEND",
            "SHARED_DEV_MEDIA_SSH_ALIAS",
            "SHARED_DEV_MEDIA_SSH_CONFIG_PATH",
            "SHARED_DEV_MEDIA_REMOTE_ROOT",
            "SHARED_DEV_MEDIA_CACHE_MAX_MB",
            "SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS",
        ]
    }

    result = run_launcher(["-ValidateOnly", "-SecretPath", str(secret)], timeout=30)

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Validation/dry-run completed" in result.stdout
    assert "requires_test_mode" not in result.stdout + result.stderr
    assert "synthetic password" not in result.stdout + result.stderr
    assert not (runtime / "shared-session-state.json").exists()
    assert not state_path.exists()
    assert synthetic_ssh_processes_for(str(tmp_path)) == []
    assert before_env == {key: os.environ.get(key) for key in before_env}
    assert_real_state_unchanged(snapshot)


def test_validate_only_default_secret_resolution_is_real_mode_without_test_mode(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    snapshot = snapshot_real_state()
    fake_profile = tmp_path / "profile"
    protected_dir = fake_profile / ".personal_web"
    protected_dir.mkdir(parents=True)
    secret = synthetic_secret(tmp_path)
    default_secret = protected_dir / "shared-dev-secrets.env"
    default_secret.write_text(secret.read_text(encoding="utf-8"), encoding="utf-8")
    env = os.environ.copy()
    env["USERPROFILE"] = str(fake_profile)

    result = run_launcher(["-ValidateOnly"], timeout=30, env=env)

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Validation/dry-run completed" in result.stdout
    assert "requires_test_mode" not in result.stdout + result.stderr
    assert "synthetic password" not in result.stdout + result.stderr
    assert not (runtime / "shared-session-state.json").exists()
    assert synthetic_ssh_processes_for(str(tmp_path)) == []
    assert_real_state_unchanged(snapshot)


def test_validate_only_failure_is_sanitized_and_writes_no_state(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    snapshot = snapshot_real_state()
    secret = synthetic_secret(tmp_path, db_name="personal_web_prod")

    result = run_launcher(["-ValidateOnly", "-SecretPath", str(secret)], timeout=30)

    assert result.returncode != 0
    combined = result.stdout + result.stderr
    assert "database name is not allowlisted" in combined
    assert "synthetic password" not in combined
    assert str(secret) not in combined
    assert not (runtime / "shared-session-state.json").exists()
    assert_real_state_unchanged(snapshot)


@pytest.mark.parametrize(
    "extra,expected",
    [
        (["-TestRuntimeRoot"], "test_runtime_root_requires_test_mode"),
        (["-TestLauncherLogRoot"], "test_launcher_log_root_requires_test_mode"),
        (["-FakeSshExe"], "fake_ssh_requires_test_mode"),
        (["-TestScenario", "post_state_failure"], "test_scenario_requires_test_mode"),
        (["-TestSyntheticProcesses"], "test_synthetic_processes_requires_test_mode"),
        (["-TestSkipPreflights"], "test_skip_preflights_requires_test_mode"),
        (["-TestSkipBrowser"], "test_skip_browser_requires_test_mode"),
        (["-TestCleanupOutcome", "identity_mismatch"], "test_cleanup_outcome_requires_test_mode"),
        (["-TestProbeDir"], "test_probe_dir_requires_test_mode"),
    ],
)
def test_test_only_parameters_are_rejected_without_explicit_test_mode(tmp_path, extra, expected):
    secret = synthetic_secret(tmp_path)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")
    value_map = {
        "-TestRuntimeRoot": str(tmp_path / "runtime"),
        "-TestLauncherLogRoot": str(tmp_path / "logs"),
        "-FakeSshExe": str(fake_ssh),
        "-TestProbeDir": str(tmp_path / "probe"),
    }
    args = ["-ValidateOnly", "-SecretPath", str(secret)]
    for item in extra:
        args.append(item)
        if item in value_map:
            args.append(value_map[item])

    result = run_launcher(args, timeout=30)

    assert result.returncode != 0
    combined = result.stdout + result.stderr
    assert expected in combined
    assert "synthetic password" not in combined


def test_test_mode_requires_explicit_secret_and_isolated_roots(tmp_path):
    result = run_launcher(["-ValidateOnly", "-TestMode"], timeout=30)

    assert result.returncode != 0
    combined = result.stdout + result.stderr
    assert "test_mode_requires_explicit_secret_path" in combined
    assert "synthetic password" not in combined


def test_test_mode_with_default_secret_path_is_rejected_before_secret_read(tmp_path):
    fake_profile = tmp_path / "profile"
    protected_dir = fake_profile / ".personal_web"
    protected_dir.mkdir(parents=True)
    default_secret = protected_dir / "shared-dev-secrets.env"
    default_secret.write_text(synthetic_secret(tmp_path).read_text(encoding="utf-8"), encoding="utf-8")
    env = os.environ.copy()
    env["USERPROFILE"] = str(fake_profile)
    runtime, logs = isolated_roots(tmp_path)

    result = run_launcher(["-ValidateOnly", "-TestMode", *isolated_args(runtime, logs)], timeout=30, env=env)

    assert result.returncode != 0
    combined = result.stdout + result.stderr
    assert "test_mode_requires_explicit_secret_path" in combined
    assert "synthetic password" not in combined


def test_test_mode_refuses_explicit_default_secret_path(tmp_path):
    fake_profile = tmp_path / "profile"
    protected_dir = fake_profile / ".personal_web"
    protected_dir.mkdir(parents=True)
    default_secret = protected_dir / "shared-dev-secrets.env"
    default_secret.write_text(synthetic_secret(tmp_path).read_text(encoding="utf-8"), encoding="utf-8")
    env = os.environ.copy()
    env["USERPROFILE"] = str(fake_profile)
    runtime, logs = isolated_roots(tmp_path)

    result = run_launcher(["-ValidateOnly", "-TestMode", "-SecretPath", str(default_secret), *isolated_args(runtime, logs)], timeout=30, env=env)

    assert result.returncode != 0
    combined = result.stdout + result.stderr
    assert "Test-only shared launcher mode cannot use the default protected secret path" in combined
    assert "synthetic password" not in combined


def test_start_shared_dev_rejects_production_like_database_without_secret_value(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    secret = synthetic_secret(tmp_path, db_name="personal_web_prod")
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")

    result = run_launcher(
        [
            "-ValidateOnly",
            "-SecretPath",
            str(secret),
            "-FakeSshExe",
            str(fake_ssh),
            "-TestMode",
            *isolated_args(runtime, logs),
        ],
        timeout=30,
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


@pytest.mark.parametrize("args", [["--help"], ["/?"]])
def test_start_local_batch_help_does_not_invoke_powershell_or_runtime(tmp_path: Path, args: list[str]) -> None:
    snapshot = snapshot_real_runtime()
    before_ports = {8000: port_is_open(8000), 4173: port_is_open(4173)}

    result, marker = run_local_batch_safe(args, tmp_path)

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Personal_Web local development launcher" in result.stdout
    assert not marker.exists()
    assert {8000: port_is_open(8000), 4173: port_is_open(4173)} == before_ports
    assert_real_runtime_unchanged(snapshot)


@pytest.mark.parametrize("args", [["--invalid-codex-smoke"], ["keep-session", "--extra"]])
def test_start_local_batch_invalid_args_fail_closed_before_powershell(tmp_path: Path, args: list[str]) -> None:
    snapshot = snapshot_real_runtime()
    before_ports = {8000: port_is_open(8000), 4173: port_is_open(4173)}

    result, marker = run_local_batch_safe(args, tmp_path)

    assert result.returncode != 0
    assert "Usage: start-local-dev.bat" in result.stdout
    assert "--invalid-codex-smoke" not in result.stdout
    assert "--extra" not in result.stdout
    assert not marker.exists()
    assert {8000: port_is_open(8000), 4173: port_is_open(4173)} == before_ports
    assert_real_runtime_unchanged(snapshot)


@pytest.mark.parametrize(
    "payload_template",
    [
        "invalid&echo compromised",
        "invalid|echo compromised",
        "invalid>{sentinel}",
        "invalid<{sentinel}",
        "invalid^(echo compromised^)",
        "invalid^&echo compromised",
        "invalid!value",
        "invalid%PATH%",
    ],
)
def test_start_local_batch_quoted_metacharacter_args_fail_closed(tmp_path: Path, payload_template: str) -> None:
    snapshot = snapshot_real_runtime()
    before_ports = {8000: port_is_open(8000), 4173: port_is_open(4173)}
    sentinel = tmp_path / "sentinel.txt"
    payload = payload_template.format(sentinel=sentinel)

    result, marker = run_local_batch_quoted_arg_safe(payload, tmp_path, sentinel=sentinel)

    assert result.returncode == 2, result.stdout + result.stderr
    assert "Unknown or unsupported launcher arguments." in result.stdout
    assert "compromised" not in result.stdout
    assert "compromised" not in result.stderr
    assert not sentinel.exists()
    assert not marker.exists()
    assert {8000: port_is_open(8000), 4173: port_is_open(4173)} == before_ports
    assert_real_runtime_unchanged(snapshot)


def test_start_local_batch_default_invokes_only_expected_fake_powershell_and_preserves_exit(tmp_path: Path) -> None:
    snapshot = snapshot_real_runtime()
    before_ports = {8000: port_is_open(8000), 4173: port_is_open(4173)}

    result, marker = run_local_batch_safe([], tmp_path, fake_exit=37, input_text="\n")

    assert result.returncode == 37, result.stdout + result.stderr
    assert marker.read_text(encoding="utf-8").splitlines() == [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(REPO_ROOT / "scripts" / "start-local-dev.ps1"),
    ]
    assert "-KeepSession" not in marker.read_text(encoding="utf-8")
    assert {8000: port_is_open(8000), 4173: port_is_open(4173)} == before_ports
    assert_real_runtime_unchanged(snapshot)


def test_start_local_batch_keep_session_invokes_only_expected_fake_powershell_and_preserves_exit(tmp_path: Path) -> None:
    snapshot = snapshot_real_runtime()
    before_ports = {8000: port_is_open(8000), 4173: port_is_open(4173)}

    result, marker = run_local_batch_safe(["keep-session"], tmp_path, fake_exit=38, input_text="\n")

    assert result.returncode == 38, result.stdout + result.stderr
    assert marker.read_text(encoding="utf-8").splitlines() == [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(REPO_ROOT / "scripts" / "start-local-dev.ps1"),
        "-KeepSession",
    ]
    assert {8000: port_is_open(8000), 4173: port_is_open(4173)} == before_ports
    assert_real_runtime_unchanged(snapshot)


def test_start_local_batch_operational_arguments_are_explicit() -> None:
    batch = (REPO_ROOT / "start-local-dev.bat").read_text(encoding="utf-8")

    assert 'set "ARG1=%~1"' in batch
    assert 'set "ARG2=%~2"' in batch
    assert 'if "%ARG1%"=="" goto run_default' in batch
    assert 'if /I "%ARG1%"=="keep-session" if "%ARG2%"=="" goto run_keep' in batch
    assert 'if /I "%ARG1%"=="--help" if "%ARG2%"=="" goto show_help' in batch
    assert 'if /I "%ARG1%"=="/?" if "%ARG2%"=="" goto show_help' in batch
    assert "%*" not in batch
    assert "scripts\\start-local-dev.ps1\" -KeepSession" in batch
    assert 'set "LAUNCHER_EXIT=%ERRORLEVEL%"' in batch
    assert "exit /b %LAUNCHER_EXIT%" in batch
    echo_lines = [line for line in batch.splitlines() if line.lower().lstrip().startswith("echo")]
    assert all(token not in line for line in echo_lines for token in ["%~1", "%1", "%ARG1%", "%ARG2%"])


def test_start_shared_dry_run_leaves_no_persistent_state(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    secret = synthetic_secret(tmp_path)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")

    result = run_launcher(
        [
            "-DryRun",
            "-SecretPath",
            str(secret),
            "-FakeSshExe",
            str(fake_ssh),
            "-TestMode",
            *isolated_args(runtime, logs),
        ],
        timeout=30,
    )

    assert result.returncode == 0, result.stderr
    assert not (runtime / "shared-session-state.json").exists()


def test_powershell_parser_canonicalizes_deprecated_media_root_before_required_check(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    secret = synthetic_secret(tmp_path)
    text = secret.read_text(encoding="utf-8")
    text = text.replace("SHARED_DEV_REMOTE_MEDIA_ROOT=", "SHARED_DEV_MEDIA_REMOTE_ROOT=")
    secret.write_text(text, encoding="utf-8")
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")

    result = run_launcher(
        [
            "-ValidateOnly",
            "-TestMode",
            "-SecretPath",
            str(secret),
            "-FakeSshExe",
            str(fake_ssh),
            *isolated_args(runtime, logs),
        ],
        timeout=30,
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
    runtime, logs = isolated_roots(tmp_path)
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
            *isolated_args(runtime, logs),
        ],
        timeout=30,
    )

    combined = result.stdout + result.stderr
    assert result.returncode != 0, case_name
    assert "contract_invalid" in combined
    assert "synthetic password" not in combined


def test_start_and_stop_shared_dev_with_direct_synthetic_processes(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    snapshot = snapshot_real_runtime()
    tunnel_port = free_port()
    backend_port = free_port()
    frontend_port = free_port()
    secret = synthetic_secret(tmp_path, local_port=tunnel_port)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")
    state_path = runtime / "shared-session-state.json"

    start = run_launcher(
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
            *isolated_args(runtime, logs),
        ],
        timeout=60,
        capture=False,
    )

    try:
        assert start.returncode == 0
        assert state_path.exists()
        state_text = state_path.read_text(encoding="utf-8-sig")
        assert "DATABASE_URL" not in state_text
        assert "synthetic password" not in state_text
        state = json.loads(state_text)
        assert state["schemaVersion"] == 3
        venv_python = str((REPO_ROOT / "backend" / ".venv" / "Scripts" / "python.exe").resolve())
        for record in (state["dbTunnel"], state["backend"], state["frontend"]):
            assert record["executable"] == venv_python
            assert record["listenerTopology"] in {"direct", "direct_child"}
            if record["listenerTopology"] == "direct_child":
                assert record["listenerStartTimeUtc"]
                assert record["listenerExecutable"]
                assert int(record["listenerParentPid"]) == int(record["pid"])
            else:
                assert "listenerPid" not in record
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                assert sock.connect_ex(("127.0.0.1", int(record.get("port") or record["localPort"]))) == 0
        assert "--reload" not in (REPO_ROOT / "scripts" / "start-shared-dev.ps1").read_text(encoding="utf-8")
    finally:
        stop = run_stop(runtime, logs)
        assert stop.returncode == 0, stop.stderr + stop.stdout
        assert not state_path.exists()

    for port in (tunnel_port, backend_port, frontend_port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            assert sock.connect_ex(("127.0.0.1", port)) != 0
    assert_real_runtime_unchanged(snapshot)


@pytest.mark.parametrize(
    "scenario",
    [
        "database_preflight_fail",
        "sftp_preflight_fail",
        "tunnel_exit_before_listener",
        "backend_exit_before_listener",
        "backend_readiness_timeout",
        "frontend_exit_before_listener",
        "frontend_readiness_timeout",
        "frontend_no_store_failure",
        "state_serialization_failure",
    ],
)
def test_synthetic_startup_failures_clean_started_processes_and_state(tmp_path, scenario):
    runtime, logs = isolated_roots(tmp_path)
    snapshot = snapshot_real_runtime()
    tunnel_port = free_port()
    backend_port = free_port()
    frontend_port = free_port()
    secret = synthetic_secret(tmp_path, local_port=tunnel_port)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")

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
            *isolated_args(runtime, logs),
        ],
        timeout=90,
    )

    assert result.returncode != 0
    assert "synthetic password" not in result.stdout + result.stderr
    assert not (runtime / "shared-session-state.json").exists()
    for port in (tunnel_port, backend_port, frontend_port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            assert sock.connect_ex(("127.0.0.1", port)) != 0
    assert_real_runtime_unchanged(snapshot)


def test_backend_receives_shared_environment_and_frontend_does_not(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    probe_dir = tmp_path / "probes"
    snapshot = snapshot_real_runtime()
    tunnel_port = free_port()
    backend_port = free_port()
    frontend_port = free_port()
    secret = synthetic_secret(tmp_path, local_port=tunnel_port)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")
    state_path = runtime / "shared-session-state.json"

    result = run_launcher(
        synthetic_launch_args(
            secret,
            fake_ssh,
            runtime,
            logs,
            backend_port,
            frontend_port,
            ["-TestProbeDir", str(probe_dir)],
        ),
        timeout=90,
        capture=False,
    )
    try:
        assert result.returncode == 0
        backend_probe = json.loads((probe_dir / "backend-env.json").read_text(encoding="utf-8"))
        frontend_probe = json.loads((probe_dir / "frontend-env.json").read_text(encoding="utf-8"))
        expected = [
            "DATABASE_URL",
            "PERSONAL_WEB_DATA_PROFILE",
            "HOMEPAGE_MEDIA_STORAGE_BACKEND",
            "SHARED_DEV_MEDIA_SSH_ALIAS",
            "SHARED_DEV_MEDIA_SSH_CONFIG_PATH",
            "SHARED_DEV_MEDIA_REMOTE_ROOT",
            "SHARED_DEV_MEDIA_CACHE_MAX_MB",
            "SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS",
        ]
        assert all(backend_probe[name] for name in expected)
        assert backend_probe["DATABASE_URL_PRESENT"] is True
        assert backend_probe["DATABASE_PASSWORD_PRESENT"] is True
        assert all(frontend_probe[name] is False for name in expected)
        assert frontend_probe["DATABASE_URL_PRESENT"] is False
        assert frontend_probe["DATABASE_PASSWORD_PRESENT"] is False
        for artifact in [probe_dir / "backend-env.json", probe_dir / "frontend-env.json", state_path, *logs.glob("*.log")]:
            if artifact.exists():
                text = artifact.read_text(encoding="utf-8-sig", errors="ignore")
                assert "synthetic password" not in text
                assert "DATABASE_URL=postgresql" not in text
    finally:
        stop = run_stop(runtime, logs)
        assert stop.returncode == 0, stop.stdout + stop.stderr
    assert_real_runtime_unchanged(snapshot)


def test_post_state_failure_complete_cleanup_removes_state_and_ports(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    snapshot = snapshot_real_runtime()
    tunnel_port = free_port()
    backend_port = free_port()
    frontend_port = free_port()
    secret = synthetic_secret(tmp_path, local_port=tunnel_port)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")
    result = run_launcher(
        synthetic_launch_args(secret, fake_ssh, runtime, logs, backend_port, frontend_port, ["-TestScenario", "post_state_failure"]),
        timeout=90,
    )
    assert result.returncode != 0
    assert not (runtime / "shared-session-state.json").exists()
    for port in (tunnel_port, backend_port, frontend_port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            assert sock.connect_ex(("127.0.0.1", port)) != 0
    assert "synthetic password" not in result.stdout + result.stderr
    assert_real_runtime_unchanged(snapshot)


@pytest.mark.parametrize("cleanup_outcome", ["identity_mismatch", "stop_timeout", "port_reuse"])
def test_post_state_failure_incomplete_cleanup_preserves_sanitized_recovery_state(tmp_path, cleanup_outcome):
    runtime, logs = isolated_roots(tmp_path)
    snapshot = snapshot_real_runtime()
    unrelated_port = free_port()
    unrelated = start_listener(unrelated_port)
    tunnel_port = free_port()
    backend_port = free_port()
    frontend_port = free_port()
    secret = synthetic_secret(tmp_path, local_port=tunnel_port)
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")
    try:
        result = run_launcher(
            synthetic_launch_args(
                secret,
                fake_ssh,
                runtime,
                logs,
                backend_port,
                frontend_port,
                ["-TestScenario", "post_state_failure", "-TestCleanupOutcome", cleanup_outcome],
            ),
            timeout=90,
        )
        assert result.returncode != 0
        state_path = runtime / "shared-session-state.json"
        assert state_path.exists()
        text = state_path.read_text(encoding="utf-8-sig")
        assert "synthetic password" not in text
        assert "postgresql+psycopg" not in text
        state = json.loads(text)
        assert state["schemaVersion"] == 3
        assert state["startupStatus"] == "cleanup_incomplete"
        assert state["manualReviewRequired"] is True
        for record in (state["dbTunnel"], state["backend"], state["frontend"]):
            assert record["listenerTopology"] in {"direct", "direct_child"}
            assert record["pid"]
            assert record["startTimeUtc"]
            assert record["executable"]
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            assert sock.connect_ex(("127.0.0.1", unrelated_port)) == 0
    finally:
        run_stop(runtime, logs, timeout=60)
        unrelated.kill()
        assert_real_runtime_unchanged(snapshot)


def test_simultaneous_synthetic_launcher_is_refused_by_mutex_before_state_or_processes(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    snapshot = snapshot_real_runtime()
    secret = synthetic_secret(tmp_path, local_port=free_port())
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")
    backend_port = free_port()
    frontend_port = free_port()
    first_args = synthetic_launch_args(
        secret,
        fake_ssh,
        runtime,
        logs,
        backend_port,
        frontend_port,
        ["-TestPauseAfterMutexSeconds", "20"],
    )
    first = subprocess.Popen(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(REPO_ROOT / "scripts" / "start-shared-dev.ps1"), *first_args],
        cwd=REPO_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    try:
        time.sleep(2)
        second = run_launcher(synthetic_launch_args(secret, fake_ssh, runtime, logs, free_port(), free_port()), timeout=15)
        assert second.returncode != 0
        assert "launcher_mutex_busy" in (second.stdout + second.stderr)
        assert not (runtime / "shared-session-state.json").exists()
    finally:
        first.terminate()
        try:
            first.wait(timeout=10)
        except subprocess.TimeoutExpired:
            first.kill()
    assert_real_runtime_unchanged(snapshot)


def test_abandoned_mutex_recovery_allows_next_synthetic_launch(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    snapshot = snapshot_real_runtime()
    secret = synthetic_secret(tmp_path, local_port=free_port())
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")
    backend_port = free_port()
    frontend_port = free_port()
    abandoned = subprocess.Popen(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(REPO_ROOT / "scripts" / "start-shared-dev.ps1"),
            *synthetic_launch_args(secret, fake_ssh, runtime, logs, backend_port, frontend_port, ["-TestPauseAfterMutexSeconds", "20"]),
        ],
        cwd=REPO_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    time.sleep(2)
    abandoned.kill()
    abandoned.wait(timeout=10)

    result = run_launcher(
        synthetic_launch_args(secret, fake_ssh, runtime, logs, backend_port, frontend_port),
        timeout=90,
        capture=False,
    )
    try:
        assert result.returncode == 0
        assert (runtime / "shared-session-state.json").exists()
    finally:
        stop = run_stop(runtime, logs)
        assert stop.returncode == 0, stop.stdout + stop.stderr
    assert_real_runtime_unchanged(snapshot)


def test_verified_running_shared_session_reopens_without_duplicate_processes(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    snapshot = snapshot_real_runtime()
    secret = synthetic_secret(tmp_path, local_port=free_port())
    fake_ssh = tmp_path / "ssh.exe"
    fake_ssh.write_text("synthetic", encoding="utf-8")
    backend_port = free_port()
    frontend_port = free_port()
    args = synthetic_launch_args(secret, fake_ssh, runtime, logs, backend_port, frontend_port)

    first = run_launcher(args, timeout=90, capture=False)
    try:
        assert first.returncode == 0
        state_path = runtime / "shared-session-state.json"
        assert state_path.exists()
        before = state_path.read_text(encoding="utf-8")

        second = run_launcher(args, timeout=90)

        assert second.returncode == 0, second.stdout + second.stderr
        assert "already running" in second.stdout
        assert state_path.read_text(encoding="utf-8") == before
    finally:
        stop = run_stop(runtime, logs)
        assert stop.returncode == 0, stop.stdout + stop.stderr
    assert_real_runtime_unchanged(snapshot)


def test_stop_preserves_state_when_recorded_port_is_reused(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    snapshot = snapshot_real_runtime()
    state_path = runtime / "shared-session-state.json"
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
            "schemaVersion": 3,
            "repositoryRoot": str(REPO_ROOT),
            "profile": "shared_remote",
            "backend": {"pid": 999999, "startTimeUtc": "2000-01-01T00:00:00Z", "executable": "C:/missing/python.exe", "port": port, "role": "backend", "localAddress": "127.0.0.1", "listenerTopology": "direct"},
            "frontend": {"pid": 999998, "startTimeUtc": "2000-01-01T00:00:00Z", "executable": "C:/missing/python.exe", "port": free_port(), "role": "frontend", "localAddress": "127.0.0.1", "listenerTopology": "direct"},
            "dbTunnel": {"pid": 999997, "startTimeUtc": "2000-01-01T00:00:00Z", "executable": "C:/missing/ssh.exe", "port": free_port(), "localPort": free_port(), "role": "database tunnel", "localAddress": "127.0.0.1", "listenerTopology": "direct"},
        }
        state_path.write_text(json.dumps(state), encoding="utf-8")
        result = run_stop(runtime, logs, timeout=30)
        assert result.returncode == 3
        assert state_path.exists()
        assert listener.poll() is None
    finally:
        listener.terminate()
        try:
            listener.wait(timeout=5)
        except subprocess.TimeoutExpired:
            listener.kill()
        state_path.unlink(missing_ok=True)
        assert_real_runtime_unchanged(snapshot)


def test_persisted_direct_listener_topology_passes_and_removes_state(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    proc = start_listener(free_port())
    try:
        port = free_port()
    finally:
        proc.terminate()
        proc.wait(timeout=5)
    proc = start_listener(port)
    try:
        wait_for_port(port)
        record = process_record(ProcessRef(any_listener_pid(port)), port, "backend", topology="direct")
        state_path = write_state(runtime, backend=record)
        result = run_stop(runtime, logs)
        assert result.returncode == 0, result.stdout + result.stderr
        assert not state_path.exists()
    finally:
        if proc.poll() is None:
            proc.kill()


def test_persisted_direct_child_listener_topology_passes_and_removes_state(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    port = free_port()
    parent, child = start_parent_child_listener(tmp_path, port)
    try:
        record = process_record(ProcessRef(parent_pid(child.pid)), port, "backend", topology="direct_child", child=child)
        state_path = write_state(runtime, backend=record)
        result = run_stop(runtime, logs)
        assert result.returncode == 0, result.stdout + result.stderr
        assert not state_path.exists()
    finally:
        if parent.poll() is None:
            parent.kill()
        subprocess.run(["powershell.exe", "-NoProfile", "-Command", f"Stop-Process -Id {child.pid} -Force -ErrorAction SilentlyContinue"], timeout=10)


@pytest.mark.parametrize(
    "mutator",
    [
        lambda r: r.pop("listenerTopology"),
        lambda r: r.__setitem__("listenerTopology", "unknown"),
        lambda r: r.__setitem__("listenerPid", r["pid"]),
    ],
)
def test_persisted_direct_topology_rejects_missing_unknown_or_child_fields_without_mutation(tmp_path, mutator):
    runtime, logs = isolated_roots(tmp_path)
    port = free_port()
    proc = start_listener(port)
    try:
        wait_for_port(port)
        record = process_record(ProcessRef(any_listener_pid(port)), port, "backend", topology="direct")
        mutator(record)
        state_path = write_state(runtime, backend=record)
        before = state_path.read_text(encoding="utf-8")
        result = run_stop(runtime, logs)
        assert result.returncode == 3
        assert state_path.read_text(encoding="utf-8") == before
    finally:
        proc.kill()


@pytest.mark.parametrize(
    "mutator",
    [
        lambda r: r.pop("listenerPid"),
        lambda r: r.pop("listenerStartTimeUtc"),
        lambda r: r.pop("listenerExecutable"),
        lambda r: r.pop("listenerParentPid"),
        lambda r: r.__setitem__("listenerPid", r["pid"]),
        lambda r: r.__setitem__("listenerStartTimeUtc", "2000-01-01T00:00:00.0000000Z"),
        lambda r: r.__setitem__("listenerExecutable", "C:/wrong/python.exe"),
        lambda r: r.__setitem__("listenerParentPid", 999999),
    ],
)
def test_persisted_direct_child_topology_requires_exact_child_identity_without_mutation(tmp_path, mutator):
    runtime, logs = isolated_roots(tmp_path)
    port = free_port()
    parent, child = start_parent_child_listener(tmp_path, port)
    try:
        record = process_record(ProcessRef(parent_pid(child.pid)), port, "backend", topology="direct_child", child=child)
        mutator(record)
        state_path = write_state(runtime, backend=record)
        before = state_path.read_text(encoding="utf-8")
        result = run_stop(runtime, logs)
        assert result.returncode == 3
        assert state_path.read_text(encoding="utf-8") == before
    finally:
        if parent.poll() is None:
            parent.kill()
        subprocess.run(["powershell.exe", "-NoProfile", "-Command", f"Stop-Process -Id {child.pid} -Force -ErrorAction SilentlyContinue"], timeout=10)


def test_persisted_wildcard_listener_is_rejected_without_mutation(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    port = free_port()
    proc = start_listener(port, host="0.0.0.0")
    try:
        time.sleep(1)
        record = process_record(ProcessRef(any_listener_pid(port)), port, "backend", topology="direct")
        state_path = write_state(runtime, backend=record)
        before = state_path.read_text(encoding="utf-8")
        result = run_stop(runtime, logs)
        assert result.returncode == 3
        assert state_path.read_text(encoding="utf-8") == before
    finally:
        proc.kill()


def test_stop_exit_codes_for_no_state_and_invalid_state(tmp_path):
    runtime, logs = isolated_roots(tmp_path)
    snapshot = snapshot_real_runtime()
    no_state = run_stop(runtime, logs)
    assert no_state.returncode == 0

    state_path = runtime / "shared-session-state.json"
    state_path.write_text("{not-json", encoding="utf-8")
    unreadable = run_stop(runtime, logs)
    assert unreadable.returncode == 2
    assert state_path.exists()

    state_path.write_text(json.dumps({"schemaVersion": 1, "repositoryRoot": str(REPO_ROOT), "profile": "shared_remote"}), encoding="utf-8")
    wrong_schema = run_stop(runtime, logs)
    assert wrong_schema.returncode == 2
    assert state_path.exists()
    before_schema_2 = json.dumps({"schemaVersion": 2, "repositoryRoot": str(REPO_ROOT), "profile": "shared_remote"}, sort_keys=True)
    state_path.write_text(before_schema_2, encoding="utf-8")
    legacy_schema = run_stop(runtime, logs)
    assert legacy_schema.returncode == 2
    assert state_path.read_text(encoding="utf-8") == before_schema_2
    state_path.unlink()
    assert_real_runtime_unchanged(snapshot)


def test_launcher_log_retention_deletes_only_old_recognized_files(tmp_path):
    runtime, log_dir = isolated_roots(tmp_path)
    snapshot = snapshot_real_runtime()
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
    result = run_launcher(["-ValidateOnly", "-TestMode", "-SecretPath", str(secret), "-FakeSshExe", str(fake_ssh), *isolated_args(runtime, log_dir)], timeout=30)
    assert result.returncode == 0
    run_stop(runtime, log_dir, timeout=30)

    assert not old_start.exists()
    assert not old_stop.exists()
    assert recent_start.exists()
    assert unknown_old.exists()
    assert_real_runtime_unchanged(snapshot)
