"""Isolated tests for shared remote profile foundations."""

from __future__ import annotations

import hashlib
import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import stat
import types

import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.core.shared_dev_secrets import (
    SharedDevSecretError,
    allowed_shared_dev_secret_keys,
    load_shared_dev_secret_contract,
    parse_shared_dev_secret_text,
    required_shared_dev_secret_keys,
)
from app.scripts.check_shared_dev_preflight import SharedDevPreflightError, run_database_preflight
from app.scripts.check_shared_dev_sftp_preflight import SharedDevSftpPreflightError, run_sftp_preflight
from app.models.homepage_canvas import HomepageCanvasState
from app.models.homepage_item import HomepageItem
from app.models.homepage_media import HomepageMedia
from app.services.homepage_canvas_service import contains_data_url
from app.services.homepage_media_service import get_public_media_file
from app.services.homepage_media_service import create_homepage_media
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


def safe_shared_overrides() -> dict[str, object]:
    return {
        "APP_ENV": "development",
        "DATABASE_URL": "postgresql+psycopg://personal_web_shared_dev_app:secret@127.0.0.1:65432/personal_web_shared_dev",
        "PERSONAL_WEB_DATA_PROFILE": "shared_remote",
        "HOMEPAGE_MEDIA_STORAGE_BACKEND": "sftp",
        "SHARED_DEV_MEDIA_SSH_ALIAS": "personal-web-shared-media",
        "SHARED_DEV_MEDIA_SSH_CONFIG_PATH": "C:/synthetic/config",
        "SHARED_DEV_MEDIA_REMOTE_ROOT": "/srv/personal-web/shared-dev/homepage",
    }


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
            DATABASE_URL=safe_shared_overrides()["DATABASE_URL"],
            PERSONAL_WEB_DATA_PROFILE="shared_remote",
            HOMEPAGE_MEDIA_STORAGE_BACKEND="sftp",
            SHARED_DEV_MEDIA_SSH_ALIAS="shared-media",
            SHARED_DEV_MEDIA_SSH_CONFIG_PATH="C:/safe/config",
        )

    message = str(exc.value)
    assert "SHARED_DEV_MEDIA_REMOTE_ROOT" in message
    assert "shared-media" not in message


def test_shared_remote_accepts_exact_safe_loopback_url():
    settings = make_settings(**safe_shared_overrides())

    assert settings.uses_shared_remote_data is True


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+psycopg://personal_web_shared_dev_app:secret@localhost:65432/personal_web_shared_dev",
        "postgresql+psycopg://personal_web_shared_dev_app:secret@example.test:65432/personal_web_shared_dev",
        "postgresql+psycopg://wrong:secret@127.0.0.1:65432/personal_web_shared_dev",
        "postgresql+psycopg://personal_web_shared_dev_app@127.0.0.1:65432/personal_web_shared_dev",
        "postgresql://personal_web_shared_dev_app:secret@127.0.0.1:65432/personal_web_shared_dev",
        "postgresql+psycopg://personal_web_shared_dev_app:secret@127.0.0.1/personal_web_shared_dev",
        "postgresql+psycopg://personal_web_shared_dev_app:secret@127.0.0.1:65432/personal_web_prod",
    ],
)
def test_shared_remote_rejects_unsafe_database_urls_without_leaking_components(url):
    with pytest.raises(ValueError) as exc:
        make_settings(**{**safe_shared_overrides(), "DATABASE_URL": url})

    message = str(exc.value)
    assert "secret" not in message
    assert "example.test" not in message
    assert "localhost" not in message


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


def test_secret_contract_required_and_allowed_sets_are_canonical():
    contract = load_shared_dev_secret_contract()

    assert "SHARED_DEV_DB_SSH_CONFIG_PATH" in required_shared_dev_secret_keys(contract)
    assert "SHARED_DEV_REMOTE_MEDIA_ROOT" in required_shared_dev_secret_keys(contract)
    assert "SHARED_DEV_MEDIA_REMOTE_ROOT" in allowed_shared_dev_secret_keys(contract)


