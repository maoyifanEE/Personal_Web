"""Isolated tests for shared remote profile foundations."""

from __future__ import annotations

import hashlib
from pathlib import Path
import types

import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.core.shared_dev_secrets import SharedDevSecretError, parse_shared_dev_secret_text
from app.models.homepage_canvas import HomepageCanvasState
from app.models.homepage_item import HomepageItem
from app.models.homepage_media import HomepageMedia
from app.services.homepage_canvas_service import contains_data_url
from app.services.homepage_media_service import get_public_media_file
from app.storage.errors import (
    MediaObjectCollisionError,
    MediaObjectMissingError,
    StorageIntegrityError,
    StorageUnavailableError,
    UnsafeMediaPathError,
)
from app.storage.filesystem_homepage_media_storage import FilesystemHomepageMediaStorage
from app.storage.sftp_homepage_media_storage import SftpHomepageMediaStorage


def make_settings(**overrides) -> Settings:
    values = {
        "DATABASE_URL": "sqlite+pysqlite:///:memory:",
        "APP_ENV": "test",
        "SESSION_SECRET": "test-session-secret",
        "HOMEPAGE_MEDIA_ROOT": "data/uploads/homepage",
    }
    values.update(overrides)
    return Settings(**values)


def test_default_profile_is_local_filesystem():
    settings = make_settings()

    assert settings.personal_web_data_profile == "local"
    assert settings.homepage_media_storage_backend == "filesystem"


def test_shared_remote_requires_development_and_sftp():
    with pytest.raises(ValueError, match="allowed only in development"):
        make_settings(PERSONAL_WEB_DATA_PROFILE="shared_remote", HOMEPAGE_MEDIA_STORAGE_BACKEND="sftp")

    with pytest.raises(ValueError, match="requires HOMEPAGE_MEDIA_STORAGE_BACKEND=sftp"):
        make_settings(APP_ENV="development", PERSONAL_WEB_DATA_PROFILE="shared_remote")


def test_shared_remote_requires_complete_sftp_settings_without_secret_values():
    with pytest.raises(ValueError) as exc:
        make_settings(
            APP_ENV="development",
            PERSONAL_WEB_DATA_PROFILE="shared_remote",
            HOMEPAGE_MEDIA_STORAGE_BACKEND="sftp",
            SHARED_DEV_MEDIA_SSH_ALIAS="shared-media",
            SHARED_DEV_MEDIA_SSH_CONFIG_PATH="C:/safe/config",
        )

    message = str(exc.value)
    assert "SHARED_DEV_MEDIA_REMOTE_ROOT" in message
    assert "shared-media" not in message


def test_production_rejects_shared_settings():
    with pytest.raises(ValueError, match="allowed only in development"):
        make_settings(
            APP_ENV="production",
            COOKIE_SECURE=True,
            ALLOW_DEV_TOOLS=False,
            SESSION_SECRET="production-test-secret",
            PERSONAL_WEB_DATA_PROFILE="shared_remote",
            HOMEPAGE_MEDIA_STORAGE_BACKEND="sftp",
        )


def test_project_relative_root_rules_remain_unchanged():
    with pytest.raises(ValueError):
        make_settings(HOMEPAGE_MEDIA_ROOT="../outside")
    with pytest.raises(ValueError):
        make_settings(HOMEPAGE_MEDIA_ROOT="C:/outside")


def test_secret_parser_allowlist_and_preserves_values():
    parsed = parse_shared_dev_secret_text(
        """
        # synthetic fixture
        SHARED_DEV_DB_PASSWORD=a value with spaces and # symbols
        SHARED_DEV_DB_NAME=personal_web_shared_dev
        """,
    )

    assert parsed["SHARED_DEV_DB_PASSWORD"] == "a value with spaces and # symbols"


@pytest.mark.parametrize(
    "text",
    [
        "SHARED_DEV_DB_NAME=one\nSHARED_DEV_DB_NAME=two\n",
        "UNKNOWN=value\n",
        "not-a-valid-line\n",
    ],
)
def test_secret_parser_rejects_bad_contract_without_values(text):
    with pytest.raises(SharedDevSecretError) as exc:
        parse_shared_dev_secret_text(text)

    assert "value" not in str(exc.value)
    assert "two" not in str(exc.value)


