"""Shared-remote backup safety contracts.

This module contains pure validation helpers used by tests and backup tooling
documentation. It deliberately has no SSH, SFTP, PostgreSQL, or filesystem side
effects outside caller-provided paths.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import tarfile
from typing import Any, Iterable


BACKUP_SCHEMA_VERSION = 1
SHARED_DEV_DATABASE_NAME = "personal_web_shared_dev"
SHARED_DEV_DATABASE_USER = "personal_web_shared_dev_app"
SHARED_DEV_REMOTE_MEDIA_ROOT = "/srv/personal-web/shared-dev/homepage"
SERVER_BACKUP_ROOT = "/var/backups/personal-web/shared-dev"
LOCAL_BACKUP_KEEP_COUNT = 7
SERVER_BACKUP_KEEP_COUNT = 14
SERVER_PARTIAL_RETENTION_DAYS = 3
REQUIRED_BACKUP_FILES = frozenset(
    {
        "personal_web_shared_dev.dump",
        "homepage-media.tar.gz",
        "manifest.json",
        "SHA256SUMS",
        "SUCCESS",
    }
)
HASHED_BACKUP_FILES = frozenset({"personal_web_shared_dev.dump", "homepage-media.tar.gz", "manifest.json"})
COMPLETED_BACKUP_ID_RE = re.compile(r"^\d{8}T\d{6}Z-[A-Za-z0-9]{8,32}$")
PARTIAL_BACKUP_ID_RE = re.compile(r"^\d{8}T\d{6}Z-[A-Za-z0-9]{8,32}\.partial$")
LOCAL_RUN_PARTIAL_RE = re.compile(r"^\d{8}T\d{6}Z-[A-Za-z0-9]{8,32}\.partial-\d+-[A-Za-z0-9]{8,32}$")
RESTORE_DATABASE_RE = re.compile(r"^personal_web_shared_dev_restore_verify_\d{8}T\d{6}Z_[A-Za-z0-9]{8,32}$")
BACKUP_VERIFY_DATABASE_RE = re.compile(r"^personal_web_shared_dev_backup_verify_\d{8}T\d{6}Z_[A-Za-z0-9]{8,32}$")
WINDOWS_LOCAL_SYSTEM_SID = "S-1-5-18"
WINDOWS_BUILTIN_ADMINISTRATORS_SID = "S-1-5-32-544"

SECRET_FIELD_MARKERS = (
    "password",
    "token",
    "secret",
    "private_key",
    "private-key",
    "session",
    "cookie",
    "database_url",
    "db_url",
    "connection_string",
    "authorized_keys",
    "canvas_json",
    "visitor_message",
    "audit_payload",
)


class SharedDevBackupContractError(ValueError):
    """Raised when a backup contract value is unsafe."""


@dataclass(frozen=True)
class MediaInventoryEntry:
    """Stable media inventory entry."""

    path: str
    size: int
    sha256: str


@dataclass(frozen=True)
class BackupFileMetadata:
    """File metadata used for manifest and SHA cross-checks."""

    filename: str
    size: int
    sha256: str


@dataclass(frozen=True)
class RemoteBackupEntry:
    """Sanitized remote lstat metadata for one server backup entry."""

    name: str
    kind: str
    owner: str
    group: str
    mode: str
    is_symlink: bool = False


def require_shared_dev_database_name(name: str) -> str:
    """Accept only the shared-development database."""

    if name != SHARED_DEV_DATABASE_NAME:
        raise SharedDevBackupContractError("Only personal_web_shared_dev may be backed up")
    if "prod" in name.lower():
        raise SharedDevBackupContractError("Production databases are not backup sources")
    return name


def reject_authoritative_or_production_restore_target(name: str) -> str:
    """Accept only temporary restore-drill database names."""

    if name in {SHARED_DEV_DATABASE_NAME, "personal_web_prod"} or "prod" in name.lower():
        raise SharedDevBackupContractError("Restore verification must use a temporary database")
    if not RESTORE_DATABASE_RE.fullmatch(name):
        raise SharedDevBackupContractError("Restore verification database name is not temporary")
    return name


def require_backup_verify_database_name(name: str) -> str:
    """Accept only backup-internal temporary verification databases."""

    if name in {SHARED_DEV_DATABASE_NAME, "personal_web_prod"} or "prod" in name.lower():
        raise SharedDevBackupContractError("Backup verification must use a temporary database")
    if not BACKUP_VERIFY_DATABASE_RE.fullmatch(name):
        raise SharedDevBackupContractError("Backup verification database name is not temporary")
    return name


def require_shared_dev_media_root(root: str) -> str:
    normalized = normalize_posix_absolute(root)
    if normalized != SHARED_DEV_REMOTE_MEDIA_ROOT:
        raise SharedDevBackupContractError("Only the shared-development media root may be backed up")
    return normalized


def normalize_posix_absolute(path: str) -> str:
    value = path.strip().replace("\\", "/")
    if not value.startswith("/"):
        raise SharedDevBackupContractError("Path must be absolute")
    parts = [part for part in value.split("/") if part]
    if any(part == ".." for part in parts):
        raise SharedDevBackupContractError("Path traversal is not allowed")
    return "/" + "/".join(parts)


def validate_backup_id(name: str, *, partial: bool = False) -> str:
    pattern = PARTIAL_BACKUP_ID_RE if partial else COMPLETED_BACKUP_ID_RE
    if not pattern.fullmatch(name):
        raise SharedDevBackupContractError("Backup id does not match the strict naming contract")
    return name


def validate_local_run_partial_name(name: str) -> str:
    if not LOCAL_RUN_PARTIAL_RE.fullmatch(name):
        raise SharedDevBackupContractError("Local partial name does not match the strict workflow contract")
    return name


def ensure_child_name_under_root(root: Path, child_name: str) -> Path:
    """Build a direct child path without allowing traversal."""

    if Path(child_name).name != child_name:
        raise SharedDevBackupContractError("Backup child must be a direct child name")
    validate_backup_id(child_name, partial=child_name.endswith(".partial"))
    root_resolved = root.resolve()
    child = (root_resolved / child_name).resolve()
    if child.parent != root_resolved:
        raise SharedDevBackupContractError("Backup path escaped the configured root")
    return child


def validate_media_relative_path(path: str) -> str:
    value = path.strip().replace("\\", "/")
    if not value or value.startswith("/") or value.startswith("~"):
        raise SharedDevBackupContractError("Media archive paths must be relative")
    pure = PurePosixPath(value)
    if any(part in {"", ".", ".."} for part in pure.parts):
        raise SharedDevBackupContractError("Media archive path traversal is not allowed")
    if ":" in value:
        raise SharedDevBackupContractError("Media archive path must not contain drive syntax")
    return pure.as_posix()


def validate_tar_member(name: str, *, member_type: str) -> str:
    """Validate a tar member before extraction.

    `member_type` is a portable type label such as file, dir, symlink, hardlink,
    device, fifo, or unknown.
    """

    normalized = validate_media_relative_path(name.rstrip("/")) if name.rstrip("/") else ""
    if member_type == "dir":
        if not normalized:
            raise SharedDevBackupContractError("Archive root directory entry is not required")
        return normalized
    if member_type != "file":
        raise SharedDevBackupContractError("Media archive contains a non-regular member")
    return normalized


def validate_tarinfo_members(members: Iterable[tarfile.TarInfo]) -> list[str]:
    safe_files: list[str] = []
    for member in members:
        if member.isfile():
            safe_files.append(validate_tar_member(member.name, member_type="file"))
            continue
        if member.isdir():
            validate_tar_member(member.name, member_type="dir")
            continue
        raise SharedDevBackupContractError("Media archive contains a non-regular member")
    return safe_files


def media_tree_fingerprint(entries: Iterable[MediaInventoryEntry]) -> str:
    normalized = [
        {"path": validate_media_relative_path(entry.path), "size": int(entry.size), "sha256": entry.sha256.lower()}
        for entry in entries
    ]
    normalized.sort(key=lambda item: item["path"])
    return hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def validate_sha256sums(text: str, expected_files: dict[str, str]) -> None:
    """Validate a SHA256SUMS file against expected file digests."""

    seen: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = re.fullmatch(r"([0-9a-fA-F]{64})  ([A-Za-z0-9_.-]+)", line)
        if not match:
            raise SharedDevBackupContractError("SHA256SUMS contains an invalid line")
        digest, filename = match.groups()
        if filename not in HASHED_BACKUP_FILES:
            raise SharedDevBackupContractError("SHA256SUMS contains an unexpected file")
        if filename in seen:
            raise SharedDevBackupContractError("SHA256SUMS contains duplicate files")
        seen[filename] = digest.lower()
    if set(seen) != set(expected_files):
        raise SharedDevBackupContractError("SHA256SUMS file set mismatch")
    for filename, digest in expected_files.items():
        if seen[filename] != digest.lower():
            raise SharedDevBackupContractError("SHA256SUMS digest mismatch")


def validate_exact_backup_file_set(names: Iterable[str]) -> None:
    if set(names) != REQUIRED_BACKUP_FILES:
        raise SharedDevBackupContractError("Backup directory file set mismatch")


def validate_remote_backup_listing(entries: Iterable[RemoteBackupEntry], *, directory: RemoteBackupEntry) -> None:
    if directory.kind != "dir" or directory.is_symlink or directory.owner != "root" or directory.group != "root" or directory.mode != "700":
        raise SharedDevBackupContractError("Remote backup directory metadata is unsafe")
    entry_map = {entry.name: entry for entry in entries}
    validate_exact_backup_file_set(entry_map)
    for name in REQUIRED_BACKUP_FILES:
        entry = entry_map[name]
        if entry.kind != "file" or entry.is_symlink:
            raise SharedDevBackupContractError("Remote backup file metadata is unsafe")
        if entry.owner != "root" or entry.group != "root" or entry.mode != "600":
            raise SharedDevBackupContractError("Remote backup file permissions are unsafe")


def assert_manifest_is_safe(manifest: dict[str, Any]) -> None:
    """Reject secret-like fields anywhere in manifest metadata."""

    if manifest.get("schemaVersion") != BACKUP_SCHEMA_VERSION:
        raise SharedDevBackupContractError("Unsupported backup manifest schema")
    require_shared_dev_database_name(str(manifest.get("databaseName", "")))
    require_shared_dev_media_root(str(manifest.get("sourceMediaRoot", SHARED_DEV_REMOTE_MEDIA_ROOT)))
    if not manifest.get("verification", {}).get("ok"):
        raise SharedDevBackupContractError("Backup manifest is not verified")
    for key_path, value in walk_manifest(manifest):
        lowered = key_path.lower()
        if any(marker in lowered for marker in SECRET_FIELD_MARKERS):
            raise SharedDevBackupContractError("Backup manifest contains unsafe metadata")
        if isinstance(value, str) and ("postgresql://" in value or "postgresql+psycopg://" in value):
            raise SharedDevBackupContractError("Backup manifest contains a database URL")


def validate_manifest_cross_checks(
    manifest: dict[str, Any],
    *,
    backup_id: str,
    file_metadata: dict[str, BackupFileMetadata],
    sha256sums: dict[str, str],
    media_entries: Iterable[MediaInventoryEntry],
) -> None:
    """Cross-check manifest, payload file metadata, SHA256SUMS, and media inventory."""

    assert_manifest_is_safe(manifest)
    if manifest.get("backupId") != validate_backup_id(backup_id):
        raise SharedDevBackupContractError("Manifest backup id mismatch")
    if set(sha256sums) != HASHED_BACKUP_FILES:
        raise SharedDevBackupContractError("SHA256SUMS file set mismatch")
    if manifest.get("alembicRevision") != "20260712_0006":
        raise SharedDevBackupContractError("Manifest Alembic revision mismatch")
    if not manifest.get("canvasFingerprint"):
        raise SharedDevBackupContractError("Manifest canvas fingerprint is missing")
    if "tableCounts" not in manifest or not isinstance(manifest["tableCounts"], dict):
        raise SharedDevBackupContractError("Manifest table counts are missing")
    validate_sha256sums("\n".join(f"{digest}  {name}" for name, digest in sha256sums.items()), sha256sums)
    for key, manifest_key in [
        ("personal_web_shared_dev.dump", "databaseDump"),
        ("homepage-media.tar.gz", "mediaArchive"),
    ]:
        meta = file_metadata[key]
        manifest_meta = manifest.get(manifest_key) or {}
        if manifest_meta.get("filename") != key:
            raise SharedDevBackupContractError("Manifest payload filename mismatch")
        if int(manifest_meta.get("size", -1)) != int(meta.size):
            raise SharedDevBackupContractError("Manifest payload size mismatch")
        if str(manifest_meta.get("sha256", "")).lower() != meta.sha256.lower():
            raise SharedDevBackupContractError("Manifest payload hash mismatch")
        if sha256sums.get(key, "").lower() != meta.sha256.lower():
            raise SharedDevBackupContractError("SHA256SUMS payload hash mismatch")
    entries = list(media_entries)
    if int(manifest.get("sourceMediaRegularFileCount", -1)) != len(entries):
        raise SharedDevBackupContractError("Manifest media count mismatch")
    if int(manifest.get("sourceMediaLogicalBytes", -1)) != sum(int(entry.size) for entry in entries):
        raise SharedDevBackupContractError("Manifest media logical bytes mismatch")
    if manifest.get("sourceMediaTreeFingerprint") != media_tree_fingerprint(entries):
        raise SharedDevBackupContractError("Manifest media fingerprint mismatch")


def walk_manifest(value: Any, prefix: str = "") -> Iterable[tuple[str, Any]]:
    if isinstance(value, dict):
        for key, child in value.items():
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            yield from walk_manifest(child, child_prefix)
        return
    if isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk_manifest(child, f"{prefix}[{index}]")
        return
    yield prefix, value


def retention_delete_candidates(successful_backup_ids: list[str], *, keep: int) -> list[str]:
    """Return older successful backup ids eligible for deletion."""

    if keep < 1:
        raise SharedDevBackupContractError("Retention must keep at least one backup")
    for backup_id in successful_backup_ids:
        validate_backup_id(backup_id)
    ordered = sorted(successful_backup_ids)
    if len(ordered) <= keep:
        return []
    return ordered[: len(ordered) - keep]


def expected_windows_backup_acl_sids(current_user_sid: str) -> frozenset[str]:
    if not current_user_sid.startswith("S-"):
        raise SharedDevBackupContractError("Current user SID is invalid")
    return frozenset({current_user_sid, WINDOWS_LOCAL_SYSTEM_SID, WINDOWS_BUILTIN_ADMINISTRATORS_SID})


def validate_windows_acl_sids(actual_sids: Iterable[str], *, current_user_sid: str, inheritance_enabled: bool) -> None:
    if inheritance_enabled:
        raise SharedDevBackupContractError("Backup ACL inheritance must be disabled")
    if frozenset(actual_sids) != expected_windows_backup_acl_sids(current_user_sid):
        raise SharedDevBackupContractError("Backup ACL entries do not match the SID contract")


def scheduled_task_matches_repository(
    task: dict[str, Any],
    *,
    task_name: str,
    powershell_exe: str,
    pull_script: str,
    working_directory: str,
    principal: str,
) -> bool:
    """Return true only for an exact scheduled task ownership match."""

    expected_args = f'-NoProfile -ExecutionPolicy Bypass -File "{pull_script}"'
    return (
        task.get("name") == task_name
        and str(task.get("execute", "")).lower() == powershell_exe.lower()
        and task.get("arguments") == expected_args
        and task.get("workingDirectory") == working_directory
        and task.get("principal") == principal
        and task.get("runLevel") == "Limited"
        and task.get("dailyAt") == "10:00"
        and task.get("atLogon") is True
        and task.get("wakeToRun") is False
    )


def local_retention_delete_candidates(successful_backup_ids: list[str]) -> list[str]:
    return retention_delete_candidates(successful_backup_ids, keep=LOCAL_BACKUP_KEEP_COUNT)


def server_retention_delete_candidates(successful_backup_ids: list[str]) -> list[str]:
    return retention_delete_candidates(successful_backup_ids, keep=SERVER_BACKUP_KEEP_COUNT)


def newest_successful_backup(successful_backup_ids: list[str]) -> str | None:
    for backup_id in successful_backup_ids:
        validate_backup_id(backup_id)
    return max(successful_backup_ids) if successful_backup_ids else None
