#!/usr/bin/env python3
"""Canonical shared-development media archive verifier.

The script validates every tar member before writing any file, manually writes
only regular files into an already empty verification directory, computes the
canonical inventory/fingerprint, compares optional expectations, and always
verifies extraction cleanup before returning success.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import tarfile
from typing import Any


def fail(message: str) -> None:
    raise SystemExit(message)


def normalize_member_name(raw_name: str) -> str:
    if "\\" in raw_name:
        fail("unsafe tar member path: backslash")
    if raw_name.startswith("/"):
        fail("unsafe tar member path: absolute")
    value = raw_name.strip("/")
    if not value:
        fail("unsafe tar member path: empty")
    if ":" in value:
        fail("unsafe tar member path: drive")
    pure = PurePosixPath(value)
    if any(part in {"", ".", ".."} for part in pure.parts):
        fail("unsafe tar member path: traversal")
    return pure.as_posix()


def member_kind(member: tarfile.TarInfo) -> str:
    if member.isfile():
        return "file"
    if member.isdir():
        return "dir"
    if member.issym():
        return "symlink"
    if member.islnk():
        return "hardlink"
    if member.ischr() or member.isblk():
        return "device"
    if member.isfifo():
        return "fifo"
    return "unknown"


def validate_members(members: list[tarfile.TarInfo]) -> list[tuple[tarfile.TarInfo, str]]:
    files: list[tuple[tarfile.TarInfo, str]] = []
    file_paths: set[str] = set()
    dir_paths: set[str] = set()
    for member in members:
        normalized = normalize_member_name(member.name)
        kind = member_kind(member)
        if kind == "dir":
            if normalized in file_paths:
                fail("file/directory path conflict")
            dir_paths.add(normalized)
            continue
        if kind != "file":
            fail(f"unsafe tar member type: {kind}")
        if normalized in file_paths:
            fail("duplicate tar file path")
        if normalized in dir_paths:
            fail("file/directory path conflict")
        parts = PurePosixPath(normalized).parts
        for index in range(1, len(parts)):
            if "/".join(parts[:index]) in file_paths:
                fail("file/directory path conflict")
        file_paths.add(normalized)
        files.append((member, normalized))
    for directory in dir_paths:
        parts = PurePosixPath(directory).parts
        for index in range(1, len(parts) + 1):
            if "/".join(parts[:index]) in file_paths:
                fail("file/directory path conflict")
    return files


def ensure_empty_protected_directory(path: Path) -> None:
    if path.is_symlink() or not path.is_dir():
        fail("verification extraction directory is missing or unsafe")
    if any(path.iterdir()):
        fail("verification extraction directory is not empty")
    if os.name != "nt":
        mode = stat.S_IMODE(path.stat().st_mode)
        if mode & 0o077:
            fail("verification extraction directory is not protected")


def fingerprint(entries: list[dict[str, Any]]) -> str:
    ordered = sorted(entries, key=lambda item: item["path"])
    return hashlib.sha256(json.dumps(ordered, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def read_expected_inventory(path: Path) -> list[dict[str, Any]]:
    entries = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return sorted(entries, key=lambda item: item["path"])


def compare_manifest(manifest_path: Path, archive_path: Path, entries: list[dict[str, Any]]) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    media_meta = manifest.get("mediaArchive") or {}
    if media_meta.get("filename") != archive_path.name:
        fail("manifest archive filename mismatch")
    if int(media_meta.get("size", -1)) != archive_path.stat().st_size:
        fail("manifest archive size mismatch")
    if str(media_meta.get("sha256", "")).lower() != digest:
        fail("manifest archive hash mismatch")
    if int(manifest.get("sourceMediaRegularFileCount", -1)) != len(entries):
        fail("manifest media count mismatch")
    if int(manifest.get("sourceMediaLogicalBytes", -1)) != sum(int(item["size"]) for item in entries):
        fail("manifest media logical bytes mismatch")
    if manifest.get("sourceMediaTreeFingerprint") != fingerprint(entries):
        fail("manifest media fingerprint mismatch")


def verify_archive(args: argparse.Namespace) -> list[dict[str, Any]]:
    archive_path = Path(args.archive)
    extract_dir = Path(args.extract_dir)
    ensure_empty_protected_directory(extract_dir)
    entries: list[dict[str, Any]] = []
    try:
        with tarfile.open(archive_path, "r:gz") as tar:
            files = validate_members(tar.getmembers())
            for member, normalized in files:
                target = (extract_dir / normalized).resolve()
                extract_root = extract_dir.resolve()
                if extract_root not in [target.parent, *target.parents]:
                    fail("tar extraction escaped verification root")
                target.parent.mkdir(parents=True, exist_ok=True)
                source = tar.extractfile(member)
                if source is None:
                    fail("tar regular member could not be read")
                digest = hashlib.sha256()
                total = 0
                with source, target.open("wb") as output:
                    while True:
                        chunk = source.read(1024 * 1024)
                        if not chunk:
                            break
                        output.write(chunk)
                        digest.update(chunk)
                        total += len(chunk)
                if member.size != total:
                    fail("tar regular member changed during read")
                entries.append({"path": normalized, "size": total, "sha256": digest.hexdigest()})
        entries.sort(key=lambda item: item["path"])
        if args.expect_inventory:
            if entries != read_expected_inventory(Path(args.expect_inventory)):
                fail("archive inventory mismatch")
        if args.expect_manifest:
            compare_manifest(Path(args.expect_manifest), archive_path, entries)
        if args.write_inventory:
            Path(args.write_inventory).write_text(
                "".join(json.dumps(item, sort_keys=True) + "\n" for item in entries),
                encoding="utf-8",
            )
        if os.environ.get("PERSONAL_WEB_ARCHIVE_VERIFY_SIMULATE_CLEANUP_FAILURE") != "1":
            shutil.rmtree(extract_dir)
    finally:
        if extract_dir.exists() and os.environ.get("PERSONAL_WEB_ARCHIVE_VERIFY_SIMULATE_CLEANUP_FAILURE") != "1":
            shutil.rmtree(extract_dir, ignore_errors=True)
    if extract_dir.exists():
        fail("archive verification cleanup incomplete")
    return entries


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--extract-dir", required=True)
    parser.add_argument("--expect-inventory")
    parser.add_argument("--expect-manifest")
    parser.add_argument("--write-inventory")
    args = parser.parse_args()
    try:
        entries = verify_archive(args)
    except SystemExit as exc:
        print(f"[personal-web media archive verify] ERROR: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"[personal-web media archive verify] ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    print(
        "[personal-web media archive verify] OK: files={0} bytes={1} fingerprint={2}".format(
            len(entries),
            sum(int(item["size"]) for item in entries),
            fingerprint(entries),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