def test_filesystem_backend_store_materialize_and_collision(tmp_path, monkeypatch):
    monkeypatch.setattr("app.core.diagnostics.PROJECT_ROOT", tmp_path)
    monkeypatch.setattr("app.storage.filesystem_homepage_media_storage.PROJECT_ROOT", tmp_path)
    settings = make_settings(HOMEPAGE_MEDIA_ROOT="data/uploads/homepage")
    storage = FilesystemHomepageMediaStorage(settings)
    staging = tmp_path / ".runtime" / "stage.bin"
    staging.parent.mkdir(parents=True)
    payload = b"\x89PNG\r\n\x1a\npayload"
    staging.write_bytes(payload)
    checksum = hashlib.sha256(payload).hexdigest()
    logical_path = storage.build_logical_path("image", "abc.png")

    storage.store_validated_file(staging, logical_path, expected_size=len(payload), expected_sha256=checksum)
    materialized = storage.materialize(logical_path, expected_size=len(payload), expected_sha256=checksum)

    assert materialized == tmp_path / "data/uploads/homepage/images/abc.png"
    assert materialized.read_bytes() == payload
    replacement = tmp_path / "replacement.bin"
    replacement.write_bytes(payload)
    with pytest.raises(MediaObjectCollisionError):
        storage.store_validated_file(replacement, logical_path, expected_size=len(payload), expected_sha256=checksum)
    assert storage.remove_exact(logical_path) is True
    with pytest.raises(MediaObjectMissingError):
        storage.materialize(logical_path)


@pytest.mark.parametrize(
    "logical_path",
    [
        "data/uploads/homepage\\images\\x.png",
        "C:/data/uploads/homepage/images/x.png",
        "/data/uploads/homepage/images/x.png",
        "data/uploads/homepage/images/../x.png",
        "data/uploads/homepage2/images/x.png",
    ],
)
def test_sftp_mapping_rejects_unsafe_paths(logical_path):
    storage = SftpHomepageMediaStorage(
        make_settings(
            APP_ENV="development",
            PERSONAL_WEB_DATA_PROFILE="shared_remote",
            HOMEPAGE_MEDIA_STORAGE_BACKEND="sftp",
            SHARED_DEV_MEDIA_SSH_ALIAS="media",
            SHARED_DEV_MEDIA_SSH_CONFIG_PATH="C:/synthetic/config",
            SHARED_DEV_MEDIA_REMOTE_ROOT="/srv/personal-web/shared-dev/homepage",
        )
    )

    with pytest.raises(UnsafeMediaPathError):
        storage.remote_path_for(logical_path)


class FakeRemoteFile:
    def __init__(self, data: bytes):
        self.data = data
        self.offset = 0

    def read(self, size: int = -1) -> bytes:
        if size < 0:
            size = len(self.data) - self.offset
        chunk = self.data[self.offset : self.offset + size]
        self.offset += len(chunk)
        return chunk

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False


class FakeSftp:
    def __init__(self, files: dict[str, bytes] | None = None, *, fail_connect: bool = False):
        if fail_connect:
            raise OSError("synthetic failure")
        self.files = files if files is not None else {}
        self.closed = False
        self.renames: list[tuple[str, str]] = []

    def stat(self, path: str):
        if path not in self.files and not any(item.startswith(path.rstrip("/") + "/") for item in self.files):
            raise FileNotFoundError(path)
        data = self.files.get(path, b"")
        return types.SimpleNamespace(st_size=len(data))

    def mkdir(self, path: str):
        self.files.setdefault(path, b"")

    def put(self, local_path: str, remote_path: str):
        self.files[remote_path] = Path(local_path).read_bytes()

    def open(self, path: str, mode: str):
        return FakeRemoteFile(self.files[path])

    def rename(self, source: str, target: str):
        self.renames.append((source, target))
        self.files[target] = self.files.pop(source)

    def get(self, remote_path: str, local_path: str):
        Path(local_path).write_bytes(self.files[remote_path])

    def remove(self, path: str):
        if path not in self.files:
            raise FileNotFoundError(path)
        del self.files[path]

    def close(self):
        self.closed = True


