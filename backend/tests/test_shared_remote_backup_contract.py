"""Isolated contract tests for shared-remote backup tooling."""

from __future__ import annotations

import json
from pathlib import Path
import re

import pytest

from app.core.shared_dev_backup import (
    BACKUP_SCHEMA_VERSION,
    LOCAL_BACKUP_KEEP_COUNT,
    SERVER_BACKUP_KEEP_COUNT,
    SHARED_DEV_DATABASE_NAME,
    SHARED_DEV_REMOTE_MEDIA_ROOT,
    SharedDevBackupContractError,
    MediaInventoryEntry,
    assert_manifest_is_safe,
    ensure_child_name_under_root,
    local_retention_delete_candidates,
    media_tree_fingerprint,
    newest_successful_backup,
    reject_authoritative_or_production_restore_target,
    require_shared_dev_database_name,
    require_shared_dev_media_root,
    server_retention_delete_candidates,
    validate_backup_id,
    validate_media_relative_path,
    validate_sha256sums,
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
        "verification": {"ok": True},
        "tableCounts": {"homepage_media": 62},
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


def test_media_archive_paths_reject_symlink_traversal_contract() -> None:
    assert validate_media_relative_path("images/a.png") == "images/a.png"

    for unsafe in ["/images/a.png", "../a.png", "images/../a.png", "C:/a.png", "images\\..\\a.png"]:
        with pytest.raises(SharedDevBackupContractError):
            validate_media_relative_path(unsafe)


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


def test_manifest_contains_no_secret_fields() -> None:
    assert_manifest_is_safe(safe_manifest())

    manifest = safe_manifest()
    manifest["databasePassword"] = "do-not-store"
    with pytest.raises(SharedDevBackupContractError):
        assert_manifest_is_safe(manifest)


def test_server_retention_keeps_newest_14_successful_backups() -> None:
    ids = [f"202607{day:02d}T033000Z-AbCd1234" for day in range(1, 17)]
    delete = server_retention_delete_candidates(ids)

    assert len(delete) == 2
    assert SERVER_BACKUP_KEEP_COUNT == 14
    assert ids[-1] not in delete


def test_server_retention_never_deletes_unknown_directories() -> None:
    with pytest.raises(SharedDevBackupContractError):
        server_retention_delete_candidates(["unknown-directory"])


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
    assert "SYSTEM" in script
    assert "Administrators" in script


def test_scheduled_task_uses_dynamic_repository_path() -> None:
    script = read(TASK_SCRIPT)

    assert "$PSScriptRoot" in script
    assert "pull-shared-dev-backup.ps1" in script
    assert "Personal_Web Shared Backup Pull" in script
    assert "C:\\Users\\maoyi" not in script


def test_restore_drill_uses_temporary_database_only() -> None:
    assert reject_authoritative_or_production_restore_target("personal_web_shared_dev_restore_verify_20260726T033000Z")

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