def test_secret_parser_requires_all_and_handles_deprecated_root_alias():
    text = "\n".join(
        [
            "SHARED_DEV_SSH_ALIAS=shared-db",
            "SHARED_DEV_DB_SSH_CONFIG_PATH=C:/synthetic/db_config",
            "SHARED_DEV_DB_LOCAL_HOST=127.0.0.1",
            "SHARED_DEV_DB_LOCAL_PORT=65432",
            "SHARED_DEV_DB_REMOTE_HOST=127.0.0.1",
            "SHARED_DEV_DB_REMOTE_PORT=5432",
            "SHARED_DEV_DB_NAME=personal_web_shared_dev",
            "SHARED_DEV_DB_USER=personal_web_shared_dev_app",
            "SHARED_DEV_DB_PASSWORD=do-not-print",
            "SHARED_DEV_MEDIA_REMOTE_ROOT=/srv/personal-web/shared-dev/homepage",
            "SHARED_DEV_MEDIA_SSH_ALIAS=shared-media",
            "SHARED_DEV_MEDIA_SSH_CONFIG_PATH=C:/synthetic/media_config",
        ]
    )

    parsed = parse_shared_dev_secret_text(text, require_all=True)

    assert parsed["SHARED_DEV_REMOTE_MEDIA_ROOT"] == "/srv/personal-web/shared-dev/homepage"


def test_secret_parser_rejects_conflicting_remote_roots_without_values():
    with pytest.raises(SharedDevSecretError) as exc:
        parse_shared_dev_secret_text(
            "SHARED_DEV_REMOTE_MEDIA_ROOT=/one\nSHARED_DEV_MEDIA_REMOTE_ROOT=/two\n",
        )

    assert "/one" not in str(exc.value)
    assert "/two" not in str(exc.value)


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


def test_filesystem_backend_race_does_not_overwrite_destination(tmp_path, monkeypatch):
    monkeypatch.setattr("app.core.diagnostics.PROJECT_ROOT", tmp_path)
    monkeypatch.setattr("app.storage.filesystem_homepage_media_storage.PROJECT_ROOT", tmp_path)
    storage = FilesystemHomepageMediaStorage(make_settings(HOMEPAGE_MEDIA_ROOT="data/uploads/homepage"))
    payload = b"\x89PNG\r\n\x1a\npayload"
    staging = tmp_path / "stage.bin"
    staging.write_bytes(payload)
    checksum = hashlib.sha256(payload).hexdigest()
    logical_path = storage.build_logical_path("image", "race.png")
    destination = tmp_path / logical_path
    destination.parent.mkdir(parents=True)
    destination.write_bytes(b"winner")

    with pytest.raises(MediaObjectCollisionError):
        storage.store_validated_file(staging, logical_path, expected_size=len(payload), expected_sha256=checksum)

    assert destination.read_bytes() == b"winner"
    assert staging.exists()


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
            **safe_shared_overrides(),
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
        mode = stat.S_IFDIR if path in {"/remote", "/srv/personal-web/shared-dev/homepage", "/srv/personal-web/shared-dev/homepage/images"} else stat.S_IFREG
        return types.SimpleNamespace(st_size=len(data), st_mode=mode)

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

    def listdir(self, path: str):
        self.stat(path)
        return []


def make_sftp_storage(tmp_path, monkeypatch, fake):
    monkeypatch.setattr("app.core.diagnostics.PROJECT_ROOT", tmp_path)
    monkeypatch.setattr("app.storage.sftp_homepage_media_storage.PROJECT_ROOT", tmp_path)
    return SftpHomepageMediaStorage(
        make_settings(
            **safe_shared_overrides(),
            SHARED_DEV_MEDIA_CACHE_MAX_MB=1,
            SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS=1,
        ),
        client_factory=lambda: fake,
    )


def test_fake_sftp_upload_verify_atomic_rename_and_close(tmp_path, monkeypatch):
    fake = FakeSftp({"/remote": b"", "/srv/personal-web/shared-dev/homepage": b"", "/srv/personal-web/shared-dev/homepage/images": b""})
    storage = make_sftp_storage(tmp_path, monkeypatch, fake)
    payload = b"remote payload"
    staging = tmp_path / "stage.bin"
    staging.write_bytes(payload)
    checksum = hashlib.sha256(payload).hexdigest()
    logical_path = "data/uploads/homepage/images/a.png"

    storage.store_validated_file(staging, logical_path, expected_size=len(payload), expected_sha256=checksum)

    assert fake.files["/srv/personal-web/shared-dev/homepage/images/a.png"] == payload
    assert fake.renames
    assert fake.closed is True


