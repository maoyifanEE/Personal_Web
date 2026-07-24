"""Factory for homepage media storage backends."""

from __future__ import annotations

from app.core.config import Settings
from app.core.diagnostics import write_jsonl_event
from app.storage.filesystem_homepage_media_storage import FilesystemHomepageMediaStorage
from app.storage.homepage_media_storage import HomepageMediaStorage
from app.storage.sftp_homepage_media_storage import SftpHomepageMediaStorage


def build_homepage_media_storage(settings: Settings) -> HomepageMediaStorage:
    """Create the configured homepage media storage backend."""

    write_jsonl_event(
        "backend",
        "homepage.media.storage.selected",
        {
            "dataProfile": settings.personal_web_data_profile,
            "storageBackend": settings.homepage_media_storage_backend,
        },
    )
    if settings.homepage_media_storage_backend == "filesystem":
        return FilesystemHomepageMediaStorage(settings)
    if settings.homepage_media_storage_backend == "sftp":
        return SftpHomepageMediaStorage(settings)
    raise RuntimeError("Unsupported homepage media storage backend")
