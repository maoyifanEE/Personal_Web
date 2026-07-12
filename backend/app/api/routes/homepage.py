"""Homepage and Journey canvas API routes."""

import importlib.util
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.api.dependencies import require_csrf_token, require_permission
from app.core.diagnostics import PROJECT_ROOT, write_jsonl_event
from app.db.session import get_db_session
from app.models.auth import AppUser
from app.models.homepage_item import HomepageItem
from app.models.homepage_canvas import HomepageCanvasState
from app.models.homepage_media import HomepageMedia
from app.schemas.homepage import (
    CANVAS_KEY_DEFAULT,
    HomepageCanvasPublicResponse,
    HomepageCanvasResponse,
    HomepageCanvasSaveRequest,
    HomepageItemCreateRequest,
    HomepageItemListResponse,
    HomepageItemResponse,
    HomepageItemUpdateRequest,
    HomepageMediaListResponse,
    HomepageMediaResponse,
    HomepageMediaUpdateRequest,
    HomepagePublicResponse,
)
from app.services.homepage_canvas_service import get_canvas_state, reset_canvas_state, save_canvas_state
from app.services.homepage_media_service import (
    build_item_payload,
    create_homepage_item,
    create_homepage_media,
    get_admin_media_file,
    get_media,
    get_public_media_file,
    list_admin_homepage_items,
    list_homepage_media,
    list_public_homepage_items,
    media_admin_payload,
    soft_hide_homepage_item,
    update_homepage_item,
    update_homepage_media,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/homepage")


def load_publish_bundle_helper():
    """Load the local publish bundle helper without making it a public API."""

    helper_path = PROJECT_ROOT / "scripts" / "homepage_publish_bundle.py"
    spec = importlib.util.spec_from_file_location("homepage_publish_bundle_helper", helper_path)
    if not spec or not spec.loader:
        raise HTTPException(status_code=500, detail="Homepage publish bundle helper is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def media_file_url(request: Request, media_id: int) -> str:
    """Return the safe API URL for a registered media file."""

    return str(request.url_for("read_homepage_media_file", media_id=media_id))


def media_admin_file_url(request: Request, media_id: int) -> str:
    """Return the admin-only preview URL for a registered media file."""

    return str(request.url_for("read_homepage_media_admin_file", media_id=media_id))


def media_response(request: Request, media: HomepageMedia) -> dict:
    """Return admin media metadata without exposing filesystem absolute paths."""

    return media_admin_payload(
        media,
        media_file_url(request, media.id),
        media_admin_file_url(request, media.id),
    )


def item_response(request: Request, db: Session, item: HomepageItem) -> dict:
    """Return a homepage item payload with optional media metadata."""

    media = get_media(db, item.media_id) if item.media_id else None
    url = media_file_url(request, media.id) if media else None
    return build_item_payload(item, media, url)


def to_canvas_response(state: HomepageCanvasState | None) -> HomepageCanvasResponse:
    """Convert a canvas row or missing row into the internal canvas response shape."""

    if not state:
        return HomepageCanvasResponse(
            canvas_key=CANVAS_KEY_DEFAULT,
            schema_version="sketch-canvas-v1",
            canvas_data={},
            revision=0,
            updated_at=None,
            updated_by_user_id=None,
            exists=False,
        )
    return HomepageCanvasResponse(
        canvas_key=state.canvas_key,
        schema_version=state.schema_version,
        canvas_data=state.canvas_data,
        revision=state.revision,
        updated_at=state.updated_at,
        updated_by_user_id=state.updated_by_user_id,
        exists=True,
    )


def to_public_canvas_response(state: HomepageCanvasState | None) -> HomepageCanvasPublicResponse:
    """Convert a canvas row or missing row into the public response shape."""

    if not state:
        return HomepageCanvasPublicResponse(
            canvas_key=CANVAS_KEY_DEFAULT,
            schema_version="sketch-canvas-v1",
            canvas_data={},
            revision=0,
            updated_at=None,
            exists=False,
        )
    return HomepageCanvasPublicResponse(
        canvas_key=state.canvas_key,
        schema_version=state.schema_version,
        canvas_data=state.canvas_data,
        revision=state.revision,
        updated_at=state.updated_at,
        exists=True,
    )


@router.get("/canvas", response_model=HomepageCanvasPublicResponse)
def read_canvas(db: Session = Depends(get_db_session)) -> HomepageCanvasPublicResponse:
    """Publicly read the current shared Journey canvas state."""

    state = get_canvas_state(db, CANVAS_KEY_DEFAULT)
    write_jsonl_event("backend", "homepage.canvas.route.read", {"exists": bool(state)})
    return to_public_canvas_response(state)


@router.get("/public", response_model=HomepagePublicResponse)
def read_public_homepage_items(
    request: Request,
    db: Session = Depends(get_db_session),
) -> dict[str, list[dict]]:
    """Publicly read visible homepage display items."""

    items = list_public_homepage_items(db)
    payload: list[dict] = []
    for item in items:
        data = item_response(request, db, item)
        data.pop("mediaId", None)
        data.pop("isVisible", None)
        data.pop("createdAt", None)
        data.pop("updatedAt", None)
        payload.append(data)
    write_jsonl_event("backend", "homepage.public.read", {"itemCount": len(payload)})
    return {"items": payload}


@router.get("/media/{media_id}/file", name="read_homepage_media_file")
def read_homepage_media_file(
    media_id: int,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Serve enabled media only after it is referenced by a visible item."""

    media, path = get_public_media_file(db, media_id, settings)
    write_jsonl_event("backend", "homepage.media.file_served", {"mediaId": media.id, "mediaType": media.media_type})
    return FileResponse(path=path, media_type=media.mime_type)


@router.get("/media/{media_id}/admin-file", name="read_homepage_media_admin_file")
def read_homepage_media_admin_file(
    media_id: int,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    actor: AppUser = Depends(require_permission("homepage:edit")),
) -> FileResponse:
    """Admin-only preview for uploaded homepage media before publication."""

    media, path = get_admin_media_file(db, media_id, settings)
    write_jsonl_event(
        "backend",
        "homepage.media.admin_file_served",
        {"mediaId": media.id, "mediaType": media.media_type, "userId": actor.id},
    )
    return FileResponse(path=path, media_type=media.mime_type, filename=media.original_filename)


@router.post(
    "/media",
    response_model=HomepageMediaResponse,
    status_code=201,
    dependencies=[Depends(require_csrf_token)],
)
async def upload_homepage_media(
    request: Request,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    description: str | None = Form(default=None),
    sort_order: int = Form(default=0),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    actor: AppUser = Depends(require_permission("homepage:edit")),
) -> dict:
    """Admin-only upload endpoint for local homepage media foundation."""

    media = await create_homepage_media(
        db,
        upload=file,
        title=title,
        description=description,
        sort_order=sort_order,
        actor=actor,
        settings=settings,
    )
    return media_response(request, media)


@router.get("/media", response_model=HomepageMediaListResponse)
def read_homepage_media_admin(
    request: Request,
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("homepage:edit")),
) -> dict[str, list[dict]]:
    """Admin-only list of homepage media rows."""

    media_rows = list_homepage_media(db)
    write_jsonl_event("backend", "homepage.media.admin_list", {"userId": actor.id, "count": len(media_rows)})
    return {"media": [media_response(request, media) for media in media_rows]}


@router.post(
    "/publish-bundle/export",
    dependencies=[Depends(require_csrf_token)],
)
def export_homepage_publish_bundle(
    settings: Settings = Depends(get_settings),
    actor: AppUser = Depends(require_permission("homepage:edit")),
) -> FileResponse:
    """Local-admin-only export of the Homepage/Journey publish bundle ZIP."""

    if settings.app_env == "production":
        write_jsonl_event(
            "backend",
            "homepage.publish_bundle.export.rejected_production",
            {"userId": actor.id},
        )
        raise HTTPException(
            status_code=403,
            detail="Homepage publish bundle export is disabled in production.",
        )

    helper = load_publish_bundle_helper()
    try:
        result = helper.export_homepage_bundle(
            create_zip=True,
            require_repo_root=False,
            include_homepage_items=False,
        )
    except Exception as exc:
        logger.exception("Homepage publish bundle export failed for user_id=%s", actor.id)
        write_jsonl_event(
            "backend",
            "homepage.publish_bundle.export.failed",
            {"userId": actor.id, "error": str(exc)},
        )
        raise HTTPException(status_code=500, detail=f"Homepage publish bundle export failed: {exc}") from exc

    zip_path = Path(result.get("zipPath") or "")
    if not zip_path.exists() or not zip_path.is_file():
        raise HTTPException(status_code=500, detail="Homepage publish bundle ZIP was not created")

    filename = zip_path.name
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-Homepage-Bundle-Filename": filename,
        "X-Homepage-Bundle-Items-Scope": str(result.get("homepageItemsScope", "excluded")),
        "X-Homepage-Bundle-Media-Count": str(result.get("mediaCount", 0)),
        "X-Homepage-Bundle-File-Count": str(result.get("fileCount", 0)),
        "X-Homepage-Bundle-Warning-Count": str(result.get("warningCount", 0)),
    }
    write_jsonl_event(
        "backend",
        "homepage.publish_bundle.export.created",
        {
            "userId": actor.id,
            "filename": filename,
            "homepageItemsScope": result.get("homepageItemsScope", "excluded"),
            "mediaCount": result.get("mediaCount", 0),
            "fileCount": result.get("fileCount", 0),
            "warningCount": result.get("warningCount", 0),
        },
    )
    logger.info("Homepage publish bundle ZIP exported for user_id=%s file=%s", actor.id, filename)
    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=filename,
        headers=headers,
    )


@router.patch(
    "/media/{media_id}",
    response_model=HomepageMediaResponse,
    dependencies=[Depends(require_csrf_token)],
)
def patch_homepage_media(
    request: Request,
    media_id: int,
    payload: HomepageMediaUpdateRequest,
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("homepage:edit")),
) -> dict:
    """Admin-only metadata update for homepage media."""

    media = update_homepage_media(db, media_id, payload, actor)
    return media_response(request, media)


@router.get("/items", response_model=HomepageItemListResponse)
def read_homepage_items_admin(
    request: Request,
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("homepage:edit")),
) -> dict[str, list[dict]]:
    """Admin-only list of homepage display items."""

    items = list_admin_homepage_items(db)
    write_jsonl_event("backend", "homepage.items.admin_list", {"userId": actor.id, "count": len(items)})
    return {"items": [item_response(request, db, item) for item in items]}


@router.post(
    "/items",
    response_model=HomepageItemResponse,
    status_code=201,
    dependencies=[Depends(require_csrf_token)],
)
def post_homepage_item(
    request: Request,
    payload: HomepageItemCreateRequest,
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("homepage:edit")),
) -> dict:
    """Admin-only create endpoint for homepage display items."""

    item = create_homepage_item(db, payload, actor)
    return item_response(request, db, item)


@router.patch(
    "/items/{item_id}",
    response_model=HomepageItemResponse,
    dependencies=[Depends(require_csrf_token)],
)
def patch_homepage_item(
    request: Request,
    item_id: int,
    payload: HomepageItemUpdateRequest,
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("homepage:edit")),
) -> dict:
    """Admin-only update endpoint for homepage display items."""

    item = update_homepage_item(db, item_id, payload, actor)
    return item_response(request, db, item)


@router.delete(
    "/items/{item_id}",
    response_model=HomepageItemResponse,
    dependencies=[Depends(require_csrf_token)],
)
def delete_homepage_item(
    request: Request,
    item_id: int,
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("homepage:edit")),
) -> dict:
    """Admin-only soft-hide endpoint for homepage display items."""

    item = soft_hide_homepage_item(db, item_id, actor)
    return item_response(request, db, item)


@router.put("/canvas", response_model=HomepageCanvasResponse, dependencies=[Depends(require_csrf_token)])
def save_canvas(
    payload: HomepageCanvasSaveRequest,
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("homepage:edit")),
) -> HomepageCanvasResponse:
    """Admin-only save for the shared Journey canvas state."""

    state = save_canvas_state(db, payload, actor)
    logger.info("Homepage canvas save route completed: revision=%s user_id=%s", state.revision, actor.id)
    return to_canvas_response(state)


@router.post("/canvas/reset", response_model=HomepageCanvasResponse, dependencies=[Depends(require_csrf_token)])
def reset_canvas(
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("homepage:edit")),
) -> HomepageCanvasResponse:
    """Admin-only reset for the shared Journey canvas state."""

    reset_canvas_state(db, actor, CANVAS_KEY_DEFAULT)
    logger.info("Homepage canvas reset route completed: user_id=%s", actor.id)
    return to_canvas_response(None)
