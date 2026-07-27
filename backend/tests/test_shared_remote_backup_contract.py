"""Isolated contract tests for shared-remote backup tooling."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile

import pytest

from app.core.shared_dev_backup import (
    BACKUP_SCHEMA_VERSION,
    LOCAL_BACKUP_KEEP_COUNT,
    POSTGRES_IDENTIFIER_MAX_BYTES,
    SERVER_BACKUP_KEEP_COUNT,
    SHARED_DEV_DATABASE_NAME,
    SHARED_DEV_REMOTE_MEDIA_ROOT,
    BackupFileMetadata,
    RemoteBackupEntry,
    SharedDevBackupContractError,
    MediaInventoryEntry,
    WindowsAclAce,
    assert_manifest_is_safe,
    ensure_child_name_under_root,
    expected_windows_backup_acl_sids,
    local_retention_delete_candidates,
    media_tree_fingerprint,
    newest_successful_backup,
    reject_authoritative_or_production_restore_target,
    require_backup_verify_database_name,
    require_shared_dev_database_name,
    require_shared_dev_media_root,
    require_temporary_database_name,
    server_retention_delete_candidates,
    scheduled_task_matches_repository,
    scheduled_daily_boundary_is_exact_10,
    scheduled_task_logon_type_is_interactive,
    scheduled_task_settings_match,
    validate_backup_id,
    validate_exact_backup_file_set,
    validate_local_run_partial_name,
    validate_manifest_cross_checks,
    validate_media_relative_path,
    validate_remote_backup_listing,
    validate_sha256sums,
    validate_tarinfo_members,
    validate_windows_backup_acl,
    validate_windows_backup_item_security,
    validate_windows_acl_sids,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
SERVER_CREATE = REPO_ROOT / "deploy" / "backup" / "create-shared-dev-backup.sh"
SERVER_VERIFY = REPO_ROOT / "deploy" / "backup" / "verify-shared-dev-backup.sh"
RESTORE_VERIFY = REPO_ROOT / "deploy" / "backup" / "verify-shared-dev-restore.sh"
ARCHIVE_VERIFIER = REPO_ROOT / "deploy" / "backup" / "verify-shared-media-archive.py"
CANVAS_FINGERPRINT = REPO_ROOT / "deploy" / "backup" / "compute-shared-canvas-fingerprint.py"
PULL_SCRIPT = REPO_ROOT / "scripts" / "pull-shared-dev-backup.ps1"
TASK_SCRIPT = REPO_ROOT / "scripts" / "install-shared-dev-backup-pull-task.ps1"
DOC = REPO_ROOT / "docs" / "14_SHARED_REMOTE_BACKUP_AND_RECOVERY.md"
BACKUP_TEMP_DB = "pw_bk_v_20260726T033000Z_0123456789abcdef0123456789abcdef"
RESTORE_TEMP_DB = "pw_rs_v_20260726T033000Z_0123456789abcdef0123456789abcdef"
LEGACY_BACKUP_TEMP_DB = "personal_web_shared_dev_backup_verify_20260726T033000Z_0123456789abcdef"
LEGACY_RESTORE_TEMP_DB = "personal_web_shared_dev_restore_verify_20260726T033000Z_0123456789abcdef"
TRUNCATED_LEGACY_BACKUP_TEMP_DB = "personal_web_shared_dev_backup_verify_20260726T101954Z_2867ffca"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_canvas_helper():
    spec = importlib.util.spec_from_file_location("compute_shared_canvas_fingerprint", CANVAS_FINGERPRINT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def git_bash() -> str:
    for candidate in [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files\Git\usr\bin\bash.exe",
        shutil.which("bash"),
    ]:
        if candidate and Path(candidate).exists():
            return candidate
    pytest.skip("Git Bash is not available")


def run_bash(script: str, tmp_path: Path) -> subprocess.CompletedProcess[str]:
    python_exe = Path(sys.executable).as_posix()
    return subprocess.run(
        [git_bash(), "-lc", f'python3() {{ "{python_exe}" "$@"; }}\n{script}'],
        cwd=tmp_path,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )


def run_powershell(script: str, tmp_path: Path) -> subprocess.CompletedProcess[str]:
    script_path = tmp_path / "run.ps1"
    script_path.write_text(script, encoding="utf-8")
    return subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script_path)],
        cwd=tmp_path,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )


def write_tar(archive: Path, entries: list[tuple[str, str, bytes]]) -> None:
    with tarfile.open(archive, "w:gz") as tar:
        for kind, name, payload in entries:
            info = tarfile.TarInfo(name)
            if kind == "file":
                info.type = tarfile.REGTYPE
                info.size = len(payload)
                import io

                tar.addfile(info, io.BytesIO(payload))
            elif kind == "dir":
                info.type = tarfile.DIRTYPE
                tar.addfile(info)
            elif kind == "symlink":
                info.type = tarfile.SYMTYPE
                info.linkname = "target"
                tar.addfile(info)
            elif kind == "hardlink":
                info.type = tarfile.LNKTYPE
                info.linkname = "target"
                tar.addfile(info)
            elif kind == "fifo":
                info.type = tarfile.FIFOTYPE
                tar.addfile(info)
            else:
                raise AssertionError(kind)


def archive_manifest(archive: Path, entries: list[MediaInventoryEntry], *, fingerprint_override: str | None = None) -> dict[str, object]:
    return {
        **safe_manifest(),
        "mediaArchive": {
            "filename": archive.name,
            "size": archive.stat().st_size,
            "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        },
        "sourceMediaRegularFileCount": len(entries),
        "sourceMediaLogicalBytes": sum(entry.size for entry in entries),
        "sourceMediaTreeFingerprint": fingerprint_override or media_tree_fingerprint(entries),
    }


def run_archive_verifier(archive: Path, extract_dir: Path, *, manifest: Path | None = None, inventory: Path | None = None, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    extract_dir.mkdir(mode=0o700)
    args = [sys.executable, str(ARCHIVE_VERIFIER), "--archive", str(archive), "--extract-dir", str(extract_dir)]
    if manifest:
        args.extend(["--expect-manifest", str(manifest)])
    if inventory:
        args.extend(["--write-inventory", str(inventory)])
    merged_env = {**os.environ, **(env or {})}
    return subprocess.run(args, text=True, capture_output=True, check=False, env=merged_env)


def safe_manifest() -> dict[str, object]:
    return {
        "schemaVersion": BACKUP_SCHEMA_VERSION,
        "backupId": "20260726T033000Z-AbCd1234",
        "databaseName": SHARED_DEV_DATABASE_NAME,
        "sourceMediaRoot": SHARED_DEV_REMOTE_MEDIA_ROOT,
        "alembicRevision": "20260712_0006",
        "canvasFingerprint": "canvas-fingerprint",
        "verification": {"ok": True},
        "tableCounts": {"homepage_media": 62},
        "databaseDump": {"filename": "personal_web_shared_dev.dump", "size": 10, "sha256": "a" * 64},
        "mediaArchive": {"filename": "homepage-media.tar.gz", "size": 20, "sha256": "b" * 64},
        "sourceMediaRegularFileCount": 1,
        "sourceMediaLogicalBytes": 5,
        "sourceMediaTreeFingerprint": media_tree_fingerprint([MediaInventoryEntry("images/a.png", 5, "c" * 64)]),
    }


def test_only_shared_development_database_is_accepted() -> None:
    assert require_shared_dev_database_name("personal_web_shared_dev") == "personal_web_shared_dev"

    with pytest.raises(SharedDevBackupContractError):
        require_shared_dev_database_name("personal_web_prod")
    with pytest.raises(SharedDevBackupContractError):
        require_shared_dev_database_name("personal_web_shared_dev_copy")


def test_exact_remote_media_root_is_required() -> None:
    assert require_shared_dev_media_root("/srv/personal-web/shared-dev/homepage/") == SHARED_DEV_REMOTE_MEDIA_ROOT

    with pytest.raises(SharedDevBackupContractError):
        require_shared_dev_media_root("/srv/personal-web/prod/homepage")
    with pytest.raises(SharedDevBackupContractError):
        require_shared_dev_media_root("/srv/personal-web/shared-dev/homepage/../prod")


def test_backup_paths_cannot_escape_root(tmp_path: Path) -> None:
    root = tmp_path / "backups"
    root.mkdir()
    child = ensure_child_name_under_root(root, "20260726T033000Z-AbCd1234")

    assert child.parent == root.resolve()
    with pytest.raises(SharedDevBackupContractError):
        ensure_child_name_under_root(root, "../20260726T033000Z-AbCd1234")


def test_backup_verification_database_name_is_strictly_temporary() -> None:
    assert require_backup_verify_database_name(BACKUP_TEMP_DB) == BACKUP_TEMP_DB

    for unsafe in [
        "personal_web_shared_dev",
        "personal_web_prod",
        "pw_bk_v_20260726T033000Z_ABCDEF0123456789ABCDEF0123456789",
        "pw_bk_v_20260726T033000Z_0123456789abcdef",
        "pw_bk_v_20260726T033000_0123456789abcdef0123456789abcdef",
        "pw_bk_v_20260726T033000Z_0123456789abcdef0123456789abcdeg",
        "pw_bk_v_20260726T033000Z_0123456789abcdef0123456789abcdef;",
        "pw_bk_v_20260726T033000Z_0123456789abcdef0123456789abcdef_extra",
        "pw_bk_v_20260726T033000Z_0123456789abcdef0123456789abcdeé",
        LEGACY_BACKUP_TEMP_DB,
        TRUNCATED_LEGACY_BACKUP_TEMP_DB,
    ]:
        with pytest.raises(SharedDevBackupContractError):
            require_backup_verify_database_name(unsafe)


def test_compact_temporary_database_name_contracts() -> None:
    assert require_temporary_database_name(BACKUP_TEMP_DB, kind="backup") == BACKUP_TEMP_DB
    assert reject_authoritative_or_production_restore_target(RESTORE_TEMP_DB) == RESTORE_TEMP_DB
    assert len(BACKUP_TEMP_DB.encode("utf-8")) == 57
    assert len(RESTORE_TEMP_DB.encode("utf-8")) == 57
    assert len(BACKUP_TEMP_DB.encode("utf-8")) <= POSTGRES_IDENTIFIER_MAX_BYTES
    assert re.fullmatch(r"^pw_bk_v_[0-9]{8}T[0-9]{6}Z_[0-9a-f]{32}$", BACKUP_TEMP_DB)
    assert re.fullmatch(r"^pw_rs_v_[0-9]{8}T[0-9]{6}Z_[0-9a-f]{32}$", RESTORE_TEMP_DB)

    unsafe_values = [
        "personal_web_shared_dev",
        "personal_web_prod",
        "pw_bk_v_20260726T033000Z_0123456789abcdef0123456789abcprod",
        LEGACY_BACKUP_TEMP_DB,
        LEGACY_RESTORE_TEMP_DB,
        TRUNCATED_LEGACY_BACKUP_TEMP_DB,
        "pw_bk_v_20260726T033000Z_0123456789abcdef0123456789abcdef" + "0" * 7,
        "pw_bk_v_20260726T033000Z_0123456789abcdef0123456789abcdef\n",
        "pw_bk_v_20260726T033000Z_0123456789abcdef0123456789abcdef;",
        "pw_bk_v_20260726T033000Z_0123456789abcdef0123456789abcdef'",
        "pw_bk_v_20260726T033000Z_0123456789abcdef0123456789abcdeé",
    ]
    for value in unsafe_values:
        with pytest.raises(SharedDevBackupContractError):
            require_temporary_database_name(value, kind="backup")


def test_random_suffix_helper_is_pipefail_safe_under_real_bash(tmp_path: Path) -> None:
    script_path = SERVER_CREATE.as_posix()
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{script_path}"
for i in $(seq 1 100); do
  value="$(random_suffix)"
  [[ "$value" =~ ^[0-9a-f]{{32}}$ ]]
  printf '%s\\n' "$value"
done
''',
        tmp_path,
    )

    assert result.returncode == 0, result.stderr
    values = result.stdout.splitlines()
    assert len(values) == 100
    assert len(set(values)) == 100


def test_real_bash_generates_unique_compact_temporary_database_names(tmp_path: Path) -> None:
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
for i in $(seq 1 100); do
  suffix="$(random_suffix)"
  name="pw_bk_v_$(date -u +%Y%m%dT%H%M%SZ)_$suffix"
  require_safe_verify_db "$name"
  [[ "$name" =~ ^pw_bk_v_[0-9]{{8}}T[0-9]{{6}}Z_[0-9a-f]{{32}}$ ]]
  [[ "$(printf '%s' "$name" | wc -c | tr -d ' ')" == "57" ]]
  printf 'backup=%s\\n' "$name"
done
source "{RESTORE_VERIFY.as_posix()}"
for i in $(seq 1 100); do
  suffix="$(random_suffix)"
  name="pw_rs_v_$(date -u +%Y%m%dT%H%M%SZ)_$suffix"
  require_safe_restore_db "$name"
  [[ "$name" =~ ^pw_rs_v_[0-9]{{8}}T[0-9]{{6}}Z_[0-9a-f]{{32}}$ ]]
  [[ "$(printf '%s' "$name" | wc -c | tr -d ' ')" == "57" ]]
  printf 'restore=%s\\n' "$name"
done
''',
        tmp_path,
    )

    assert result.returncode == 0, result.stderr
    backup_names = [line.removeprefix("backup=") for line in result.stdout.splitlines() if line.startswith("backup=")]
    restore_names = [line.removeprefix("restore=") for line in result.stdout.splitlines() if line.startswith("restore=")]
    assert len(backup_names) == 100
    assert len(restore_names) == 100
    assert len(set(backup_names)) == 100
    assert len(set(restore_names)) == 100
    assert all(len(name.encode("utf-8")) <= POSTGRES_IDENTIFIER_MAX_BYTES for name in backup_names + restore_names)


def test_systemd_does_not_skip_missing_required_paths() -> None:
    service = read(REPO_ROOT / "deploy" / "backup" / "personal-web-shared-dev-backup.service")

    assert "ConditionPathExists" not in service
    assert "ConditionPathIsDirectory" not in service
    assert "ProtectSystem=strict" in service
    assert "ReadOnlyPaths=/srv/personal-web/shared-dev/homepage" in service
    assert "ReadWritePaths=/var/backups/personal-web/shared-dev /run/lock" in service


def test_backup_script_stage_ids_are_ordered_and_pg_restore_exits_on_error() -> None:
    script = read(SERVER_CREATE)
    expected = [
        "B01_PRECHECK",
        "B02_SOURCE_DB_PROPERTIES",
        "B03_DATABASE_DUMP",
        "B04_VERIFY_DB_CREATE",
        "B05_DATABASE_RESTORE",
        "B06_RESTORED_METADATA",
        "B07_CANVAS_FINGERPRINT",
        "B08_VERIFY_DB_CLEANUP",
        "B09_MEDIA_SCAN",
        "B10_MEDIA_INVENTORY",
        "B11_MEDIA_ARCHIVE",
        "B12_ARCHIVE_VERIFY",
        "B13_MANIFEST",
        "B14_FINAL_VERIFY",
        "B15_RETENTION",
    ]
    positions = [script.index(stage) for stage in expected]

    assert positions == sorted(positions)
    assert "stage_start id=" in script
    assert "stage_ok id=" in script
    assert "stage_error id=" in script
    assert "command_category=" in script
    assert "pg_restore --exit-on-error --no-owner --no-privileges" in script


def test_stage_logging_emits_start_and_ok_under_real_bash(tmp_path: Path) -> None:
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
run_stage B09_MEDIA_SCAN media_scan true
''',
        tmp_path,
    )

    assert result.returncode == 0, result.stderr
    assert "stage_start id=B09_MEDIA_SCAN name=media_scan" in result.stderr
    assert "stage_ok id=B09_MEDIA_SCAN name=media_scan" in result.stderr


def test_pg_restore_failure_logs_b05_and_preserves_exit_code(tmp_path: Path) -> None:
    dump = tmp_path / "dump.bin"
    dump.write_bytes(b"fake")
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
run_pg() {{ return 44; }}
run_stage B05_DATABASE_RESTORE database_restore restore_dump_into_verify_database {BACKUP_TEMP_DB} "{dump.as_posix()}"
''',
        tmp_path,
    )

    assert result.returncode == 44
    assert "stage_start id=B05_DATABASE_RESTORE name=database_restore" in result.stderr
    assert "stage_error id=B05_DATABASE_RESTORE name=database_restore" in result.stderr
    assert "exit=44" in result.stderr
    assert "command_category=pg_restore" in result.stderr


def test_exit_cleanup_runs_after_stage_failure_and_preserves_status(tmp_path: Path) -> None:
    partial = tmp_path / "20260726T033000Z-AbCd1234.partial"
    partial.mkdir()
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
BACKUP_ROOT="{tmp_path.as_posix()}"
partial_dir="{partial.as_posix()}"
verify_db=""
verify_extract=""
trap 'status=$?; cleanup_backup_run "$status"' EXIT
trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
failing_stage() {{ return 44; }}
run_stage B05_DATABASE_RESTORE database_restore failing_stage
''',
        tmp_path,
    )

    assert result.returncode == 44
    assert not partial.exists()
    assert "cleanup completed after failure original_status=44" in result.stderr


def test_stage_error_log_does_not_print_sensitive_command_text(tmp_path: Path) -> None:
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
fake_password_url_canvas_json_command() {{ return 12; }}
run_stage B05_DATABASE_RESTORE database_restore fake_password_url_canvas_json_command
''',
        tmp_path,
    )

    assert result.returncode == 12
    assert "stage_error id=B05_DATABASE_RESTORE" in result.stderr
    assert "fake_password_url_canvas_json_command" not in result.stderr
    assert "password" not in result.stderr.lower()
    assert "canvas_json" not in result.stderr.lower()


def test_backup_script_missing_roots_fail_without_success_marker(tmp_path: Path) -> None:
    missing_root = tmp_path / "missing-backup-root"
    missing_media = tmp_path / "missing-media-root"
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
flock() {{ return 0; }}
LOCK_FILE="{(tmp_path / 'backup.lock').as_posix()}"
BACKUP_ROOT="{missing_root.as_posix()}"
MEDIA_ROOT="{missing_media.as_posix()}"
set +e
( main )
code="$?"
printf 'code=%s\\n' "$code"
find "{tmp_path.as_posix()}" -name SUCCESS -print
exit 0
''',
        tmp_path,
    )

    assert result.returncode == 0, result.stderr
    assert "code=0" not in result.stdout
    assert "backup root must be installed" in result.stderr
    assert "SUCCESS" not in result.stdout


def test_backup_script_missing_media_and_unsafe_roots_fail_before_success(tmp_path: Path) -> None:
    backup_root = tmp_path / "backup-root"
    media_root = tmp_path / "media-root"
    backup_root.mkdir()
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
BACKUP_ROOT="{backup_root.as_posix()}"
MEDIA_ROOT="{media_root.as_posix()}"
set +e
( require_shared_sources )
printf 'missing_media=%s\\n' "$?"
( require_root_dir_0700 "{backup_root.as_posix()}" )
printf 'unsafe_backup_root=%s\\n' "$?"
mkdir -p "{media_root.as_posix()}"
( require_root_dir_0700 "{media_root.as_posix()}" )
printf 'unsafe_media_root=%s\\n' "$?"
find "{tmp_path.as_posix()}" -name SUCCESS -print
exit 0
''',
        tmp_path,
    )

    assert result.returncode == 0, result.stderr
    assert "missing_media=0" not in result.stdout
    assert "unsafe_backup_root=0" not in result.stdout
    assert "unsafe_media_root=0" not in result.stdout
    assert "SUCCESS" not in result.stdout


def test_media_scan_stage_returns_success_for_empty_safe_directory(tmp_path: Path) -> None:
    media_root = tmp_path / "media"
    media_root.mkdir()
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
MEDIA_ROOT="{media_root.as_posix()}"
run_stage B09_MEDIA_SCAN media_scan reject_unsafe_media_entries
''',
        tmp_path,
    )

    assert result.returncode == 0, result.stderr
    assert "stage_start id=B09_MEDIA_SCAN name=media_scan" in result.stderr
    assert "stage_ok id=B09_MEDIA_SCAN name=media_scan" in result.stderr


def test_media_scan_returns_success_for_regular_files_only(tmp_path: Path) -> None:
    media_root = tmp_path / "media"
    nested = media_root / "images"
    nested.mkdir(parents=True)
    (nested / "photo.png").write_bytes(b"regular media bytes")
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
MEDIA_ROOT="{media_root.as_posix()}"
run_stage B09_MEDIA_SCAN media_scan reject_unsafe_media_entries
''',
        tmp_path,
    )

    assert result.returncode == 0, result.stderr
    assert "stage_ok id=B09_MEDIA_SCAN name=media_scan" in result.stderr


def test_media_scan_rejects_symlink_without_stage_ok(tmp_path: Path) -> None:
    media_root = tmp_path / "media"
    target = media_root / "target"
    link = media_root / "link"
    target.mkdir(parents=True)
    subprocess.run(
        ["cmd", "/c", "mklink", "/J", str(link), str(target)],
        check=True,
        capture_output=True,
        text=True,
    )
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
MEDIA_ROOT="{media_root.as_posix()}"
run_stage B09_MEDIA_SCAN media_scan reject_unsafe_media_entries
''',
        tmp_path,
    )

    assert result.returncode != 0
    assert "unsafe media filesystem entry found" in result.stderr
    assert "stage_start id=B09_MEDIA_SCAN name=media_scan" in result.stderr
    assert "stage_ok id=B09_MEDIA_SCAN" not in result.stderr


def test_media_scan_rejects_synthetic_special_entry_without_logging_path(tmp_path: Path) -> None:
    media_root = tmp_path / "media"
    media_root.mkdir()
    synthetic_path = media_root / "synthetic-fifo"
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
MEDIA_ROOT="{media_root.as_posix()}"
find() {{ printf '%s\\n' "{synthetic_path.as_posix()}"; return 0; }}
run_stage B09_MEDIA_SCAN media_scan reject_unsafe_media_entries
''',
        tmp_path,
    )

    assert result.returncode != 0
    assert "unsafe media filesystem entry found" in result.stderr
    assert "synthetic-fifo" not in result.stderr
    assert "stage_ok id=B09_MEDIA_SCAN" not in result.stderr


def test_media_scan_failed_find_preserves_status_and_logs_find_category(tmp_path: Path) -> None:
    media_root = tmp_path / "media"
    media_root.mkdir()
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
MEDIA_ROOT="{media_root.as_posix()}"
find() {{ return 7; }}
run_stage B09_MEDIA_SCAN media_scan reject_unsafe_media_entries
''',
        tmp_path,
    )

    assert result.returncode == 7
    assert "media filesystem safety scan failed" in result.stderr
    assert "stage_error id=B09_MEDIA_SCAN name=media_scan" in result.stderr
    assert "exit=7" in result.stderr
    assert "command_category=find" in result.stderr
    assert "stage_ok id=B09_MEDIA_SCAN" not in result.stderr


def test_media_scan_fake_find_output_uses_unsafe_entry_classification(tmp_path: Path) -> None:
    media_root = tmp_path / "media"
    media_root.mkdir()
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
MEDIA_ROOT="{media_root.as_posix()}"
find() {{ printf '%s\\n' "{(media_root / 'unsafe-socket').as_posix()}"; return 0; }}
reject_unsafe_media_entries
''',
        tmp_path,
    )

    assert result.returncode != 0
    assert "unsafe media filesystem entry found" in result.stderr
    assert "media filesystem safety scan failed" not in result.stderr


def test_failed_media_scan_invokes_exit_cleanup_without_sensitive_logs(tmp_path: Path) -> None:
    media_root = tmp_path / "media"
    media_root.mkdir()
    partial = tmp_path / "20260726T040000Z-AbCd1234.partial"
    partial.mkdir()
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
BACKUP_ROOT="{tmp_path.as_posix()}"
MEDIA_ROOT="{media_root.as_posix()}"
partial_dir="{partial.as_posix()}"
verify_db=""
verify_extract=""
trap 'status=$?; cleanup_backup_run "$status"' EXIT
trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
fake_password_url_canvas_json_media_content_find() {{ return 7; }}
find() {{ fake_password_url_canvas_json_media_content_find; }}
run_stage B09_MEDIA_SCAN media_scan reject_unsafe_media_entries
''',
        tmp_path,
    )

    assert result.returncode == 7
    assert not partial.exists()
    assert "cleanup completed after failure original_status=7" in result.stderr
    assert "stage_error id=B09_MEDIA_SCAN name=media_scan" in result.stderr
    assert "command_category=find" in result.stderr
    assert "password" not in result.stderr.lower()
    assert "https://example.invalid" not in result.stderr
    assert "canvas_json" not in result.stderr.lower()
    assert "media content" not in result.stderr.lower()


def test_fake_postgres_metadata_and_template0_creation_flow(tmp_path: Path) -> None:
    source_props = tmp_path / "source.json"
    verify_props = tmp_path / "verify.json"
    dump = tmp_path / "dump.bin"
    calls = tmp_path / "calls.log"
    dump.write_bytes(b"fake dump")
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
run_pg() {{
  printf '%s\\n' "$*" >> "{calls.as_posix()}"
  case "$1" in
    psql)
      case "$*" in
        *"select datname from pg_database"*) printf '%s\\n' "{BACKUP_TEMP_DB}" ;;
        *) printf '%s\\n' '{{"databaseEncoding":"UTF8","databaseCollate":"zh-Hans-CN-x-icu","databaseCtype":"zh-Hans-CN-x-icu"}}' ;;
      esac
      ;;
    createdb|pg_restore)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}}
collect_source_database_properties "{source_props.as_posix()}"
create_verify_database_from_dump {BACKUP_TEMP_DB} "{dump.as_posix()}" "{source_props.as_posix()}" "{verify_props.as_posix()}"
''',
        tmp_path,
    )

    assert result.returncode == 0, result.stderr
    call_text = calls.read_text(encoding="utf-8")
    assert "createdb --template=template0 --encoding=UTF8 --lc-collate=zh-Hans-CN-x-icu --lc-ctype=zh-Hans-CN-x-icu" in call_text
    assert f"select datname from pg_database where datname = '{BACKUP_TEMP_DB}'" in call_text
    assert json.loads(source_props.read_text(encoding="utf-8")) == json.loads(verify_props.read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    ("readback", "expected_error"),
    [
        ("", "readback mismatch"),
        (TRUNCATED_LEGACY_BACKUP_TEMP_DB, "readback mismatch"),
        (f"{BACKUP_TEMP_DB}\\n{BACKUP_TEMP_DB}", "readback mismatch"),
    ],
)
def test_backup_createdb_exact_name_readback_rejects_unexpected_output(tmp_path: Path, readback: str, expected_error: str) -> None:
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
run_pg() {{ printf '%s\\n' "{readback}"; }}
verify_database_created_exactly {BACKUP_TEMP_DB}
''',
        tmp_path,
    )

    assert result.returncode != 0
    assert expected_error in result.stderr


def test_backup_createdb_exact_name_query_failure_fails(tmp_path: Path) -> None:
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
run_pg() {{ return 44; }}
verify_database_created_exactly {BACKUP_TEMP_DB}
''',
        tmp_path,
    )

    assert result.returncode != 0
    assert "exact-name query failed" in result.stderr


def test_database_exists_distinguishes_query_failure_and_remaining_db(tmp_path: Path) -> None:
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
run_pg() {{ return 44; }}
set +e
database_exists {BACKUP_TEMP_DB}
printf 'query=%s\\n' "$?"
run_pg() {{ printf '1\\n'; }}
database_exists {BACKUP_TEMP_DB}
printf 'remaining=%s\\n' "$?"
run_pg() {{ printf ''; }}
database_exists {BACKUP_TEMP_DB}
printf 'absent=%s\\n' "$?"
''',
        tmp_path,
    )

    assert result.returncode == 0, result.stderr
    assert "query=2" in result.stdout
    assert "remaining=0" in result.stdout
    assert "absent=1" in result.stdout


def test_media_archive_paths_reject_symlink_traversal_contract() -> None:
    assert validate_media_relative_path("images/a.png") == "images/a.png"

    for unsafe in ["/images/a.png", "../a.png", "images/../a.png", "C:/a.png", "images\\..\\a.png"]:
        with pytest.raises(SharedDevBackupContractError):
            validate_media_relative_path(unsafe)


def test_tar_symlink_hardlink_and_special_members_are_rejected() -> None:
    file_member = tarfile.TarInfo("images/a.png")
    file_member.type = tarfile.REGTYPE
    directory_member = tarfile.TarInfo("images")
    directory_member.type = tarfile.DIRTYPE
    assert validate_tarinfo_members([directory_member, file_member]) == ["images/a.png"]

    for member_type in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.BLKTYPE, tarfile.FIFOTYPE]:
        member = tarfile.TarInfo("images/bad")
        member.type = member_type
        with pytest.raises(SharedDevBackupContractError):
            validate_tarinfo_members([member])


def test_tar_traversal_rejected_before_extraction() -> None:
    member = tarfile.TarInfo("../outside")
    member.type = tarfile.REGTYPE

    with pytest.raises(SharedDevBackupContractError):
        validate_tarinfo_members([member])


def test_canonical_archive_verifier_accepts_leading_dash_name(tmp_path: Path) -> None:
    archive = tmp_path / "homepage-media.tar.gz"
    write_tar(archive, [("file", "-dash.txt", b"dash")])
    entries = [MediaInventoryEntry("-dash.txt", 4, hashlib.sha256(b"dash").hexdigest())]
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(archive_manifest(archive, entries)), encoding="utf-8")
    inventory_path = tmp_path / "inventory.jsonl"

    result = run_archive_verifier(archive, tmp_path / "extract", manifest=manifest_path, inventory=inventory_path)

    assert result.returncode == 0, result.stderr
    assert not (tmp_path / "extract").exists()
    assert [json.loads(line)["path"] for line in inventory_path.read_text(encoding="utf-8").splitlines()] == ["-dash.txt"]


def test_newline_media_filename_is_unambiguous_in_nul_inventory_contract() -> None:
    assert validate_media_relative_path("folder/line\nbreak.txt") == "folder/line\nbreak.txt"
    script = read(SERVER_CREATE)
    assert "printf '%s\\0' \"$relative_path\"" in script
    assert "--null --verbatim-files-from --no-recursion" in script


@pytest.mark.parametrize(
    ("kind", "name", "expected"),
    [
        ("symlink", "images/link", "symlink"),
        ("hardlink", "images/hard", "hardlink"),
        ("fifo", "images/fifo", "fifo"),
        ("file", "../outside", "traversal"),
        ("file", "C:/drive.txt", "drive"),
        ("file", "back\\slash.txt", "backslash"),
    ],
)
def test_canonical_archive_verifier_rejects_malicious_members(tmp_path: Path, kind: str, name: str, expected: str) -> None:
    archive = tmp_path / "homepage-media.tar.gz"
    write_tar(archive, [(kind, name, b"bad")])

    result = run_archive_verifier(archive, tmp_path / "extract")

    assert result.returncode != 0
    assert expected in result.stderr
    assert not (tmp_path / "extract").exists()


def test_canonical_archive_verifier_rejects_duplicate_and_file_directory_conflict(tmp_path: Path) -> None:
    duplicate = tmp_path / "duplicate.tar.gz"
    write_tar(duplicate, [("file", "images/a.txt", b"1"), ("file", "images/a.txt", b"2")])
    conflict = tmp_path / "conflict.tar.gz"
    write_tar(conflict, [("file", "images", b"1"), ("dir", "images/child", b"")])

    duplicate_result = run_archive_verifier(duplicate, tmp_path / "dup-extract")
    conflict_result = run_archive_verifier(conflict, tmp_path / "conflict-extract")

    assert duplicate_result.returncode != 0
    assert "duplicate" in duplicate_result.stderr
    assert conflict_result.returncode != 0
    assert "conflict" in conflict_result.stderr


def test_canonical_archive_verifier_rejects_manifest_fingerprint_mismatch(tmp_path: Path) -> None:
    archive = tmp_path / "homepage-media.tar.gz"
    payload = b"content"
    write_tar(archive, [("file", "images/a.txt", payload)])
    entries = [MediaInventoryEntry("images/a.txt", len(payload), hashlib.sha256(payload).hexdigest())]
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(archive_manifest(archive, entries, fingerprint_override="0" * 64)), encoding="utf-8")

    result = run_archive_verifier(archive, tmp_path / "extract", manifest=manifest_path)

    assert result.returncode != 0
    assert "fingerprint" in result.stderr
    assert not (tmp_path / "extract").exists()


@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [
        ("sourceMediaRegularFileCount", 2, "count"),
        ("sourceMediaLogicalBytes", 999, "logical bytes"),
        ("mediaArchive.filename", "wrong.tar.gz", "filename"),
        ("mediaArchive.size", 999, "size"),
        ("mediaArchive.sha256", "0" * 64, "hash"),
    ],
)
def test_canonical_archive_verifier_rejects_manifest_mismatches(tmp_path: Path, field: str, value: object, expected: str) -> None:
    archive = tmp_path / "homepage-media.tar.gz"
    payload = b"content"
    write_tar(archive, [("file", "images/a.txt", payload)])
    entries = [MediaInventoryEntry("images/a.txt", len(payload), hashlib.sha256(payload).hexdigest())]
    manifest = archive_manifest(archive, entries)
    if field.startswith("mediaArchive."):
        manifest["mediaArchive"][field.split(".", 1)[1]] = value  # type: ignore[index]
    else:
        manifest[field] = value
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    result = run_archive_verifier(archive, tmp_path / "extract", manifest=manifest_path)

    assert result.returncode != 0
    assert expected in result.stderr
    assert not (tmp_path / "extract").exists()


def test_canonical_archive_verifier_reports_cleanup_failure(tmp_path: Path) -> None:
    archive = tmp_path / "homepage-media.tar.gz"
    write_tar(archive, [("file", "images/a.txt", b"a")])
    extract = tmp_path / "extract"

    result = run_archive_verifier(
        archive,
        extract,
        env={"PERSONAL_WEB_ARCHIVE_VERIFY_SIMULATE_CLEANUP_FAILURE": "1"},
    )

    assert result.returncode != 0
    assert "cleanup incomplete" in result.stderr
    shutil.rmtree(extract, ignore_errors=True)


def canvas_rows() -> list[dict[str, object]]:
    return [
        {
            "canvas_key": "default",
            "schema_version": "sketch-canvas-v1",
            "revision": 7,
            "updated_at": "2026-07-26T10:00:00+00:00",
            "canvas_data": {"nodes": [{"id": 2, "label": "B"}], "strokes": [{"points": [1, 2, 3]}]},
        }
    ]


def test_canvas_fingerprint_is_stable_and_object_key_order_independent() -> None:
    helper = load_canvas_helper()
    rows_a = canvas_rows()
    rows_b = [
        {
            "revision": 7,
            "updated_at": "2026-07-26T10:00:00+00:00",
            "schema_version": "sketch-canvas-v1",
            "canvas_data": {"strokes": [{"points": [1, 2, 3]}], "nodes": [{"label": "B", "id": 2}]},
            "canvas_key": "default",
        }
    ]

    assert helper.canonical_canvas_fingerprint(rows_a) == helper.canonical_canvas_fingerprint(rows_b)


def test_canvas_fingerprint_changes_for_array_content_revision_and_schema() -> None:
    helper = load_canvas_helper()
    original = canvas_rows()
    array_changed = canvas_rows()
    array_changed[0]["canvas_data"] = {"nodes": [{"id": 2, "label": "B"}], "strokes": [{"points": [3, 2, 1]}]}
    content_changed = canvas_rows()
    content_changed[0]["canvas_data"] = {"nodes": [{"id": 3, "label": "B"}], "strokes": [{"points": [1, 2, 3]}]}
    revision_changed = canvas_rows()
    revision_changed[0]["revision"] = 8
    schema_changed = canvas_rows()
    schema_changed[0]["schema_version"] = "sketch-canvas-v2"
    original_fp = helper.canonical_canvas_fingerprint(original)

    assert helper.canonical_canvas_fingerprint(array_changed) != original_fp
    assert helper.canonical_canvas_fingerprint(content_changed) != original_fp
    assert helper.canonical_canvas_fingerprint(revision_changed) != original_fp
    assert helper.canonical_canvas_fingerprint(schema_changed) != original_fp


def test_restore_altered_canvas_data_fails_even_when_revision_is_unchanged() -> None:
    helper = load_canvas_helper()
    manifest_fingerprint = helper.canonical_canvas_fingerprint(canvas_rows())
    restored_rows = canvas_rows()
    restored_rows[0]["canvas_data"] = {"nodes": [{"id": 999, "label": "B"}], "strokes": [{"points": [1, 2, 3]}]}

    assert restored_rows[0]["revision"] == canvas_rows()[0]["revision"]
    assert len(restored_rows) == len(canvas_rows())
    assert helper.canonical_canvas_fingerprint(restored_rows) != manifest_fingerprint


def test_canvas_fingerprint_sorts_multiple_canvases_stably() -> None:
    helper = load_canvas_helper()
    first = [
        {**canvas_rows()[0], "canvas_key": "z"},
        {**canvas_rows()[0], "canvas_key": "a", "revision": 1},
    ]
    second = list(reversed(first))

    assert helper.canonical_canvas_fingerprint(first) == helper.canonical_canvas_fingerprint(second)


def test_canvas_fingerprint_rejects_malformed_canvas_json_string() -> None:
    helper = load_canvas_helper()
    with pytest.raises(json.JSONDecodeError):
        helper.canonical_canvas_fingerprint([{**canvas_rows()[0], "canvas_data": "{not-json"}])


def test_canvas_fingerprint_helper_rejects_authoritative_database_names() -> None:
    helper = load_canvas_helper()
    assert helper.require_temporary_database(BACKUP_TEMP_DB) == BACKUP_TEMP_DB
    assert helper.require_temporary_database(RESTORE_TEMP_DB) == RESTORE_TEMP_DB
    for name in [
        "personal_web_shared_dev",
        "personal_web_prod",
        "pw_bk_v_20260726T033000Z_0123456789abcdef0123456789abcprod",
        LEGACY_BACKUP_TEMP_DB,
        LEGACY_RESTORE_TEMP_DB,
        TRUNCATED_LEGACY_BACKUP_TEMP_DB,
        "pw_bk_v_20260726T033000Z_0123456789abcdef",
        "pw_bk_v_20260726T033000Z_0123456789ABCDEF0123456789ABCDEF",
        "pw_bk_v_20260726T033000Z_0123456789abcdef0123456789abcdeé",
    ]:
        with pytest.raises(ValueError):
            helper.require_temporary_database(name)


def test_canvas_fingerprint_is_not_raw_canvas_json_in_manifest_or_logs() -> None:
    create_script = read(SERVER_CREATE)
    restore_script = read(RESTORE_VERIFY)
    manifest = safe_manifest()

    assert "compute-shared-canvas-fingerprint.py" in create_script
    assert "compute-shared-canvas-fingerprint.py" in restore_script
    assert "canvas_data" not in json.dumps(manifest)
    assert "canvas_data" not in create_script.lower().split("collect_database_metadata_from_restored_dump", 1)[1]
    assert "print(fingerprint)" in read(CANVAS_FINGERPRINT)


def test_backup_and_restore_use_dump_restored_content_aware_canvas_fingerprint() -> None:
    create_script = read(SERVER_CREATE)
    restore_script = read(RESTORE_VERIFY)

    assert "compute_canvas_fingerprint_from_restored_dump \"$verify_db\"" in create_script
    assert create_script.index("B05_DATABASE_RESTORE") < create_script.index("B07_CANVAS_FINGERPRINT")
    assert "compute_canvas_fingerprint_from_restore \"$restore_db\"" in restore_script
    assert "canvas fingerprint mismatch" in restore_script


def test_partial_and_completed_backup_naming() -> None:
    assert validate_backup_id("20260726T033000Z-AbCd1234") == "20260726T033000Z-AbCd1234"
    assert validate_backup_id("20260726T033000Z-AbCd1234.partial", partial=True)

    with pytest.raises(SharedDevBackupContractError):
        validate_backup_id("latest")
    with pytest.raises(SharedDevBackupContractError):
        validate_backup_id("20260726T033000Z-AbCd1234.partial")


def test_success_marker_required_by_scripts() -> None:
    create_script = read(SERVER_CREATE)
    verify_script = read(SERVER_VERIFY)
    pull_script = read(PULL_SCRIPT)

    assert 'touch "$partial_dir/SUCCESS"' in create_script
    assert "SUCCESS marker is missing" in verify_script
    assert "SUCCESS" in pull_script


def test_atomic_finalization_contract_is_explicit() -> None:
    create_script = read(SERVER_CREATE)
    pull_script = read(PULL_SCRIPT)

    assert ".partial" in create_script
    assert "mv \"$partial_dir\" \"$completed_dir\"" in create_script
    assert ".partial" in pull_script
    assert "Move-Item -LiteralPath $partialDir -Destination $finalDir" in pull_script


def test_sha256sums_validation_contract() -> None:
    validate_sha256sums(
        "a" * 64 + "  manifest.json\n" + "b" * 64 + "  homepage-media.tar.gz\n",
        {"manifest.json": "a" * 64, "homepage-media.tar.gz": "b" * 64},
    )

    with pytest.raises(SharedDevBackupContractError):
        validate_sha256sums("a" * 64 + "  ../manifest.json\n", {"manifest.json": "a" * 64})


def test_exact_backup_file_contract() -> None:
    validate_exact_backup_file_set(
        {"personal_web_shared_dev.dump", "homepage-media.tar.gz", "manifest.json", "SHA256SUMS", "SUCCESS"}
    )

    with pytest.raises(SharedDevBackupContractError):
        validate_exact_backup_file_set({"manifest.json", "SUCCESS", "extra.txt"})


def test_manifest_contains_no_secret_fields() -> None:
    assert_manifest_is_safe(safe_manifest())

    manifest = safe_manifest()
    manifest["databasePassword"] = "do-not-store"
    with pytest.raises(SharedDevBackupContractError):
        assert_manifest_is_safe(manifest)


def test_manifest_hash_cross_verification_rejects_mismatches() -> None:
    manifest = safe_manifest()
    media_entries = [MediaInventoryEntry("images/a.png", 5, "c" * 64)]
    validate_manifest_cross_checks(
        manifest,
        backup_id="20260726T033000Z-AbCd1234",
        file_metadata={
            "personal_web_shared_dev.dump": BackupFileMetadata("personal_web_shared_dev.dump", 10, "a" * 64),
            "homepage-media.tar.gz": BackupFileMetadata("homepage-media.tar.gz", 20, "b" * 64),
        },
        sha256sums={
            "personal_web_shared_dev.dump": "a" * 64,
            "homepage-media.tar.gz": "b" * 64,
            "manifest.json": "d" * 64,
        },
        media_entries=media_entries,
    )
    bad_manifest = dict(manifest)
    bad_manifest["backupId"] = "20260727T033000Z-AbCd1234"
    with pytest.raises(SharedDevBackupContractError):
        validate_manifest_cross_checks(
            bad_manifest,
            backup_id="20260726T033000Z-AbCd1234",
            file_metadata={
                "personal_web_shared_dev.dump": BackupFileMetadata("personal_web_shared_dev.dump", 10, "a" * 64),
                "homepage-media.tar.gz": BackupFileMetadata("homepage-media.tar.gz", 20, "b" * 64),
            },
            sha256sums={
                "personal_web_shared_dev.dump": "a" * 64,
                "homepage-media.tar.gz": "b" * 64,
                "manifest.json": "d" * 64,
            },
            media_entries=media_entries,
        )


def test_server_retention_keeps_newest_14_successful_backups() -> None:
    ids = [f"202607{day:02d}T033000Z-AbCd1234" for day in range(1, 17)]
    delete = server_retention_delete_candidates(ids)

    assert len(delete) == 2
    assert SERVER_BACKUP_KEEP_COUNT == 14
    assert ids[-1] not in delete


def test_server_retention_never_deletes_unknown_directories() -> None:
    with pytest.raises(SharedDevBackupContractError):
        server_retention_delete_candidates(["unknown-directory"])


def test_remote_listing_requires_root_owned_exact_files() -> None:
    directory = RemoteBackupEntry("20260726T033000Z-AbCd1234", "dir", "root", "root", "700")
    entries = [
        RemoteBackupEntry("personal_web_shared_dev.dump", "file", "root", "root", "600"),
        RemoteBackupEntry("homepage-media.tar.gz", "file", "root", "root", "600"),
        RemoteBackupEntry("manifest.json", "file", "root", "root", "600"),
        RemoteBackupEntry("SHA256SUMS", "file", "root", "root", "600"),
        RemoteBackupEntry("SUCCESS", "file", "root", "root", "600"),
    ]
    validate_remote_backup_listing(entries, directory=directory)
    with pytest.raises(SharedDevBackupContractError):
        validate_remote_backup_listing([*entries, RemoteBackupEntry("extra", "file", "root", "root", "600")], directory=directory)
    with pytest.raises(SharedDevBackupContractError):
        validate_remote_backup_listing(
            [RemoteBackupEntry("SUCCESS", "file", "root", "root", "644"), *entries[:-1]],
            directory=directory,
        )
    for unsafe_entries in [
        [*entries, RemoteBackupEntry("extra-dir", "dir", "root", "root", "700")],
        [*entries, RemoteBackupEntry("extra-link", "file", "root", "root", "600", is_symlink=True)],
        [*entries, RemoteBackupEntry("extra-fifo", "fifo", "root", "root", "600")],
        [RemoteBackupEntry("SUCCESS", "file", "root", "root", "600", is_symlink=True), *entries[:-1]],
    ]:
        with pytest.raises(SharedDevBackupContractError):
            validate_remote_backup_listing(unsafe_entries, directory=directory)


def test_local_retention_keeps_newest_7_verified_backups() -> None:
    ids = [f"202607{day:02d}T100000Z-AbCd1234" for day in range(1, 10)]
    delete = local_retention_delete_candidates(ids)

    assert len(delete) == 2
    assert LOCAL_BACKUP_KEEP_COUNT == 7
    assert ids[-1] not in delete


def test_latest_backup_idempotency_is_supported() -> None:
    ids = ["20260725T100000Z-AbCd1234", "20260726T100000Z-AbCd1234"]

    assert newest_successful_backup(ids) == "20260726T100000Z-AbCd1234"
    assert "already_current" in read(PULL_SCRIPT)


def test_pull_script_uses_stdin_bash_transport_and_no_shell_wrappers() -> None:
    script = read(PULL_SCRIPT)

    assert "Invoke-TrustedBashScript" in script
    assert '"bash"' in script
    assert '"-s"' in script
    assert '"--"' in script
    assert "RedirectStandardInput = $true" in script
    assert "RedirectStandardOutput = $true" in script
    assert "RedirectStandardError = $true" in script
    assert "UseShellExecute = $false" in script
    assert "UTF8Encoding($false)" in script
    assert "Invoke-Expression" not in script
    assert "cmd /c" not in script.lower()
    assert "$RemoteCommand" not in script


def test_pull_script_stage_logging_contract_is_present() -> None:
    script = read(PULL_SCRIPT)

    for stage in [
        "P01_LOCAL_ROOT",
        "P02_SELECT_BACKUP",
        "P03_REMOTE_VALIDATE",
        "P04_PARTIAL_CREATE",
        "P05_DOWNLOAD",
        "P06_LOCAL_VERIFY",
        "P07_FINALIZE",
        "P08_RETENTION",
    ]:
        assert stage in script
    for category in ["ssh", "scp", "acl", "hash", "manifest", "pg_restore", "archive", "cleanup"]:
        assert f'"{category}"' in script


def test_remote_validation_accepts_empty_success_regular_file_stat_variant() -> None:
    script = read(PULL_SCRIPT)

    assert "test -f" in script
    assert "stat -c '%U:%G:%a' \"`$p\"" in script
    assert "root:root:600:regular file" not in script


def test_local_acl_contract_is_documented_in_pull_script() -> None:
    script = read(PULL_SCRIPT)

    assert "Ensure-ExactLocalBackupDacl" in script
    assert "acl_already_exact" in script
    assert "SetAccessRuleProtection($true, $false)" in script
    assert "S-1-5-18" in script
    assert "S-1-5-32-544" in script


def test_fake_ssh_receives_bash_script_on_stdin_not_argv(tmp_path: Path) -> None:
    fake_ssh = tmp_path / "fake-ssh.exe"
    argv_file = tmp_path / "argv.txt"
    stdin_file = tmp_path / "stdin.bin"
    stderr_file = tmp_path / "stderr.txt"
    script = f'''
$ErrorActionPreference = "Stop"
$source = @"
using System;
using System.IO;
using System.Text;
public class FakeSsh {{
  public static int Main(string[] args) {{
    File.WriteAllLines(Environment.GetEnvironmentVariable("FAKE_SSH_ARGV"), args, Encoding.UTF8);
    using (var input = Console.OpenStandardInput())
    using (var output = File.Create(Environment.GetEnvironmentVariable("FAKE_SSH_STDIN"))) {{
      input.CopyTo(output);
    }}
    var stderr = Environment.GetEnvironmentVariable("FAKE_SSH_STDERR_TEXT");
    if (!String.IsNullOrEmpty(stderr)) Console.Error.Write(stderr);
    int code = 0;
    Int32.TryParse(Environment.GetEnvironmentVariable("FAKE_SSH_EXIT"), out code);
    if (code == 0) Console.WriteLine("verified");
    return code;
  }}
}}
"@
Add-Type -TypeDefinition $source -OutputAssembly "{fake_ssh}" -OutputType ConsoleApplication
. "{PULL_SCRIPT}"
$script:SshExe = "{fake_ssh}"
$script:SshConfigPath = "{(tmp_path / 'ssh config').as_posix()}"
$script:KnownHostsPath = "{(tmp_path / 'known_hosts').as_posix()}"
$script:SshAlias = "personal-web-prod"
$env:FAKE_SSH_ARGV = "{argv_file}"
$env:FAKE_SSH_STDIN = "{stdin_file}"
$env:FAKE_SSH_EXIT = "0"
$env:FAKE_SSH_STDERR_TEXT = ""
$remote = @"
echo "quoted value"
cat <<'EOF'
password=secret
EOF
printf '%s\\n' "`$(date)"
diff -u - <(printf '%s\\n' a)
"@
$result = Invoke-TrustedBashScript -Script $remote
if (($result -join "|") -ne "verified") {{ throw "stdout_unexpected" }}
''';
    result = run_powershell(script, tmp_path)

    assert result.returncode == 0, result.stderr
    argv = argv_file.read_text(encoding="utf-8").splitlines()
    stdin_bytes = stdin_file.read_bytes()
    stdin_text = stdin_bytes.decode("utf-8")
    assert argv[-4:] == ["personal-web-prod", "bash", "-s", "--"]
    assert "password=secret" not in "\n".join(argv)
    assert stdin_bytes[:3] != b"\xef\xbb\xbf"
    assert b"\r" not in stdin_bytes
    assert stdin_bytes.endswith(b"\n")
    assert "cat <<'EOF'" in stdin_text
    assert '"quoted value"' in stdin_text
    assert "$(date)" in stdin_text
    assert "<(printf '%s\\n' a)" in stdin_text


def test_fake_ssh_failure_preserves_exit_and_sanitizes_stderr(tmp_path: Path) -> None:
    fake_ssh = tmp_path / "fake-ssh.exe"
    argv_file = tmp_path / "argv.txt"
    stdin_file = tmp_path / "stdin.bin"
    log_path = tmp_path / "pull.log"
    script = f'''
$ErrorActionPreference = "Stop"
$source = @"
using System;
using System.IO;
using System.Text;
public class FakeSsh {{
  public static int Main(string[] args) {{
    File.WriteAllLines(Environment.GetEnvironmentVariable("FAKE_SSH_ARGV"), args, Encoding.UTF8);
    File.WriteAllText(Environment.GetEnvironmentVariable("FAKE_SSH_STDIN"), Console.In.ReadToEnd(), Encoding.UTF8);
    Console.Error.Write("remote failed without secret");
    return 7;
  }}
}}
"@
Add-Type -TypeDefinition $source -OutputAssembly "{fake_ssh}" -OutputType ConsoleApplication
. "{PULL_SCRIPT}"
$script:SshExe = "{fake_ssh}"
$script:SshConfigPath = "{(tmp_path / 'ssh_config').as_posix()}"
$script:KnownHostsPath = "{(tmp_path / 'known_hosts').as_posix()}"
$script:SshAlias = "personal-web-prod"
$script:BackupLogPath = "{log_path}"
$env:FAKE_SSH_ARGV = "{argv_file}"
$env:FAKE_SSH_STDIN = "{stdin_file}"
try {{
  Invoke-TrustedBashScript -Script "echo password=secret"
  throw "expected_failure"
}} catch {{
  if ($_.Exception.Message -ne "ssh_failed_exit_7") {{ throw }}
}}
''';
    result = run_powershell(script, tmp_path)

    assert result.returncode == 0, result.stderr
    log_text = log_path.read_text(encoding="utf-8")
    assert "ssh_failed exit=7" in log_text
    assert "remote failed without secret" in log_text
    assert "password=secret" not in log_text


def test_real_non_elevated_acl_smoke_directory_file_and_noop(tmp_path: Path) -> None:
    root = tmp_path / "acl-root"
    backup_dir = root / "20260726T143303Z-AbCd1234"
    backup_file = backup_dir / "manifest.json"
    script = f'''
$ErrorActionPreference = "Stop"
. "{PULL_SCRIPT}"
$script:BackupLogPath = "{(tmp_path / 'acl.log')}"
$root = "{root}"
$dir = "{backup_dir}"
$file = "{backup_file}"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Set-Content -LiteralPath $file -Value "{{}}" -Encoding UTF8
$beforeOwner = (Get-Acl -LiteralPath $dir).Owner
Ensure-ExactLocalBackupDacl -Path $dir -ItemKind Directory -Root $root
Ensure-ExactLocalBackupDacl -Path $file -ItemKind File -Root $root
$dirWrite = (Get-Item -LiteralPath $dir).LastWriteTimeUtc
Ensure-ExactLocalBackupDacl -Path $dir -ItemKind Directory -Root $root
if ((Get-Item -LiteralPath $dir).LastWriteTimeUtc -ne $dirWrite) {{ throw "noop_touched_timestamp" }}
Assert-LocalBackupAcl -Path $dir -ItemKind Directory
Assert-LocalBackupAcl -Path $file -ItemKind File
if ((Get-Acl -LiteralPath $dir).Owner -ne $beforeOwner) {{ throw "owner_changed" }}
if (Test-CurrentProcessElevated) {{ throw "process_elevated" }}
if (Test-EnabledPrivilege "SeSecurityPrivilege") {{ throw "se_security_enabled" }}
Remove-Item -LiteralPath $root -Recurse -Force
if (Test-Path -LiteralPath $root) {{ throw "artifact_remained" }}
''';
    result = run_powershell(script, tmp_path)

    assert result.returncode == 0, result.stderr
    log_text = (tmp_path / "acl.log").read_text(encoding="utf-8")
    assert "acl_repaired kind=Directory" in log_text
    assert "acl_repaired kind=File" in log_text
    assert "acl_already_exact kind=Directory" in log_text


def test_partial_cleanup_removes_only_current_safe_partial(tmp_path: Path) -> None:
    root = tmp_path / "partials"
    partial = root / "20260726T143303Z-AbCd1234.partial-1234-AbCdEf123456"
    malformed = root / "bad.partial"
    script = f'''
$ErrorActionPreference = "Stop"
. "{PULL_SCRIPT}"
$script:BackupLogPath = "{(tmp_path / 'partial.log')}"
$root = "{root}"
$partial = "{partial}"
$malformed = "{malformed}"
New-Item -ItemType Directory -Force -Path $partial | Out-Null
New-Item -ItemType Directory -Force -Path $malformed | Out-Null
Ensure-ExactLocalBackupDacl -Path $partial -ItemKind Directory -Root $root
Remove-SafePartialDirectory -Root $root -PartialPath $partial
if (Test-Path -LiteralPath $partial) {{ throw "safe_partial_remained" }}
try {{
  Remove-SafePartialDirectory -Root $root -PartialPath $malformed
  throw "malformed_removed"
}} catch {{
  if ($_.Exception.Message -notmatch "local_partial_name_invalid") {{ throw }}
}}
if (-not (Test-Path -LiteralPath $malformed)) {{ throw "malformed_not_preserved" }}
Remove-Item -LiteralPath $root -Recurse -Force
''';
    result = run_powershell(script, tmp_path)

    assert result.returncode == 0, result.stderr


def test_local_verifier_accepts_archive_with_explicit_directories_via_canonical_helper(tmp_path: Path) -> None:
    backup_id = "20260726T143303Z-AbCd1234"
    root = tmp_path / "backups"
    backup_dir = root / backup_id
    backup_dir.mkdir(parents=True)
    dump = backup_dir / "personal_web_shared_dev.dump"
    archive = backup_dir / "homepage-media.tar.gz"
    manifest_path = backup_dir / "manifest.json"
    sums_path = backup_dir / "SHA256SUMS"
    (backup_dir / "SUCCESS").write_bytes(b"")
    dump.write_bytes(b"fake dump")
    entries = [MediaInventoryEntry("images/nested/a.txt", 5, hashlib.sha256(b"alpha").hexdigest())]
    write_tar(archive, [("dir", "images", b""), ("dir", "images/nested", b""), ("file", "images/nested/a.txt", b"alpha")])
    manifest = archive_manifest(archive, entries)
    manifest["backupId"] = backup_id
    manifest["databaseDump"] = {"filename": dump.name, "size": dump.stat().st_size, "sha256": hashlib.sha256(dump.read_bytes()).hexdigest()}
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    sums_path.write_text(
        "\n".join(
            [
                f"{hashlib.sha256(dump.read_bytes()).hexdigest()}  {dump.name}",
                f"{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}",
                f"{hashlib.sha256(manifest_path.read_bytes()).hexdigest()}  {manifest_path.name}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    fake_pg_restore = tmp_path / "pg_restore.exe"
    args_file = tmp_path / "pg-args.txt"
    script = f'''
$ErrorActionPreference = "Stop"
$source = @"
using System;
using System.IO;
public class FakePgRestore {{
  public static int Main(string[] args) {{
    if (args.Length == 1 && args[0] == "--version") {{ Console.WriteLine("pg_restore (PostgreSQL) 18.4"); return 0; }}
    File.WriteAllLines(Environment.GetEnvironmentVariable("PG_ARGS"), args);
    return 0;
  }}
}}
"@
Add-Type -TypeDefinition $source -OutputAssembly "{fake_pg_restore}" -OutputType ConsoleApplication
. "{PULL_SCRIPT}"
$script:repoRoot = "{REPO_ROOT}"
$script:LocalBackupRoot = "{root}"
$script:BackupLogPath = "{(tmp_path / 'verify.log')}"
$script:PgRestorePath = "{fake_pg_restore}"
$env:PG_ARGS = "{args_file}"
Ensure-ExactLocalBackupDacl -Path "{backup_dir}" -ItemKind Directory -Root "{root}"
foreach ($file in @("personal_web_shared_dev.dump","homepage-media.tar.gz","manifest.json","SHA256SUMS","SUCCESS")) {{
  Ensure-ExactLocalBackupDacl -Path (Join-Path "{backup_dir}" $file) -ItemKind File -Root "{root}"
}}
Verify-DownloadedBackup -Directory "{backup_dir}" -SelectedBackupId "{backup_id}" | Out-Null
if (Test-Path -LiteralPath (Join-Path "{backup_dir}" "archive-verify-*")) {{ throw "archive_verify_dir_remained" }}
''';
    result = run_powershell(script, tmp_path)

    assert result.returncode == 0, result.stderr
    assert args_file.read_text(encoding="utf-8").splitlines() == ["--list", str(dump)]
    assert "pg_restore_selected source=explicit" in (tmp_path / "verify.log").read_text(encoding="utf-8")


def test_local_verifier_reports_archive_category_on_canonical_helper_failure(tmp_path: Path) -> None:
    backup_id = "20260726T143303Z-AbCd1234"
    root = tmp_path / "backups"
    backup_dir = root / backup_id
    backup_dir.mkdir(parents=True)
    dump = backup_dir / "personal_web_shared_dev.dump"
    archive = backup_dir / "homepage-media.tar.gz"
    manifest_path = backup_dir / "manifest.json"
    sums_path = backup_dir / "SHA256SUMS"
    (backup_dir / "SUCCESS").write_bytes(b"")
    dump.write_bytes(b"fake dump")
    write_tar(archive, [("symlink", "images/link.txt", b"")])
    manifest = safe_manifest()
    manifest["backupId"] = backup_id
    manifest["databaseDump"] = {"filename": dump.name, "size": dump.stat().st_size, "sha256": hashlib.sha256(dump.read_bytes()).hexdigest()}
    manifest["mediaArchive"] = {"filename": archive.name, "size": archive.stat().st_size, "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()}
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    sums_path.write_text(
        f"{hashlib.sha256(dump.read_bytes()).hexdigest()}  {dump.name}\n"
        f"{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n"
        f"{hashlib.sha256(manifest_path.read_bytes()).hexdigest()}  {manifest_path.name}\n",
        encoding="utf-8",
    )
    fake_pg_restore = tmp_path / "pg_restore.exe"
    script = f'''
$ErrorActionPreference = "Stop"
$source = @"
using System;
public class FakePgRestore {{
  public static int Main(string[] args) {{
    if (args.Length == 1 && args[0] == "--version") {{ Console.WriteLine("pg_restore (PostgreSQL) 18.4"); return 0; }}
    return 0;
  }}
}}
"@
Add-Type -TypeDefinition $source -OutputAssembly "{fake_pg_restore}" -OutputType ConsoleApplication
. "{PULL_SCRIPT}"
$script:repoRoot = "{REPO_ROOT}"
$script:LocalBackupRoot = "{root}"
$script:BackupLogPath = "{(tmp_path / 'verify-fail.log')}"
$script:PgRestorePath = "{fake_pg_restore}"
Ensure-ExactLocalBackupDacl -Path "{backup_dir}" -ItemKind Directory -Root "{root}"
foreach ($file in @("personal_web_shared_dev.dump","homepage-media.tar.gz","manifest.json","SHA256SUMS","SUCCESS")) {{
  Ensure-ExactLocalBackupDacl -Path (Join-Path "{backup_dir}" $file) -ItemKind File -Root "{root}"
}}
try {{
  Invoke-PullStage P06_LOCAL_VERIFY local_verify {{ Verify-DownloadedBackup -Directory "{backup_dir}" -SelectedBackupId "{backup_id}" | Out-Null }}
  throw "expected_failure"
}} catch {{
  if ($_.Exception.Message -ne "media_archive_verification_failed") {{ throw }}
}}
if (Get-ChildItem -LiteralPath "{backup_dir}" -Directory -Filter "archive-verify-*") {{ throw "archive_verify_dir_remained" }}
''';
    result = run_powershell(script, tmp_path)

    assert result.returncode == 0, result.stderr
    log_text = (tmp_path / "verify-fail.log").read_text(encoding="utf-8")
    assert "stage_error id=P06_LOCAL_VERIFY name=local_verify category=archive" in log_text
    assert "unsafe tar member type: symlink" in log_text


def test_pg_restore_discovery_prefers_full_install_over_pgadmin_and_deduplicates(tmp_path: Path) -> None:
    full = tmp_path / "PostgreSQL" / "18" / "bin" / "pg_restore.exe"
    pgadmin = tmp_path / "PostgreSQL" / "18" / "pgAdmin 4" / "runtime" / "pg_restore.exe"
    full.parent.mkdir(parents=True)
    pgadmin.parent.mkdir(parents=True)
    source = '''
using System;
public class FakePgRestore {
  public static int Main(string[] args) {
    if (args.Length == 1 && args[0] == "--version") { Console.WriteLine("pg_restore (PostgreSQL) 18.4"); return 0; }
    return 0;
  }
}
'''
    script = f'''
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
{source}
"@ -OutputAssembly "{full}" -OutputType ConsoleApplication
Copy-Item -LiteralPath "{full}" -Destination "{pgadmin}"
. "{PULL_SCRIPT}"
$script:BackupLogPath = "{(tmp_path / 'pg.log')}"
$script:PgRestoreRegistryBaseDirectoriesForTest = @("{(tmp_path / 'PostgreSQL' / '18')}")
$script:PgRestoreServiceBaseDirectoriesForTest = @()
$script:PgRestoreStandardRootsForTest = @("{(tmp_path / 'PostgreSQL')}")
$selected = Get-PgRestorePath
if ($selected -ne "{full}") {{ throw "wrong_pg_restore_selected=$selected" }}
if ($env:PATH -ne $env:PATH) {{ throw "path_changed" }}
''';
    result = run_powershell(script, tmp_path)

    assert result.returncode == 0, result.stderr
    assert "source=registry" in (tmp_path / "pg.log").read_text(encoding="utf-8")


def test_pg_restore_discovery_prefers_highest_standard_full_install_and_preserves_path(tmp_path: Path) -> None:
    pg17 = tmp_path / "PostgreSQL" / "17" / "bin" / "pg_restore.exe"
    pg18 = tmp_path / "PostgreSQL" / "18" / "bin" / "pg_restore.exe"
    pg17.parent.mkdir(parents=True)
    pg18.parent.mkdir(parents=True)
    source = '''
using System;
public class FakePgRestore {
  public static int Main(string[] args) {
    string path = System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName;
    string version = path.Contains("\\\\18\\\\") ? "18.4" : "17.6";
    if (args.Length == 1 && args[0] == "--version") { Console.WriteLine("pg_restore (PostgreSQL) " + version); return 0; }
    return 0;
  }
}
'''
    script = f'''
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
{source}
"@ -OutputAssembly "{pg17}" -OutputType ConsoleApplication
Copy-Item -LiteralPath "{pg17}" -Destination "{pg18}"
. "{PULL_SCRIPT}"
$script:BackupLogPath = "{(tmp_path / 'standard.log')}"
$script:PgRestoreRegistryBaseDirectoriesForTest = @()
$script:PgRestoreServiceBaseDirectoriesForTest = @()
$script:PgRestoreStandardRootsForTest = @("{(tmp_path / 'PostgreSQL')}")
$before = $env:PATH
$selected = Get-PgRestorePath
if ($selected -ne "{pg18}") {{ throw "wrong_pg_restore_selected=$selected" }}
if ($env:PATH -cne $before) {{ throw "path_changed" }}
''';
    result = run_powershell(script, tmp_path)

    assert result.returncode == 0, result.stderr
    log_text = (tmp_path / "standard.log").read_text(encoding="utf-8")
    assert "source=program_files" in log_text
    assert "PostgreSQL) 18.4" in log_text


def test_pg_restore_discovery_rejects_invalid_candidates_and_reports_missing(tmp_path: Path) -> None:
    nonzero = tmp_path / "bad" / "bin" / "pg_restore.exe"
    wrong_output = tmp_path / "wrong" / "bin" / "pg_restore.exe"
    wrong_name = tmp_path / "wrong" / "bin" / "not_pg_restore.exe"
    nonzero.parent.mkdir(parents=True)
    wrong_output.parent.mkdir(parents=True)
    nonzero_source = '''
public class FakePgRestore {
  public static int Main(string[] args) { return 9; }
}
'''
    wrong_output_source = '''
using System;
public class FakePgRestore {
  public static int Main(string[] args) { Console.WriteLine("not postgres"); return 0; }
}
'''
    script = f'''
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
{nonzero_source}
"@ -OutputAssembly "{nonzero}" -OutputType ConsoleApplication
Add-Type -TypeDefinition @"
{wrong_output_source}
"@ -OutputAssembly "{wrong_output}" -OutputType ConsoleApplication
Copy-Item -LiteralPath "{wrong_output}" -Destination "{wrong_name}"
. "{PULL_SCRIPT}"
$script:BackupLogPath = "{(tmp_path / 'missing.log')}"
$script:PgRestoreRegistryBaseDirectoriesForTest = @("{(tmp_path / 'bad')}", "{(tmp_path / 'wrong')}")
$script:PgRestoreServiceBaseDirectoriesForTest = @()
$script:PgRestoreStandardRootsForTest = @()
if (Get-PgRestoreVersionInfo -Path "{wrong_name}") {{ throw "wrong_filename_accepted" }}
try {{
  Get-PgRestorePath | Out-Null
  throw "expected_missing"
}} catch {{
  if ($_.Exception.Message -ne "pg_restore_unavailable") {{ throw }}
}}
''';
    result = run_powershell(script, tmp_path)

    assert result.returncode == 0, result.stderr


def test_windows_sid_acl_contract_is_exact() -> None:
    current_user_sid = "S-1-5-21-1-2-3-1001"
    expected = expected_windows_backup_acl_sids(current_user_sid)

    validate_windows_acl_sids(expected, current_user_sid=current_user_sid, inheritance_enabled=False)
    with pytest.raises(SharedDevBackupContractError):
        validate_windows_acl_sids([*expected, "S-1-1-0"], current_user_sid=current_user_sid, inheritance_enabled=False)
    with pytest.raises(SharedDevBackupContractError):
        validate_windows_acl_sids(expected, current_user_sid=current_user_sid, inheritance_enabled=True)


def test_windows_acl_rejects_any_unexpected_allow_rights_or_sid() -> None:
    current_user_sid = "S-1-5-21-1-2-3-1001"
    expected_sids = expected_windows_backup_acl_sids(current_user_sid)
    valid_aces = [WindowsAclAce(sid=sid, rights="FullControl") for sid in expected_sids]
    validate_windows_backup_acl(
        valid_aces,
        current_user_sid=current_user_sid,
        inheritance_enabled=False,
        owner_sid=current_user_sid,
    )
    for rights in ["Read", "Modify", "WriteData", "ReadAndExecute"]:
        with pytest.raises(SharedDevBackupContractError):
            validate_windows_backup_acl(
                [*valid_aces, WindowsAclAce(sid="S-1-1-0", rights=rights)],
                current_user_sid=current_user_sid,
                inheritance_enabled=False,
                owner_sid=current_user_sid,
            )
        with pytest.raises(SharedDevBackupContractError):
            validate_windows_backup_acl(
                [WindowsAclAce(sid=current_user_sid, rights=rights), *valid_aces[1:]],
                current_user_sid=current_user_sid,
                inheritance_enabled=False,
                owner_sid=current_user_sid,
            )


def test_windows_backup_item_reparse_point_is_rejected() -> None:
    current_user_sid = "S-1-5-21-1-2-3-1001"
    aces = [WindowsAclAce(sid=sid, rights="FullControl") for sid in expected_windows_backup_acl_sids(current_user_sid)]

    with pytest.raises(SharedDevBackupContractError):
        validate_windows_backup_item_security(
            aces,
            current_user_sid=current_user_sid,
            inheritance_enabled=False,
            owner_sid=current_user_sid,
            is_reparse_point=True,
        )


def test_local_run_partial_name_is_unique_and_strict() -> None:
    assert validate_local_run_partial_name("20260726T100000Z-AbCd1234.partial-1234-AbCdEf123456")
    for unsafe in ["20260726T100000Z-AbCd1234.partial", "../x.partial-1-AbCdEf123456"]:
        with pytest.raises(SharedDevBackupContractError):
            validate_local_run_partial_name(unsafe)


def test_scheduled_task_uses_dynamic_repository_path() -> None:
    script = read(TASK_SCRIPT)

    assert "$PSScriptRoot" in script
    assert "pull-shared-dev-backup.ps1" in script
    assert "Personal_Web Shared Backup Pull" in script
    assert "C:\\Users\\maoyi" not in script


def test_scheduled_task_exact_ownership_match() -> None:
    task = {
        "name": "Personal_Web Shared Backup Pull",
        "execute": "powershell.exe",
        "arguments": '-NoProfile -ExecutionPolicy Bypass -File "D:\\repo\\scripts\\pull-shared-dev-backup.ps1"',
        "workingDirectory": "D:\\repo",
        "principal": "MACHINE\\user",
        "runLevel": "Limited",
        "logonType": "Interactive",
        "triggers": [
            {"type": "Daily", "enabled": True, "startBoundary": "2026-07-26T10:00:00", "daysInterval": 1},
            {"type": "Logon", "enabled": True, "userId": "MACHINE\\user"},
        ],
        "settings": {
            "startWhenAvailable": True,
            "wakeToRun": False,
            "disallowStartIfOnBatteries": True,
            "stopIfGoingOnBatteries": False,
            "multipleInstances": "IgnoreNew",
        },
        "wakeToRun": False,
    }
    assert scheduled_task_matches_repository(
        task,
        task_name="Personal_Web Shared Backup Pull",
        powershell_exe="powershell.exe",
        pull_script="D:\\repo\\scripts\\pull-shared-dev-backup.ps1",
        working_directory="D:\\repo",
        principal="MACHINE\\user",
    )
    for key, value in [
        ("workingDirectory", "D:\\other"),
        ("execute", "cmd.exe"),
        ("arguments", '-NoProfile -ExecutionPolicy Bypass -File "D:\\repo\\scripts\\pull-shared-dev-backup.ps1"; calc'),
        ("principal", "MACHINE\\other"),
        ("logonType", "S4U"),
        ("logonType", "Password"),
        ("logonType", "ServiceAccount"),
        ("logonType", None),
        ("settings", None),
        (
            "triggers",
            [
                {"type": "Daily", "enabled": True, "startBoundary": "2026-07-26T10:00:00", "daysInterval": 1},
                {"type": "Logon", "enabled": True, "userId": "MACHINE\\user"},
                {"type": "Boot", "enabled": True, "toString": "Daily 10:00 Logon"},
            ],
        ),
        (
            "triggers",
            [
                {"type": "Daily", "enabled": True, "startBoundary": "2026-07-26T09:00:00", "daysInterval": 1, "toString": "Daily 10:00"},
                {"type": "Logon", "enabled": True, "userId": "MACHINE\\user"},
            ],
        ),
        (
            "settings",
            {
                "startWhenAvailable": True,
                "wakeToRun": False,
                "disallowStartIfOnBatteries": False,
                "stopIfGoingOnBatteries": False,
                "multipleInstances": "IgnoreNew",
            },
        ),
    ]:
        mutated = dict(task)
        mutated[key] = value
        assert not scheduled_task_matches_repository(
            mutated,
            task_name="Personal_Web Shared Backup Pull",
            powershell_exe="powershell.exe",
            pull_script="D:\\repo\\scripts\\pull-shared-dev-backup.ps1",
            working_directory="D:\\repo",
            principal="MACHINE\\user",
        )


def test_scheduled_task_daily_boundary_is_exact_time() -> None:
    assert scheduled_daily_boundary_is_exact_10("2026-07-26T10:00:00")
    assert scheduled_daily_boundary_is_exact_10("2026-07-26T10:00:00+08:00")
    for value in ["2026-07-26T01:00:00", "2026-07-26T10:00:01", "2026-07-26T10:00:00.500", "not-a-date T10:00:00"]:
        assert not scheduled_daily_boundary_is_exact_10(value)


def test_scheduled_task_logon_type_and_settings_contracts() -> None:
    assert scheduled_task_logon_type_is_interactive("Interactive")
    assert scheduled_task_logon_type_is_interactive("InteractiveToken")
    assert scheduled_task_logon_type_is_interactive("3")
    for value in ["S4U", "Password", "ServiceAccount", None]:
        assert not scheduled_task_logon_type_is_interactive(value)
    assert scheduled_task_settings_match(
        {
            "startWhenAvailable": True,
            "wakeToRun": False,
            "disallowStartIfOnBatteries": True,
            "stopIfGoingOnBatteries": False,
            "multipleInstances": "IgnoreNew",
        }
    )
    assert not scheduled_task_settings_match(None)
    for key, value in [
        ("startWhenAvailable", False),
        ("wakeToRun", True),
        ("disallowStartIfOnBatteries", False),
        ("stopIfGoingOnBatteries", True),
        ("multipleInstances", "Parallel"),
    ]:
        settings = {
            "startWhenAvailable": True,
            "wakeToRun": False,
            "disallowStartIfOnBatteries": True,
            "stopIfGoingOnBatteries": False,
            "multipleInstances": "IgnoreNew",
        }
        settings[key] = value
        assert not scheduled_task_settings_match(settings)


def test_scheduled_task_script_uses_property_matching_update_and_readback() -> None:
    script = read(TASK_SCRIPT)

    assert ".ToString()" not in script
    assert "CimClass.CimClassName" in script
    assert "Set-ScheduledTask" in script
    assert "scheduled_task_readback_mismatch" in script
    assert "Test-InteractiveLogonType -Value $Task.Principal.LogonType" in script
    assert "Test-ExactDailyStartBoundary" in script
    assert "DisallowStartIfOnBatteries" in script
    assert "StopIfGoingOnBatteries" in script
    assert "MultipleInstances" in script


def test_restore_drill_uses_temporary_database_only() -> None:
    assert reject_authoritative_or_production_restore_target(RESTORE_TEMP_DB) == RESTORE_TEMP_DB

    with pytest.raises(SharedDevBackupContractError):
        reject_authoritative_or_production_restore_target("personal_web_shared_dev")
    with pytest.raises(SharedDevBackupContractError):
        reject_authoritative_or_production_restore_target("personal_web_prod")
    with pytest.raises(SharedDevBackupContractError):
        reject_authoritative_or_production_restore_target(LEGACY_RESTORE_TEMP_DB)
    assert "pw_rs_v_" in read(RESTORE_VERIFY)
    assert "personal_web_shared_dev_restore_verify_" not in read(RESTORE_VERIFY)


@pytest.mark.parametrize(
    ("readback", "expected_error"),
    [
        ("", "readback mismatch"),
        ("pw_rs_v_20260726T033000Z_0123456789abcdef0123456789abcde", "readback mismatch"),
        (f"{RESTORE_TEMP_DB}\\n{RESTORE_TEMP_DB}", "readback mismatch"),
    ],
)
def test_restore_createdb_exact_name_readback_rejects_unexpected_output(tmp_path: Path, readback: str, expected_error: str) -> None:
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{RESTORE_VERIFY.as_posix()}"
run_pg() {{ printf '%s\\n' "{readback}"; }}
verify_database_created_exactly {RESTORE_TEMP_DB}
''',
        tmp_path,
    )

    assert result.returncode != 0
    assert expected_error in result.stderr


def test_restore_createdb_exact_name_query_failure_fails(tmp_path: Path) -> None:
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{RESTORE_VERIFY.as_posix()}"
run_pg() {{ return 44; }}
verify_database_created_exactly {RESTORE_TEMP_DB}
''',
        tmp_path,
    )

    assert result.returncode != 0
    assert "exact-name query failed" in result.stderr


def test_restore_lock_contention_is_non_success_and_does_no_work(tmp_path: Path) -> None:
    calls = tmp_path / "calls.log"
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{RESTORE_VERIFY.as_posix()}"
LOCK_FILE="{(tmp_path / 'restore.lock').as_posix()}"
BACKUP_ROOT="{(tmp_path / 'backups').as_posix()}"
run_pg() {{ printf '%s\\n' "$*" >> "{calls.as_posix()}"; return 0; }}
flock() {{ [[ "${{LOCK_BUSY:-}}" == "1" ]] && return 1; return 0; }}
set +e
LOCK_BUSY=1
( main 20260726T033000Z-AbCd1234 ) > "{(tmp_path / 'second.out').as_posix()}" 2> "{(tmp_path / 'second.err').as_posix()}"
second="$?"
[[ -e "{calls.as_posix()}" ]] && printf 'second_calls=1\\n' || printf 'second_calls=0\\n'
rm -f "{calls.as_posix()}"
LOCK_BUSY=0
( main 20260726T033000Z-AbCd1234 ) > "{(tmp_path / 'later.out').as_posix()}" 2> "{(tmp_path / 'later.err').as_posix()}"
later="$?"
printf 'second=%s\\nlater=%s\\n' "$second" "$later"
find "{tmp_path.as_posix()}" -name 'personal-web-shared-media-restore-verify*' -o -name 'personal-web-shared-media-restore-inventory*' -o -name 'personal-web-shared-canvas-fingerprint*'
exit 0
''',
        tmp_path,
    )

    assert result.returncode == 0, result.stderr
    assert "second=75" in result.stdout
    assert "later=75" not in result.stdout
    assert "second_calls=0" in result.stdout
    assert "OK:" not in (tmp_path / "second.out").read_text(encoding="utf-8")
    assert "lock unavailable" in (tmp_path / "second.err").read_text(encoding="utf-8")
    assert "personal-web-shared-media-restore" not in result.stdout
    assert "personal-web-shared-canvas-fingerprint" not in result.stdout


def test_scripts_do_not_start_application_services_or_run_migrations() -> None:
    combined = "\n".join(read(path).lower() for path in [SERVER_CREATE, SERVER_VERIFY, RESTORE_VERIFY, PULL_SCRIPT, TASK_SCRIPT])

    forbidden = [
        "start-shared-dev",
        "start-local-dev",
        "uvicorn",
        "alembic upgrade",
        "seed_dev_auth_users",
        "systemctl restart",
        "systemctl reload",
    ]
    assert [item for item in forbidden if item in combined] == []


def test_server_scripts_use_postgres_os_identity_not_root_role() -> None:
    combined = "\n".join(read(path) for path in [SERVER_CREATE, SERVER_VERIFY, RESTORE_VERIFY])

    assert "runuser --user postgres --" in combined
    assert "--username=root" not in combined
    for command in ["psql", "pg_dump", "pg_restore", "createdb", "dropdb"]:
        assert not re.search(rf"^\s*{command}\b", combined, flags=re.MULTILINE)


def test_database_manifest_is_dump_derived() -> None:
    script = read(SERVER_CREATE)

    assert "create_verify_database_from_dump" in script
    assert "collect_database_metadata_from_restored_dump" in script
    assert "metadataSource\": \"restored_dump" in script
    assert "collect_source_database_properties" in script
    assert "--template=template0" in script
    assert "--lc-collate=\"$db_collate\"" in script
    assert "--lc-ctype=\"$db_ctype\"" in script


def test_media_archive_is_verified_by_extraction_before_manifest() -> None:
    script = read(SERVER_CREATE)

    assert "validate_and_extract_media_archive" in script
    assert "archive inventory mismatch" in read(ARCHIVE_VERIFIER)
    assert ARCHIVE_VERIFIER.exists()
    assert "--null --verbatim-files-from --no-recursion" in script
    assert "media-paths.nul" in script
    assert "media-paths.txt" not in script
    assert 'filter="data"' not in script
    assert script.index("validate_and_extract_media_archive") < script.index("write_manifest \"$manifest\"")


def test_restore_cleanup_failure_is_not_hidden() -> None:
    script = read(RESTORE_VERIFY)

    assert "cleanup_restore" in script
    assert "cleanup incomplete" in script
    assert "exit 1" in script
    assert "OK:" in script
    assert script.rindex("cleanup_restore 0") < script.rindex("OK:")


def test_restore_drill_compares_canvas_metadata_not_only_fingerprint() -> None:
    script = read(RESTORE_VERIFY)

    assert "json.loads(canvas_meta)" in script
    assert "canvas metadata mismatch" in script


def test_restore_drill_uses_canonical_manual_archive_extraction() -> None:
    script = read(RESTORE_VERIFY)

    assert "verify-shared-media-archive.py" in script
    assert " --write-inventory " in script
    assert "tar -x" not in script
    assert " tar " not in script


def test_remote_download_preflight_rejects_symlinks_and_unexpected_files() -> None:
    script = read(PULL_SCRIPT)

    assert "test ! -L" in script
    assert "stat -c '%U:%G:%a'" in script
    assert "Path(sys.argv[1])" in script
    assert "root.iterdir()" in script
    assert "backup file set mismatch" in script
    assert "verify-shared-dev-backup.sh" in script


def test_windows_archive_verification_checks_logical_bytes_and_fingerprint() -> None:
    script = read(PULL_SCRIPT)

    assert "Test-MediaArchiveContent" in script
    assert "verify-shared-media-archive.py" in script
    assert "--expect-manifest" in script
    assert "Invoke-CapturedProcess" in script
    assert "media_bytes_mismatch" not in script
    assert "media_fingerprint_mismatch" not in script
    assert "unsafe_tar_member" not in script
    assert "shutil.copyfileobj(source, output)" not in script
    assert 'filter="data"' not in script
    assert "import tarfile" not in script
    assert "PurePosixPath" not in script


def test_systemd_documentation_path_and_capabilities() -> None:
    service = read(REPO_ROOT / "deploy" / "backup" / "personal-web-shared-dev-backup.service")

    assert "docs/14_SHARED_REMOTE_BACKUP_AND_RECOVERY.md" in service
    assert "CAP_SETUID CAP_SETGID" in service
    assert "ConditionPathExists" not in service
    assert "ConditionPathIsDirectory" not in service
    assert "ReadOnlyPaths=/srv/personal-web/shared-dev/homepage" in service
    assert "ReadWritePaths=/var/backups/personal-web/shared-dev /run/lock" in service


def test_automated_tests_do_not_contact_real_server() -> None:
    test_source = read(Path(__file__))

    forbidden = ["para" + "miko", "psyco" + "pg", "ssh" + ".exe ", "scp" + ".exe "]
    assert [item for item in forbidden if item in test_source] == []


def test_backup_tests_do_not_invoke_local_or_shared_launchers() -> None:
    test_source = read(Path(__file__))

    forbidden = [
        "start-local-dev" + ".bat",
        "start-local-dev" + ".ps1",
        "start-shared-dev" + ".bat",
        "start-shared-dev" + ".ps1",
        "install-shared-shortcut" + ".bat",
        "install-local-shortcut" + ".bat",
    ]
    assert [item for item in forbidden if item in test_source] == []


def test_no_hardcoded_current_user_path_in_backup_sources() -> None:
    paths = [SERVER_CREATE, SERVER_VERIFY, RESTORE_VERIFY, ARCHIVE_VERIFIER, CANVAS_FINGERPRINT, PULL_SCRIPT, TASK_SCRIPT, DOC, Path(__file__)]
    offenders = [str(path.relative_to(REPO_ROOT)) for path in paths if re.search(r"C:[/\\\\]Users[/\\\\]maoyi", read(path))]

    assert offenders == []


def test_media_tree_fingerprint_is_deterministic() -> None:
    entries = [
        MediaInventoryEntry(path="videos/b.mp4", size=2, sha256="b" * 64),
        MediaInventoryEntry(path="images/a.png", size=1, sha256="a" * 64),
    ]

    assert media_tree_fingerprint(entries) == media_tree_fingerprint(reversed(entries))
