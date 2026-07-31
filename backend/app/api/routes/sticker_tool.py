"""Local-only Sticker_Preprocessor bridge routes."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_session, get_optional_current_user
from app.core.config import Settings, get_settings
from app.core.diagnostics import write_jsonl_event
from app.db.session import get_db_session
from app.models.auth import AppUser
from app.services import sticker_tool_service as service
from app.services.auth_service import validate_csrf
from app.services.rbac_service import user_has_permission

router = APIRouter(prefix="/sticker-tool")


def require_local_sticker_tool(
    request: Request,
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db_session),
    user: AppUser | None = Depends(get_optional_current_user),
    session=Depends(get_current_session),
) -> AppUser:
    """Allow the bridge only for local development admins/editors."""

    if settings.app_env != "development" or not settings.allow_dev_tools:
        raise HTTPException(status_code=404, detail="Not found")
    if settings.personal_web_data_profile not in service.SUPPORTED_PROFILES:
        raise HTTPException(status_code=404, detail="Not found")
    client_host = request.client.host if request.client else ""
    if client_host not in {"127.0.0.1", "::1", "localhost"}:
        write_jsonl_event("sticker-tool", "sticker_tool.route.non_loopback_rejected", {"client": client_host})
        raise HTTPException(status_code=403, detail="Local access required")
    if not user or not session:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not user_has_permission(db, user, "homepage:edit"):
        raise HTTPException(status_code=403, detail="Permission denied")
    if request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
        csrf_token = request.headers.get(settings.csrf_header_name)
        if not validate_csrf(session, csrf_token):
            raise HTTPException(status_code=403, detail="CSRF token required")
    return user


def raise_service_error(error: service.StickerToolError) -> None:
    write_jsonl_event("sticker-tool", "sticker_tool.route.error", {"code": error.code})
    raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message}) from error


@router.get("/status")
def read_status(
    settings: Settings = Depends(get_settings),
    _: AppUser = Depends(require_local_sticker_tool),
) -> dict[str, Any]:
    try:
        return service.status_payload(settings)
    except service.StickerToolError as error:
        raise_service_error(error)


@router.post("/config")
def save_tool_config(
    payload: dict[str, str],
    _: AppUser = Depends(require_local_sticker_tool),
) -> dict[str, Any]:
    try:
        tool_root = payload.get("toolRoot")
        if not tool_root:
            raise service.StickerToolError("TOOL_ROOT_REQUIRED", "请输入工具目录。")
        resolved = service.validate_tool_root(Path(tool_root))
        service.get_capabilities(resolved)
        return service.save_config(resolved, source="user")
    except service.StickerToolError as error:
        raise_service_error(error)


@router.delete("/config")
def clear_tool_config(_: AppUser = Depends(require_local_sticker_tool)) -> dict[str, bool]:
    service.clear_config()
    return {"ok": True}


@router.get("/capabilities")
def read_capabilities(_: AppUser = Depends(require_local_sticker_tool)) -> dict[str, Any]:
    try:
        root, _source = service.resolve_configured_tool_root()
        if root is None:
            raise service.StickerToolError("TOOL_NOT_CONFIGURED", "请先配置 Sticker_Preprocessor。")
        return service.safe_capabilities(service.get_capabilities(root))
    except service.StickerToolError as error:
        raise_service_error(error)


@router.post("/runs")
async def create_run(
    file: UploadFile = File(...),
    mode: str = Form(default="auto"),
    ai_model: str = Form(default="silueta"),
    alpha_matting: bool = Form(default=False),
    padding_pixels: int = Form(default=8),
    alpha_crop_threshold: int = Form(default=8),
    settings: Settings = Depends(get_settings),
    _: AppUser = Depends(require_local_sticker_tool),
) -> dict[str, Any]:
    try:
        content = await file.read()
        return service.create_bridge_run(
            content,
            file.filename or "source.png",
            file.content_type,
            {
                "mode": mode,
                "aiModel": ai_model,
                "alphaMatting": alpha_matting,
                "paddingPixels": padding_pixels,
                "alphaCropThreshold": alpha_crop_threshold,
            },
            data_profile=settings.personal_web_data_profile,
        )
    except service.StickerToolError as error:
        raise_service_error(error)


@router.get("/runs/{bridge_run_id}")
def read_run(bridge_run_id: str, _: AppUser = Depends(require_local_sticker_tool)) -> dict[str, Any]:
    try:
        return service.public_run_payload(service.get_run_state(bridge_run_id))
    except service.StickerToolError as error:
        raise_service_error(error)


@router.post("/runs/{bridge_run_id}/review")
def review_run(
    bridge_run_id: str,
    payload: dict[str, str],
    _: AppUser = Depends(require_local_sticker_tool),
) -> dict[str, Any]:
    try:
        return service.record_review(bridge_run_id, payload.get("verdict", ""))
    except service.StickerToolError as error:
        raise_service_error(error)


@router.get("/runs/{bridge_run_id}/output")
def read_output(bridge_run_id: str, _: AppUser = Depends(require_local_sticker_tool)) -> FileResponse:
    try:
        path = service.output_path_for_run(bridge_run_id)
        write_jsonl_event("sticker-tool", "sticker_tool.output.downloaded", {"bridgeRunId": bridge_run_id})
        return FileResponse(path, media_type="image/png", filename="processed.png")
    except service.StickerToolError as error:
        raise_service_error(error)


@router.post("/runs/{bridge_run_id}/diagnostic-bundle")
def create_bundle(bridge_run_id: str, _: AppUser = Depends(require_local_sticker_tool)) -> FileResponse:
    try:
        path, filename = service.create_integration_bundle(bridge_run_id)
        return FileResponse(path, media_type="application/zip", filename=filename)
    except service.StickerToolError as error:
        raise_service_error(error)