def make_sftp_storage(tmp_path, monkeypatch, fake):
    monkeypatch.setattr("app.core.diagnostics.PROJECT_ROOT", tmp_path)
    monkeypatch.setattr("app.storage.sftp_homepage_media_storage.PROJECT_ROOT", tmp_path)
    return SftpHomepageMediaStorage(
        make_settings(
            APP_ENV="development",
            PERSONAL_WEB_DATA_PROFILE="shared_remote",
            HOMEPAGE_MEDIA_STORAGE_BACKEND="sftp",
            SHARED_DEV_MEDIA_SSH_ALIAS="media",
            SHARED_DEV_MEDIA_SSH_CONFIG_PATH="C:/synthetic/config",
            SHARED_DEV_MEDIA_REMOTE_ROOT="/remote/root",
            SHARED_DEV_MEDIA_CACHE_MAX_MB=1,
            SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS=1,
        ),
        client_factory=lambda: fake,
    )


def test_fake_sftp_upload_verify_atomic_rename_and_close(tmp_path, monkeypatch):
    fake = FakeSftp({"/remote": b"", "/remote/root": b"", "/remote/root/images": b""})
    storage = make_sftp_storage(tmp_path, monkeypatch, fake)
    payload = b"remote payload"
    staging = tmp_path / "stage.bin"
    staging.write_bytes(payload)
    checksum = hashlib.sha256(payload).hexdigest()
    logical_path = "data/uploads/homepage/images/a.png"

    storage.store_validated_file(staging, logical_path, expected_size=len(payload), expected_sha256=checksum)

    assert fake.files["/remote/root/images/a.png"] == payload
    assert fake.renames
    assert fake.closed is True


def test_fake_sftp_materialize_cache_hit_and_corrupt_refetch(tmp_path, monkeypatch):
    payload = b"cache payload"
    checksum = hashlib.sha256(payload).hexdigest()
    fake = FakeSftp({"/remote/root/images/a.png": payload})
    storage = make_sftp_storage(tmp_path, monkeypatch, fake)

    first = storage.materialize("data/uploads/homepage/images/a.png", expected_size=len(payload), expected_sha256=checksum)
    first.write_bytes(b"corrupt")
    second = storage.materialize("data/uploads/homepage/images/a.png", expected_size=len(payload), expected_sha256=checksum)

    assert second.read_bytes() == payload


def test_fake_sftp_unavailable_and_hash_mismatch(tmp_path, monkeypatch):
    fake = FakeSftp({"/remote/root/images/a.png": b"payload"})
    storage = make_sftp_storage(tmp_path, monkeypatch, fake)

    with pytest.raises(StorageIntegrityError):
        storage.materialize("data/uploads/homepage/images/a.png", expected_size=7, expected_sha256="0" * 64)

    broken = make_sftp_storage(tmp_path, monkeypatch, FakeSftp({}))
    broken._client_factory = lambda: (_ for _ in ()).throw(OSError("synthetic"))
    with pytest.raises(StorageUnavailableError):
        broken.materialize("data/uploads/homepage/images/a.png")


def test_existing_media_public_rules_and_data_url_unchanged(client, db_session):
    media = HomepageMedia(
        media_type="image",
        original_filename="example.png",
        stored_filename="example.png",
        relative_path="data/uploads/homepage/images/missing.png",
        mime_type="image/png",
        file_size_bytes=1,
        checksum_sha256=None,
        is_enabled=True,
    )
    db_session.add(media)
    db_session.flush()
    db_session.add(
        HomepageCanvasState(
            canvas_key="default",
            schema_version="sketch-canvas-v1",
            canvas_data={"stickers": [{"mediaId": media.id}]},
            revision=1,
        )
    )
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        get_public_media_file(db_session, media.id, make_settings())
    assert exc.value.status_code == 404
    media.is_enabled = False
    db_session.commit()
    with pytest.raises(HTTPException) as disabled:
        get_public_media_file(db_session, media.id, make_settings())
    assert disabled.value.status_code == 404
    assert contains_data_url({"image": "data:image/png;base64,abc"}) is True


def test_visible_homepage_item_reference_preserved(db_session):
    media = HomepageMedia(
        media_type="image",
        original_filename="example.png",
        stored_filename="example.png",
        relative_path="data/uploads/homepage/images/missing.png",
        mime_type="image/png",
        file_size_bytes=1,
        checksum_sha256=None,
        is_enabled=True,
    )
    db_session.add(media)
    db_session.flush()
    db_session.add(
        HomepageItem(
            title="Visible",
            media_id=media.id,
            display_type="image",
            sort_order=0,
            is_visible=True,
        )
    )
    db_session.commit()

    from app.services.homepage_media_service import is_media_referenced_by_visible_homepage_item

    assert is_media_referenced_by_visible_homepage_item(db_session, media.id) is True