def test_fake_sftp_materialize_cache_hit_and_corrupt_refetch(tmp_path, monkeypatch):
    payload = b"cache payload"
    checksum = hashlib.sha256(payload).hexdigest()
    fake = FakeSftp({"/srv/personal-web/shared-dev/homepage/images/a.png": payload})
    storage = make_sftp_storage(tmp_path, monkeypatch, fake)

    first = storage.materialize("data/uploads/homepage/images/a.png", expected_size=len(payload), expected_sha256=checksum)
    first.write_bytes(b"corrupt")
    second = storage.materialize("data/uploads/homepage/images/a.png", expected_size=len(payload), expected_sha256=checksum)

    assert second.read_bytes() == payload
    assert len(second.name) <= 80


def test_fake_sftp_unavailable_and_hash_mismatch(tmp_path, monkeypatch):
    fake = FakeSftp({"/srv/personal-web/shared-dev/homepage/images/a.png": b"payload"})
    storage = make_sftp_storage(tmp_path, monkeypatch, fake)

    with pytest.raises(StorageIntegrityError):
        storage.materialize("data/uploads/homepage/images/a.png", expected_size=7, expected_sha256="0" * 64)

    broken = make_sftp_storage(tmp_path, monkeypatch, FakeSftp({}))
    broken._client_factory = lambda: (_ for _ in ()).throw(OSError("synthetic"))
    with pytest.raises(StorageUnavailableError):
        broken.materialize("data/uploads/homepage/images/a.png")


def write_ssh_config(tmp_path: Path, *, user: str = "personal-web-dev", port: str = "2200") -> tuple[Path, Path, Path]:
    key = tmp_path / "identity"
    known_hosts = tmp_path / "known_hosts"
    config = tmp_path / "ssh_config"
    key.write_text("synthetic key placeholder", encoding="utf-8")
    known_hosts.write_text("synthetic known host placeholder", encoding="utf-8")
    config.write_text(
        f"""
Host personal-web-shared-media
  HostName synthetic.example.test
  User {user}
  Port {port}
  IdentityFile {key}
  UserKnownHostsFile {known_hosts}
""".strip(),
        encoding="utf-8",
    )
    return config, key, known_hosts


def test_sftp_alias_rejects_root_before_connect(tmp_path):
    config, _, _ = write_ssh_config(tmp_path, user="root")
    settings = make_settings(**{**safe_shared_overrides(), "SHARED_DEV_MEDIA_SSH_CONFIG_PATH": str(config)})
    storage = SftpHomepageMediaStorage(settings)

    with pytest.raises(StorageUnavailableError, match="user"):
        with storage._connect():
            pass


def test_sftp_alias_uses_explicit_port_and_disables_agent(monkeypatch, tmp_path):
    config, _, _ = write_ssh_config(tmp_path, port="2207")
    captured: dict[str, object] = {}

    class FakeSshClient:
        def load_host_keys(self, path):
            captured["known_hosts_loaded"] = True

        def set_missing_host_key_policy(self, policy):
            captured["reject_policy"] = type(policy).__name__

        def connect(self, **kwargs):
            captured.update(kwargs)

        def open_sftp(self):
            return FakeSftp({"/srv/personal-web/shared-dev/homepage": b""})

        def close(self):
            captured["client_closed"] = True

    import paramiko

    monkeypatch.setattr(paramiko, "SSHClient", FakeSshClient)
    settings = make_settings(**{**safe_shared_overrides(), "SHARED_DEV_MEDIA_SSH_CONFIG_PATH": str(config)})
    storage = SftpHomepageMediaStorage(settings)

    with storage._connect() as sftp:
        assert sftp is not None

    assert captured["port"] == 2207
    assert captured["allow_agent"] is False
    assert captured["look_for_keys"] is False
    assert captured["known_hosts_loaded"] is True
    assert captured["client_closed"] is True


