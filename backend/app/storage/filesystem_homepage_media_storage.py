"""Filesystem homepage media storage backend."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path
import posixpath

from app.core.config import Settings
from app.core.diagnostics import PROJECT_ROOT, write_jsonl_event
from app.storage.errors import MediaObjectCollisionError, MediaObjectMissingError, StorageIntegrityError
from app.storage.homepage_media_storage import validate_managed_logical_path

logger = logging.getLogger(__name__)


class FilesystemHomepageMediaStorage:
    """Authoritative project-local storage for the local data profile."""

    backend_name = "filesystem"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.logical_root = settings.homepage_media_root
        self.root_path = settings.homepage_media_root_path

    def build_logical_path(self, media_type: str, stored_filename: str) -> str:
        subdir = "images" if media_type == "image" else "videos"
        return posixpath.join(self.logical_root, subdir, stored_filename).replace("\\", "/")

    def _path_for(self, logical_path: str) -> Path:
        validate_managed_logical_path(self.logical_root, logical_path)
        candidate = (PROJECT_ROOT / logical_path).resolve()
        root = self.root_path.resolve()
        if not candidate.is_relative_to(root):
            from app.storage.errors import UnsafeMediaPathError

            raise UnsafeMediaPathError("Media path is outside the filesystem media root")
        return candidate

    def store_validated_file(
        self,
        staging_path: Path,
        logical_path: str,
        *,
        expected_size: int,
        expected_sha256: str,
    ) -> None:
        destination = self._path_for(logical_path)
        if destination.exists():
            raise MediaObjectCollisionError("Media destination already exists")
        destination.parent.mkdir(parents=True, exist_ok=True)
        actual_size = staging_path.stat().st_size
        actual_sha256 = hashlib.sha256(staging_path.read_bytes()).hexdigest()
        if actual_size != expected_size or actual_sha256 != expected_sha256:
            raise StorageIntegrityError("Staged media failed integrity validation")
        staging_path.replace(destination)
        write_jsonl_event(
            "backend",
            "homepage.media.storage.filesystem.store_completed",
            {"path": logical_path, "bytes": expected_size, "checksumPrefix": expected_sha256[:12]},
        )

    def materialize(
        self,
        logical_path: str,
        *,
        expected_size: int | None = None,
        expected_sha256: str | None = None,
    ) -> Path:
        path = self._path_for(logical_path)
        if not path.is_file():
            raise MediaObjectMissingError("Media object is missing")
        if expected_size is not None and path.stat().st_size != expected_size:
            raise StorageIntegrityError("Filesystem media size mismatch")
        if expected_sha256:
            actual_sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
            if actual_sha256 != expected_sha256:
                raise StorageIntegrityError("Filesystem media checksum mismatch")
        return path

    def remove_exact(self, logical_path: str) -> bool:
        path = self._path_for(logical_path)
        if path.exists() and path.is_file():
            path.unlink()
            write_jsonl_event("backend", "homepage.media.storage.filesystem.rollback_removed", {"path": logical_path})
            return True
        return False

    def preflight(self) -> None:
        self.root_path.mkdir(parents=True, exist_ok=True)
        write_jsonl_event("backend", "homepage.media.storage.filesystem.preflight_ok", {})
