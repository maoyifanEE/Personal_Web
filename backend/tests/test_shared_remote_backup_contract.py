"""Isolated contract tests for shared-remote backup tooling."""

from __future__ import annotations

import json
from pathlib import Path
import re
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
    validate_windows_acl_sids,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
SERVER_CREATE = REPO_ROOT / "deploy" / "backup" / "create-shared-dev-backup.sh"
SERVER_VERIFY = REPO_ROOT / "deploy" / "backup" / "verify-shared-dev-backup.sh"
RESTORE_VERIFY = REPO_ROOT / "deploy" / "backup" / "verify-shared-dev-restore.sh"
PULL_SCRIPT = REPO_ROOT / "scripts" / "pull-shared-dev-backup.ps1"
TASK_SCRIPT = REPO_ROOT / "scripts" / "install-shared-dev-backup-pull-task.ps1"
DOC = REPO_ROOT / "docs" / "14_SHARED_REMOTE_BACKUP_AND_RECOVERY.md"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


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
        "dailyAt": "10:00",
        "atLogon": True,
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


def test_media_archive_is_verified_by_extraction_before_manifest() -> None:
    script = read(SERVER_CREATE)

    assert "validate_and_extract_media_archive" in script
    assert "archive inventory mismatch" in script
    assert "shutil.copyfileobj(source, output)" in script
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


def test_remote_download_preflight_rejects_symlinks_and_unexpected_files() -> None:
    script = read(PULL_SCRIPT)

    assert "test ! -L" in script
    assert "stat -c '%U:%G:%a:%F'" in script
    assert "backup file set" not in script.lower()
    assert "verify-shared-dev-backup.sh" in script


def test_windows_archive_verification_checks_logical_bytes_and_fingerprint() -> None:
    script = read(PULL_SCRIPT)

    assert "Test-MediaArchiveContent" in script
    assert "media_bytes_mismatch" in script
    assert "media_fingerprint_mismatch" in script
    assert "unsafe_tar_member" in script
    assert "shutil.copyfileobj(source, output)" in script
    assert 'filter="data"' not in script


def test_systemd_documentation_path_and_capabilities() -> None:
    service = read(REPO_ROOT / "deploy" / "backup" / "personal-web-shared-dev-backup.service")

    assert "docs/14_SHARED_REMOTE_BACKUP_AND_RECOVERY.md" in service
    assert "CAP_SETUID CAP_SETGID" in service
    assert "ConditionPathIsDirectory=/var/backups/personal-web/shared-dev" in service


def test_automated_tests_do_not_contact_real_server() -> None:
    test_source = read(Path(__file__))

    forbidden = [
        "subprocess" + ".run",
        "para" + "miko",
        "psyco" + "pg",
        "personal-web-" + "prod",
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