def test_sftp_open_failure_closes_ssh_client(monkeypatch, tmp_path):
    config, _, _ = write_ssh_config(tmp_path)
    captured: dict[str, object] = {}

    class FakeSshClient:
        def load_host_keys(self, path):
            pass

        def set_missing_host_key_policy(self, policy):
            pass

        def connect(self, **kwargs):
            pass

        def open_sftp(self):
            raise TimeoutError("synthetic timeout")

        def close(self):
            captured["client_closed"] = True

    import paramiko

    monkeypatch.setattr(paramiko, "SSHClient", FakeSshClient)
    settings = make_settings(**{**safe_shared_overrides(), "SHARED_DEV_MEDIA_SSH_CONFIG_PATH": str(config)})
    storage = SftpHomepageMediaStorage(settings)

    with pytest.raises(StorageUnavailableError):
        with storage._connect():
            pass

    assert captured["client_closed"] is True


def test_cache_prune_failure_is_nonfatal_after_verified_download(tmp_path, monkeypatch):
    payload = b"cache payload"
    checksum = hashlib.sha256(payload).hexdigest()
    fake = FakeSftp({"/srv/personal-web/shared-dev/homepage/images/a.png": payload})
    storage = make_sftp_storage(tmp_path, monkeypatch, fake)
    monkeypatch.setattr(storage, "prune_cache", lambda: (_ for _ in ()).throw(OSError("synthetic prune")))

    materialized = storage.materialize(
        "data/uploads/homepage/images/a.png",
        expected_size=len(payload),
        expected_sha256=checksum,
    )

    assert materialized.read_bytes() == payload


def test_cache_concurrent_materialize_keeps_returned_files(tmp_path, monkeypatch):
    payload_a = b"a" * 1024
    payload_b = b"b" * 1024
    checksum_a = hashlib.sha256(payload_a).hexdigest()
    checksum_b = hashlib.sha256(payload_b).hexdigest()
    fake = FakeSftp(
        {
            "/srv/personal-web/shared-dev/homepage/images/a.png": payload_a,
            "/srv/personal-web/shared-dev/homepage/images/b.png": payload_b,
        }
    )
    storage = make_sftp_storage(tmp_path, monkeypatch, fake)
    storage.cache_max_bytes = 1

    def fetch(path, size, checksum):
        result = storage.materialize(path, expected_size=size, expected_sha256=checksum)
        return result, result.read_bytes()

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(fetch, "data/uploads/homepage/images/a.png", len(payload_a), checksum_a),
            pool.submit(fetch, "data/uploads/homepage/images/b.png", len(payload_b), checksum_b),
        ]
        results = [future.result(timeout=10) for future in futures]

    assert results[0][0].exists()
    assert results[1][0].exists()
    assert results[0][1] == payload_a
    assert results[1][1] == payload_b


def test_sftp_preflight_fake_requires_shared_profile(tmp_path, monkeypatch):
    fake = FakeSftp({"/srv/personal-web/shared-dev/homepage": b""})
    storage = make_sftp_storage(tmp_path, monkeypatch, fake)

    assert run_sftp_preflight(settings=make_settings(**safe_shared_overrides()), storage=storage)["ok"] is True
    with pytest.raises(SharedDevSftpPreflightError):
        run_sftp_preflight(settings=make_settings(), storage=storage)


class FakeTransaction:
    def __init__(self):
        self.rolled_back = False

    def rollback(self):
        self.rolled_back = True


class FakeConnection:
    def __init__(self, values):
        self.values = list(values)
        self.sql: list[str] = []
        self.transaction = FakeTransaction()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def begin(self):
        return self.transaction

    def execute(self, statement):
        self.sql.append(str(statement).lower())
        return types.SimpleNamespace(scalar_one=lambda: self.values.pop(0))


class FakeEngine:
    def __init__(self, values):
        self.connection = FakeConnection(values)
        self.disposed = False

    def connect(self):
        return self.connection

    def dispose(self):
        self.disposed = True


def test_database_preflight_fake_passes_and_uses_read_only_queries():
    engine = FakeEngine(["on", "personal_web_shared_dev", "personal_web_shared_dev_app", "head123"])

    result = run_database_preflight(
        settings=make_settings(**safe_shared_overrides()),
        engine_factory=lambda url: engine,
        code_heads_factory=lambda: ["head123"],
    )

    assert result["ok"] is True
    assert all("insert" not in sql and "update" not in sql and "delete" not in sql for sql in engine.connection.sql)
    assert engine.connection.sql[0] == "set transaction read only"
    assert engine.connection.sql[1] == "show transaction_read_only"
    assert engine.connection.transaction.rolled_back is True
    assert engine.disposed is True


