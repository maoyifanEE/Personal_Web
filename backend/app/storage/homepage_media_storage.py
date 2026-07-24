"""Shared homepage media storage contracts and path helpers."""

from __future__ import annotations

from pathlib import Path, PurePosixPath
from typing import Protocol


class HomepageMediaStorage(Protocol):
    """Operations needed by the Homepage media service."""

    backend_name: str

    def build_logical_path(self, media_type: str, stored_filename: str) -> str: ...

    def store_validated_file(
        self,
        staging_path: Path,
        logical_path: str,
        *,
        expected_size: int,
        expected_sha256: str,
    ) -> None: ...

    def materialize(
        self,
        logical_path: str,
        *,
        expected_size: int | None = None,
        expected_sha256: str | None = None,
    ) -> Path: ...

    def remove_exact(self, logical_path: str) -> bool: ...

    def preflight(self) -> None: ...


def normalize_logical_root(root: str) -> str:
    """Return a normalized POSIX project-relative media root."""

    root = root.strip().replace("\\", "/").strip("/")
    if not root:
        raise ValueError("Homepage media logical root must not be empty")
    path = PurePosixPath(root)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("Homepage media logical root must be project-relative")
    return path.as_posix()


def validate_managed_logical_path(logical_root: str, logical_path: str) -> str:
    """Validate and return the suffix below the managed logical media root."""

    from app.storage.errors import UnsafeMediaPathError

    root = normalize_logical_root(logical_root)
    if not logical_path or "\\" in logical_path or ":" in logical_path:
        raise UnsafeMediaPathError("Unsafe media path syntax")
    logical_path = logical_path.strip().replace("\\", "/")
    path = PurePosixPath(logical_path)
    if path.is_absolute() or ".." in path.parts:
        raise UnsafeMediaPathError("Unsafe media path escape")
    if logical_path == root:
        raise UnsafeMediaPathError("Media path must include a file below the media root")
    prefix = f"{root}/"
    if not logical_path.startswith(prefix):
        raise UnsafeMediaPathError("Media path is outside the managed media root")
    suffix = logical_path[len(prefix) :]
    suffix_path = PurePosixPath(suffix)
    if not suffix or suffix_path.is_absolute() or ".." in suffix_path.parts:
        raise UnsafeMediaPathError("Unsafe media path suffix")
    return suffix_path.as_posix()
