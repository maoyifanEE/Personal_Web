"""Isolated contract tests for shared-remote backup tooling."""

from __future__ import annotations

import hashlib
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
    server_retention_delete_candidates,
    scheduled_task_matches_repository,
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
PULL_SCRIPT = REPO_ROOT / "scripts" / "pull-shared-dev-backup.ps1"
TASK_SCRIPT = REPO_ROOT / "scripts" / "install-shared-dev-backup-pull-task.ps1"
DOC = REPO_ROOT / "docs" / "14_SHARED_REMOTE_BACKUP_AND_RECOVERY.md"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


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
    assert require_backup_verify_database_name("personal_web_shared_dev_backup_verify_20260726T033000Z_AbCd1234")

    for unsafe in ["personal_web_shared_dev", "personal_web_prod", "personal_web_shared_dev_backup_verify_latest"]:
        with pytest.raises(SharedDevBackupContractError):
            require_backup_verify_database_name(unsafe)


def test_random_suffix_helper_is_pipefail_safe_under_real_bash(tmp_path: Path) -> None:
    script_path = SERVER_CREATE.as_posix()
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{script_path}"
for i in $(seq 1 100); do
  value="$(random_suffix)"
  [[ "$value" =~ ^[0-9a-f]{{16}}$ ]]
  printf '%s\\n' "$value"
done
''',
        tmp_path,
    )

    assert result.returncode == 0, result.stderr
    values = result.stdout.splitlines()
    assert len(values) == 100
    assert len(set(values)) > 1


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
      printf '%s\\n' '{{"databaseEncoding":"UTF8","databaseCollate":"zh-Hans-CN-x-icu","databaseCtype":"zh-Hans-CN-x-icu"}}'
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
create_verify_database_from_dump personal_web_shared_dev_backup_verify_20260726T033000Z_0123456789abcdef "{dump.as_posix()}" "{source_props.as_posix()}" "{verify_props.as_posix()}"
''',
        tmp_path,
    )

    assert result.returncode == 0, result.stderr
    call_text = calls.read_text(encoding="utf-8")
    assert "createdb --template=template0 --encoding=UTF8 --lc-collate=zh-Hans-CN-x-icu --lc-ctype=zh-Hans-CN-x-icu" in call_text
    assert json.loads(source_props.read_text(encoding="utf-8")) == json.loads(verify_props.read_text(encoding="utf-8"))


def test_database_exists_distinguishes_query_failure_and_remaining_db(tmp_path: Path) -> None:
    result = run_bash(
        f'''
set -Eeuo pipefail
source "{SERVER_CREATE.as_posix()}"
run_pg() {{ return 44; }}
set +e
database_exists personal_web_shared_dev_backup_verify_20260726T033000Z_0123456789abcdef
printf 'query=%s\\n' "$?"
run_pg() {{ printf '1\\n'; }}
database_exists personal_web_shared_dev_backup_verify_20260726T033000Z_0123456789abcdef
printf 'remaining=%s\\n' "$?"
run_pg() {{ printf ''; }}
database_exists personal_web_shared_dev_backup_verify_20260726T033000Z_0123456789abcdef
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


def test_local_acl_contract_is_documented_in_pull_script() -> None:
    script = read(PULL_SCRIPT)

    assert "SetAccessRuleProtection($true, $false)" in script
    assert "S-1-5-18" in script
    assert "S-1-5-32-544" in script


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
        "triggers": [
            {"type": "Daily", "enabled": True, "startBoundary": "2026-07-26T10:00:00", "daysInterval": 1},
            {"type": "Logon", "enabled": True, "userId": "MACHINE\\user"},
        ],
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


def test_scheduled_task_script_uses_property_matching_update_and_readback() -> None:
    script = read(TASK_SCRIPT)

    assert ".ToString()" not in script
    assert "CimClass.CimClassName" in script
    assert "Set-ScheduledTask" in script
    assert "scheduled_task_readback_mismatch" in script


def test_restore_drill_uses_temporary_database_only() -> None:
    assert reject_authoritative_or_production_restore_target("personal_web_shared_dev_restore_verify_20260726T033000Z_AbCd1234")

    with pytest.raises(SharedDevBackupContractError):
        reject_authoritative_or_production_restore_target("personal_web_shared_dev")
    with pytest.raises(SharedDevBackupContractError):
        reject_authoritative_or_production_restore_target("personal_web_prod")
    assert "personal_web_shared_dev_restore_verify_" in read(RESTORE_VERIFY)


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
    assert "stat -c '%U:%G:%a:%F'" in script
    assert "Path(sys.argv[1])" in script
    assert "root.iterdir()" in script
    assert "backup file set mismatch" in script
    assert "verify-shared-dev-backup.sh" in script


def test_windows_archive_verification_checks_logical_bytes_and_fingerprint() -> None:
    script = read(PULL_SCRIPT)

    assert "Test-MediaArchiveContent" in script
    assert "media_bytes_mismatch" in script
    assert "media_fingerprint_mismatch" in script
    assert "unsafe_tar_member" in script
    assert "shutil.copyfileobj(source, output)" in script
    assert 'filter="data"' not in script
    assert "duplicate_tar_path" in script
    assert "file_directory_conflict" in script


def test_systemd_documentation_path_and_capabilities() -> None:
    service = read(REPO_ROOT / "deploy" / "backup" / "personal-web-shared-dev-backup.service")

    assert "docs/14_SHARED_REMOTE_BACKUP_AND_RECOVERY.md" in service
    assert "CAP_SETUID CAP_SETGID" in service
    assert "ConditionPathIsDirectory=/var/backups/personal-web/shared-dev" in service


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
    paths = [SERVER_CREATE, SERVER_VERIFY, RESTORE_VERIFY, PULL_SCRIPT, TASK_SCRIPT, DOC, Path(__file__)]
    offenders = [str(path.relative_to(REPO_ROOT)) for path in paths if re.search(r"C:[/\\\\]Users[/\\\\]maoyi", read(path))]

    assert offenders == []


def test_media_tree_fingerprint_is_deterministic() -> None:
    entries = [
        MediaInventoryEntry(path="videos/b.mp4", size=2, sha256="b" * 64),
        MediaInventoryEntry(path="images/a.png", size=1, sha256="a" * 64),
    ]

    assert media_tree_fingerprint(entries) == media_tree_fingerprint(reversed(entries))
