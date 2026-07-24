"""Strict SFTP homepage media storage backend."""

from __future__ import annotations

from contextlib import contextmanager
import hashlib
import logging
from pathlib import Path, PurePosixPath
import posixpath
import time

from app.core.config import Settings
from app.core.diagnostics import PROJECT_ROOT, write_jsonl_event
from app.storage.errors import (
    MediaObjectCollisionError,
    MediaObjectMissingError,
    StorageIntegrityError,
    StorageUnavailableError,
)
from app.storage.homepage_media_storage import validate_managed_logical_path

logger = logging.getLogger(__name__)


class SftpHomepageMediaStorage:
    """Authoritative SFTP storage with a verified local read-through cache."""

    backend_name = "sftp"

    def __init__(self, settings: Settings, *, client_factory=None) -> None:
        self.settings = settings
        self.logical_root = settings.homepage_media_root
        self.remote_root = self._normalize_remote_root(settings.shared_dev_media_remote_root or "")
        self.cache_root = PROJECT_ROOT / ".runtime" / "shared-media-cache"
        self.cache_max_bytes = settings.shared_dev_media_cache_max_mb * 1024 * 1024
        self.cache_retention_seconds = settings.shared_dev_media_cache_retention_days * 24 * 60 * 60
        self._client_factory = client_factory

    @staticmethod
    def _normalize_remote_root(remote_root: str) -> str:
        remote_root = remote_root.strip().replace("\\", "/")
        if not remote_root.startswith("/"):
            raise ValueError("Shared media remote root must be absolute")
        parts = [part for part in remote_root.split("/") if part]
        if any(part == ".." for part in parts):
            raise ValueError("Shared media remote root must not contain traversal")
        return "/" + "/".join(parts)

    def build_logical_path(self, media_type: str, stored_filename: str) -> str:
        subdir = "images" if media_type == "image" else "videos"
        return posixpath.join(self.logical_root, subdir, stored_filename).replace("\\", "/")

    def remote_path_for(self, logical_path: str) -> str:
        suffix = validate_managed_logical_path(self.logical_root, logical_path)
        remote_path = PurePosixPath(self.remote_root, suffix)
        normalized = remote_path.as_posix()
        if normalized != self.remote_root and not normalized.startswith(f"{self.remote_root}/"):
            from app.storage.errors import UnsafeMediaPathError

            raise UnsafeMediaPathError("Remote media path escaped media root")
        return normalized

    def _cache_path_for(self, logical_path: str, expected_size: int | None, expected_sha256: str | None) -> Path:
        suffix = validate_managed_logical_path(self.logical_root, logical_path)
        digest_key = expected_sha256 or "no-checksum"
        safe_name = suffix.replace("/", "__")
        identity = hashlib.sha256(f"{suffix}|{expected_size}|{digest_key}".encode("utf-8")).hexdigest()
        return self.cache_root / identity[:2] / f"{identity}-{safe_name}"

    def _verify_local_file(self, path: Path, expected_size: int | None, expected_sha256: str | None) -> None:
        if expected_size is not None and path.stat().st_size != expected_size:
            raise StorageIntegrityError("Cached media size mismatch")
        if expected_sha256:
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            if actual != expected_sha256:
                raise StorageIntegrityError("Cached media checksum mismatch")

    @contextmanager
    def _connect(self):
        if self._client_factory is not None:
            client = self._client_factory()
            try:
                yield client
            finally:
                close = getattr(client, "close", None)
                if close:
                    close()
            return

        try:
            import paramiko
        except Exception as exc:  # pragma: no cover - dependency is installed outside unit fakes
            raise StorageUnavailableError("SFTP dependency is unavailable") from exc

        alias = self.settings.shared_dev_media_ssh_alias
        config_path = Path(self.settings.shared_dev_media_ssh_config_path or "")
        if not alias or not config_path.is_file():
            raise StorageUnavailableError("SFTP SSH configuration is incomplete")
        try:
            ssh_config = paramiko.SSHConfig()
            with config_path.open("r", encoding="utf-8") as handle:
                ssh_config.parse(handle)
            host_config = ssh_config.lookup(alias)
            hostname = host_config.get("hostname")
            username = host_config.get("user")
            identity_files = host_config.get("identityfile") or []
            known_hosts = host_config.get("userknownhostsfile", [str(Path.home() / ".ssh" / "known_hosts")])
            if not hostname or not username or not identity_files:
                raise StorageUnavailableError("SFTP SSH alias is missing required fields")
            known_hosts_path = Path(known_hosts[0]).expanduser()
            if not known_hosts_path.is_file():
                raise StorageUnavailableError("SFTP known_hosts file is required")
            key_path = Path(identity_files[0]).expanduser()
            client = paramiko.SSHClient()
            client.load_host_keys(str(known_hosts_path))
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            client.connect(
                hostname=hostname,
                username=username,
                key_filename=str(key_path),
                allow_agent=False,
                look_for_keys=False,
                timeout=10,
                banner_timeout=10,
                auth_timeout=10,
            )
            sftp = client.open_sftp()
            try:
                yield sftp
            finally:
                sftp.close()
                client.close()
                write_jsonl_event("backend", "homepage.media.storage.sftp.disconnected", {"alias": alias})
        except StorageUnavailableError:
            raise
        except Exception as exc:
            logger.warning("SFTP storage connection failed with sanitized error type: %s", type(exc).__name__)
            raise StorageUnavailableError("SFTP storage is unavailable") from exc

    def store_validated_file(
        self,
        staging_path: Path,
        logical_path: str,
        *,
        expected_size: int,
        expected_sha256: str,
    ) -> None:
        remote_final = self.remote_path_for(logical_path)
        remote_tmp = f"{remote_final}.tmp-{time.time_ns()}"
        try:
            with self._connect() as sftp:
                try:
                    sftp.stat(remote_final)
                    raise MediaObjectCollisionError("Remote media destination already exists")
                except FileNotFoundError:
                    pass
                try:
                    self._mkdir_p(sftp, str(PurePosixPath(remote_final).parent))
                    sftp.put(str(staging_path), remote_tmp)
                    uploaded = sftp.stat(remote_tmp)
                    if uploaded.st_size != expected_size:
                        raise StorageIntegrityError("Remote media size mismatch")
                    digest = hashlib.sha256()
                    with sftp.open(remote_tmp, "rb") as remote_file:
                        for chunk in iter(lambda: remote_file.read(1024 * 1024), b""):
                            digest.update(chunk)
                    if digest.hexdigest() != expected_sha256:
                        raise StorageIntegrityError("Remote media checksum mismatch")
                    sftp.rename(remote_tmp, remote_final)
                    write_jsonl_event(
                        "backend",
                        "homepage.media.storage.sftp.store_completed",
                        {"path": logical_path, "bytes": expected_size, "checksumPrefix": expected_sha256[:12]},
                    )
                except Exception:
                    try:
                        sftp.remove(remote_tmp)
                    except Exception:
                        pass
                    raise
        except (MediaObjectCollisionError, StorageIntegrityError):
            raise
        except FileNotFoundError as exc:
            raise StorageUnavailableError("Remote media parent is unavailable") from exc
        except StorageUnavailableError:
            raise
        except Exception as exc:
            raise StorageUnavailableError("SFTP storage write failed") from exc

    def _mkdir_p(self, sftp, remote_dir: str) -> None:
        current = "/"
        for part in [part for part in remote_dir.split("/") if part]:
            current = posixpath.join(current, part)
            try:
                sftp.stat(current)
            except FileNotFoundError:
                sftp.mkdir(current)

    def materialize(
        self,
        logical_path: str,
        *,
        expected_size: int | None = None,
        expected_sha256: str | None = None,
    ) -> Path:
        cache_path = self._cache_path_for(logical_path, expected_size, expected_sha256)
        if cache_path.is_file():
            try:
                self._verify_local_file(cache_path, expected_size, expected_sha256)
                write_jsonl_event("backend", "homepage.media.cache.hit", {"path": logical_path})
                return cache_path
            except StorageIntegrityError:
                cache_path.unlink(missing_ok=True)
                write_jsonl_event("backend", "homepage.media.cache.corrupt_removed", {"path": logical_path})

        remote_path = self.remote_path_for(logical_path)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = cache_path.with_suffix(cache_path.suffix + f".tmp-{time.time_ns()}")
        try:
            with self._connect() as sftp:
                try:
                    sftp.stat(remote_path)
                except FileNotFoundError as exc:
                    raise MediaObjectMissingError("Remote media object is missing") from exc
                sftp.get(remote_path, str(tmp_path))
            self._verify_local_file(tmp_path, expected_size, expected_sha256)
            tmp_path.replace(cache_path)
            self.prune_cache()
            write_jsonl_event("backend", "homepage.media.cache.downloaded", {"path": logical_path})
            return cache_path
        except (MediaObjectMissingError, StorageIntegrityError):
            tmp_path.unlink(missing_ok=True)
            raise
        except StorageUnavailableError:
            tmp_path.unlink(missing_ok=True)
            raise
        except Exception as exc:
            tmp_path.unlink(missing_ok=True)
            raise StorageUnavailableError("SFTP storage read failed") from exc

    def remove_exact(self, logical_path: str) -> bool:
        remote_path = self.remote_path_for(logical_path)
        try:
            with self._connect() as sftp:
                try:
                    sftp.remove(remote_path)
                    write_jsonl_event("backend", "homepage.media.storage.sftp.rollback_removed", {"path": logical_path})
                    return True
                except FileNotFoundError:
                    return False
        except StorageUnavailableError:
            raise
        except Exception as exc:
            raise StorageUnavailableError("SFTP storage rollback failed") from exc

    def prune_cache(self) -> None:
        if not self.cache_root.exists():
            return
        now = time.time()
        files = [path for path in self.cache_root.rglob("*") if path.is_file()]
        for path in files:
            try:
                if now - path.stat().st_mtime > self.cache_retention_seconds:
                    path.unlink()
                    write_jsonl_event("backend", "homepage.media.cache.pruned_retention", {})
            except FileNotFoundError:
                pass
        files = sorted(
            [path for path in self.cache_root.rglob("*") if path.is_file()],
            key=lambda item: item.stat().st_mtime,
        )
        total = sum(path.stat().st_size for path in files)
        for path in files:
            if total <= self.cache_max_bytes:
                break
            try:
                size = path.stat().st_size
                path.unlink()
                total -= size
                write_jsonl_event("backend", "homepage.media.cache.pruned_size", {})
            except FileNotFoundError:
                pass

    def preflight(self) -> None:
        self.cache_root.mkdir(parents=True, exist_ok=True)
        with self._connect() as sftp:
            sftp.stat(self.remote_root)
        write_jsonl_event("backend", "homepage.media.storage.sftp.preflight_ok", {})
