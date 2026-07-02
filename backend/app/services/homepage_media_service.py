"""Service helpers for homepage media uploads and display items."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path
import posixpath
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.diagnostics import PROJECT_ROOT, write_jsonl_event
from app.models.auth import AppUser
from app.models.homepage_item import HomepageItem
from app.models.homepage_media import HomepageMedia
from app.schemas.homepage import HomepageItemCreateRequest, HomepageItemUpdateRequest, HomepageMediaUpdateRequest
from app.services.audit_service import write_audit_log

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".webm"}
REJECTED_EXTENSIONS = {
    ".svg",
    ".exe",
    ".bat",
    ".cmd",
    ".ps1",
    ".html",
    ".htm",
    ".js",
    ".mjs",
    ".ts",
    ".py",
    ".zip",
    ".rar",
    ".7z",
    ".pdf",
}
MIME_BY_EXTENSION = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
}


def normalized_extension(filename: str) -> str:
    """Return a lowercase suffix for upload validation."""

    return Path(filename or "").suffix.lower()


def classify_upload(filename: str, content_type: str | None, settings: Settings) -> tuple[str, str, int]:
    """Validate an upload filename and return media type, MIME type, and max size."""

    extension = normalized_extension(filename)
    if not extension:
        raise HTTPException(status_code=400, detail="Uploaded file must have an allowed extension")
    if extension in REJECTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {extension} is not allowed")
    if extension in IMAGE_EXTENSIONS:
        return "image", MIME_BY_EXTENSION[extension], settings.homepage_image_max_bytes
    if extension in VIDEO_EXTENSIONS:
        return "video", MIME_BY_EXTENSION[extension], settings.homepage_video_max_bytes
    raise HTTPException(status_code=400, detail=f"File type {extension} is not allowed")


def safe_relative_path(settings: Settings, media_type: str, stored_filename: str) -> str:
    """Build a project-relative POSIX path for stored homepage media."""

    subdir = "images" if media_type == "image" else "videos"
    relative_path = posixpath.join(settings.homepage_media_root, subdir, stored_filename)
    parts = Path(relative_path).parts
    if Path(relative_path).is_absolute() or ".." in parts:
        raise HTTPException(status_code=500, detail="Invalid media storage path")
    return relative_path.replace("\\", "/")


def resolve_storage_path(relative_path: str) -> Path:
    """Resolve and validate a stored relative path under the project root."""

    if "\\" in relative_path or ":" in relative_path:
        raise HTTPException(status_code=404, detail="Media file not found")
    candidate = (PROJECT_ROOT / relative_path).resolve()
    project_root = PROJECT_ROOT.resolve()
    if not candidate.is_relative_to(project_root):
        raise HTTPException(status_code=404, detail="Media file not found")
    return candidate


def ensure_storage_root(settings: Settings, media_type: str) -> Path:
    """Create and return the runtime upload subdirectory."""

    subdir = "images" if media_type == "image" else "videos"
    storage_dir = settings.homepage_media_root_path / subdir
    storage_dir.mkdir(parents=True, exist_ok=True)
    return storage_dir


async def save_upload_to_runtime(
    upload: UploadFile,
    settings: Settings,
    media_type: str,
    stored_filename: str,
    max_size_bytes: int,
) -> tuple[Path, int, str]:
    """Save an uploaded file to runtime storage while enforcing the size limit."""

    storage_dir = ensure_storage_root(settings, media_type)
    destination = storage_dir / stored_filename
    if destination.exists():
        raise HTTPException(status_code=500, detail="Generated media filename already exists")

    digest = hashlib.sha256()
    total_size = 0
    try:
        with destination.open("wb") as output:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > max_size_bytes:
                    raise HTTPException(status_code=413, detail="Uploaded file is too large")
                digest.update(chunk)
                output.write(chunk)
    except Exception:
        if destination.exists():
            destination.unlink()
        raise
    finally:
        await upload.close()

    if total_size <= 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    return destination, total_size, digest.hexdigest()


async def create_homepage_media(
    db: Session,
    *,
    upload: UploadFile,
    title: str | None,
    description: str | None,
    sort_order: int,
    actor: AppUser,
    settings: Settings,
) -> HomepageMedia:
    """Validate, store, and register uploaded homepage media."""

    original_filename = Path(upload.filename or "upload").name
    media_type, mime_type, max_size_bytes = classify_upload(original_filename, upload.content_type, settings)
    extension = normalized_extension(original_filename)
    stored_filename = f"{uuid4().hex}{extension}"
    relative_path = safe_relative_path(settings, media_type, stored_filename)
    destination, file_size, checksum = await save_upload_to_runtime(
        upload,
        settings,
        media_type,
        stored_filename,
        max_size_bytes,
    )

    media = HomepageMedia(
        media_type=media_type,
        title=title,
        description=description,
        original_filename=original_filename,
        stored_filename=stored_filename,
        relative_path=relative_path,
        mime_type=mime_type,
        file_size_bytes=file_size,
        checksum_sha256=checksum,
        sort_order=sort_order,
        is_enabled=True,
    )
    db.add(media)
    try:
        db.flush()
        write_audit_log(
            db,
            action="homepage_media.create",
            source_app="homepage",
            target_table="homepage_media",
            target_id=str(media.id),
            actor_type="user",
            actor_id=str(actor.id),
            actor_user_id=actor.id,
            summary="Admin uploaded homepage media metadata.",
        )
        db.commit()
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        logger.exception("Homepage media database write failed after saving file: %s", destination)
        write_jsonl_event("backend", "homepage.media.upload.db_failed_file_removed", {"path": relative_path})
        raise

    db.refresh(media)
    logger.info("Homepage media uploaded: id=%s type=%s bytes=%s", media.id, media.media_type, media.file_size_bytes)
    write_jsonl_event(
        "backend",
        "homepage.media.uploaded",
        {"mediaId": media.id, "mediaType": media.media_type, "bytes": media.file_size_bytes},
    )
    return media


def list_homepage_media(db: Session) -> list[HomepageMedia]:
    """Return media rows for admin management."""

    return list(
        db.execute(select(HomepageMedia).order_by(HomepageMedia.sort_order, HomepageMedia.id)).scalars()
    )


def get_media(db: Session, media_id: int) -> HomepageMedia:
    media = db.get(HomepageMedia, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    return media


def update_homepage_media(
    db: Session,
    media_id: int,
    payload: HomepageMediaUpdateRequest,
    actor: AppUser,
) -> HomepageMedia:
    """Update allowed homepage media metadata fields."""

    media = get_media(db, media_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(media, field, value)
    write_audit_log(
        db,
        action="homepage_media.update",
        source_app="homepage",
        target_table="homepage_media",
        target_id=str(media.id),
        actor_type="user",
        actor_id=str(actor.id),
        actor_user_id=actor.id,
        summary="Admin updated homepage media metadata.",
    )
    db.commit()
    db.refresh(media)
    write_jsonl_event("backend", "homepage.media.updated", {"mediaId": media.id, "updatedFields": sorted(updates)})
    return media


def get_public_media_file(db: Session, media_id: int) -> tuple[HomepageMedia, Path]:
    """Return enabled media and its safe file path for public serving."""

    media = get_media(db, media_id)
    if not media.is_enabled:
        raise HTTPException(status_code=404, detail="Media not found")
    path = resolve_storage_path(media.relative_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Media file not found")
    return media, path


def media_public_payload(media: HomepageMedia, url: str) -> dict[str, Any]:
    """Return public-safe media metadata."""

    return {
        "id": media.id,
        "mediaType": media.media_type,
        "title": media.title,
        "url": url,
        "mimeType": media.mime_type,
        "fileSizeBytes": media.file_size_bytes,
    }


def media_admin_payload(media: HomepageMedia, url: str) -> dict[str, Any]:
    """Return admin media metadata without absolute filesystem paths."""

    return {
        **media_public_payload(media, url),
        "description": media.description,
        "originalFilename": media.original_filename,
        "storedFilename": media.stored_filename,
        "relativePath": media.relative_path,
        "checksumSha256": media.checksum_sha256,
        "sortOrder": media.sort_order,
        "isEnabled": media.is_enabled,
        "createdAt": media.created_at,
        "updatedAt": media.updated_at,
    }


def build_item_payload(item: HomepageItem, media: HomepageMedia | None, media_url: str | None) -> dict[str, Any]:
    """Return a homepage item response payload."""

    return {
        "id": item.id,
        "title": item.title,
        "subtitle": item.subtitle,
        "description": item.description,
        "locationLabel": item.location_label,
        "timeLabel": item.time_label,
        "mediaId": item.media_id,
        "displayType": item.display_type,
        "sortOrder": item.sort_order,
        "isVisible": item.is_visible,
        "media": media_public_payload(media, media_url) if media and media_url else None,
        "createdAt": item.created_at,
        "updatedAt": item.updated_at,
    }


def list_public_homepage_items(db: Session) -> list[HomepageItem]:
    """Return visible homepage items whose attached media is enabled or absent."""

    items = list(
        db.execute(
            select(HomepageItem)
            .where(HomepageItem.is_visible.is_(True))
            .order_by(HomepageItem.sort_order, HomepageItem.id)
        ).scalars()
    )
    visible: list[HomepageItem] = []
    for item in items:
        if not item.media_id:
            visible.append(item)
            continue
        media = db.get(HomepageMedia, item.media_id)
        if media and media.is_enabled:
            visible.append(item)
    return visible


def list_admin_homepage_items(db: Session) -> list[HomepageItem]:
    """Return homepage items for admin management."""

    return list(db.execute(select(HomepageItem).order_by(HomepageItem.sort_order, HomepageItem.id)).scalars())


def require_existing_media(db: Session, media_id: int | None) -> HomepageMedia | None:
    """Return an existing media row or raise when a referenced media id is missing."""

    if media_id is None:
        return None
    media = db.get(HomepageMedia, media_id)
    if not media:
        raise HTTPException(status_code=400, detail="media_id does not exist")
    return media


def create_homepage_item(
    db: Session,
    payload: HomepageItemCreateRequest,
    actor: AppUser,
) -> HomepageItem:
    """Create a homepage display item."""

    require_existing_media(db, payload.media_id)
    item = HomepageItem(
        title=payload.title.strip(),
        subtitle=payload.subtitle,
        description=payload.description,
        location_label=payload.location_label,
        time_label=payload.time_label,
        media_id=payload.media_id,
        display_type=payload.display_type,
        sort_order=payload.sort_order,
        is_visible=payload.is_visible,
    )
    db.add(item)
    db.flush()
    write_audit_log(
        db,
        action="homepage_item.create",
        source_app="homepage",
        target_table="homepage_items",
        target_id=str(item.id),
        actor_type="user",
        actor_id=str(actor.id),
        actor_user_id=actor.id,
        summary="Admin created homepage display item.",
    )
    db.commit()
    db.refresh(item)
    write_jsonl_event("backend", "homepage.item.created", {"itemId": item.id, "mediaId": item.media_id})
    return item


def update_homepage_item(
    db: Session,
    item_id: int,
    payload: HomepageItemUpdateRequest,
    actor: AppUser,
) -> HomepageItem:
    """Update allowed homepage display item fields."""

    item = db.get(HomepageItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Homepage item not found")
    updates = payload.model_dump(exclude_unset=True)
    if "media_id" in updates:
        require_existing_media(db, updates["media_id"])
    for field, value in updates.items():
        if field == "title" and isinstance(value, str):
            value = value.strip()
        setattr(item, field, value)
    write_audit_log(
        db,
        action="homepage_item.update",
        source_app="homepage",
        target_table="homepage_items",
        target_id=str(item.id),
        actor_type="user",
        actor_id=str(actor.id),
        actor_user_id=actor.id,
        summary="Admin updated homepage display item.",
    )
    db.commit()
    db.refresh(item)
    write_jsonl_event("backend", "homepage.item.updated", {"itemId": item.id, "updatedFields": sorted(updates)})
    return item


def soft_hide_homepage_item(db: Session, item_id: int, actor: AppUser) -> HomepageItem:
    """Soft-hide a homepage item without physically deleting it."""

    item = db.get(HomepageItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Homepage item not found")
    item.is_visible = False
    write_audit_log(
        db,
        action="homepage_item.soft_hide",
        source_app="homepage",
        target_table="homepage_items",
        target_id=str(item.id),
        actor_type="user",
        actor_id=str(actor.id),
        actor_user_id=actor.id,
        summary="Admin soft-hid homepage display item.",
    )
    db.commit()
    db.refresh(item)
    write_jsonl_event("backend", "homepage.item.soft_hidden", {"itemId": item.id})
    return item