@pytest.mark.parametrize(
    "values",
    [
        ["on", "wrong", "personal_web_shared_dev_app", "head123"],
        ["on", "personal_web_shared_dev", "wrong", "head123"],
        ["on", "personal_web_shared_dev", "personal_web_shared_dev_app", "old"],
    ],
)
def test_database_preflight_fake_rejects_identity_or_revision(values):
    engine = FakeEngine(values)

    with pytest.raises(SharedDevPreflightError):
        run_database_preflight(
            settings=make_settings(**safe_shared_overrides()),
            engine_factory=lambda url: engine,
            code_heads_factory=lambda: ["head123"],
        )


def test_database_preflight_rejects_multiple_code_heads():
    with pytest.raises(SharedDevPreflightError):
        run_database_preflight(
            settings=make_settings(**safe_shared_overrides()),
            engine_factory=lambda url: FakeEngine([]),
            code_heads_factory=lambda: ["a", "b"],
        )


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


class FakeUpload:
    filename = "private-original.png"
    content_type = "image/png"


class FakeRollbackDb:
    def __init__(self):
        self.rolled_back = False
        self.committed = False
        self.added = []

    def add(self, item):
        self.added.append(item)

    def flush(self):
        self.added[0].id = 99

    def commit(self):
        raise RuntimeError("synthetic commit failure")

    def rollback(self):
        self.rolled_back = True


class FakeRollbackStorage:
    backend_name = "fake"

    def __init__(self, remove_result=True, remove_exc: Exception | None = None):
        self.remove_result = remove_result
        self.remove_exc = remove_exc
        self.removed_paths: list[str] = []

    def build_logical_path(self, media_type, stored_filename):
        return f"data/uploads/homepage/images/{stored_filename}"

    def store_validated_file(self, *args, **kwargs):
        return None

    def remove_exact(self, path):
        self.removed_paths.append(path)
        if self.remove_exc:
            raise self.remove_exc
        return self.remove_result


def run_rollback_case(monkeypatch, tmp_path, storage):
    events: list[tuple[str, dict]] = []
    stage = tmp_path / "stage.png"
    stage.write_bytes(b"staged")

    async def fake_save(*args, **kwargs):
        return stage, 8, "a" * 64

    monkeypatch.setattr("app.services.homepage_media_service.save_upload_to_runtime", fake_save)
    monkeypatch.setattr("app.services.homepage_media_service.build_homepage_media_storage", lambda settings: storage)
    monkeypatch.setattr("app.services.homepage_media_service.write_audit_log", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        "app.services.homepage_media_service.write_jsonl_event",
        lambda _scope, event, payload: events.append((event, dict(payload))),
    )
    db = FakeRollbackDb()

    with pytest.raises(RuntimeError):
        asyncio.run(
            create_homepage_media(
                db,
                upload=FakeUpload(),
                title=None,
                description=None,
                sort_order=0,
                actor=types.SimpleNamespace(id=1),
                settings=make_settings(),
            )
        )

    return db, storage, events


@pytest.mark.parametrize(
    ("storage", "expected"),
    [
        (FakeRollbackStorage(remove_result=True), "removed"),
        (FakeRollbackStorage(remove_result=False), "already_missing"),
        (FakeRollbackStorage(remove_exc=RuntimeError("synthetic remove failure")), "rollback_failed"),
    ],
)
def test_upload_rollback_reports_exact_result(monkeypatch, tmp_path, storage, expected):
    db, storage, events = run_rollback_case(monkeypatch, tmp_path, storage)

    assert db.rolled_back is True
    assert db.committed is False
    assert len(storage.removed_paths) == 1
    rollback_events = [payload for event, payload in events if event == "homepage.media.upload.db_failed_file_rollback"]
    assert rollback_events[-1]["rollback"] == expected
    assert "private-original" not in str(events)
    if expected in {"already_missing", "rollback_failed"}:
        orphan_events = [payload for event, payload in events if event == "homepage.media.upload.orphan_candidate"]
        assert orphan_events[-1]["severity"] == "high"
