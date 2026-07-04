"""Local-development debug endpoints."""

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.api.dependencies import require_csrf_token, require_permission
from app.core.config import Settings, get_settings
from app.core.diagnostics import sanitize_for_diagnostics, write_jsonl_event
from app.models.auth import AppUser
from app.services.debug_bundle_service import create_debug_bundle

router = APIRouter(prefix="/debug")
MAX_CLIENT_LOG_ENTRIES = 2_000
MAX_CLIENT_LOG_JSON_CHARS = 1_200_000
MAX_CLIENT_LOG_ENTRY_JSON_CHARS = 20_000
MAX_EXPORT_BUNDLE_JSON_CHARS = 1_500_000


def require_dev_debug(settings: Settings = Depends(get_settings)) -> Settings:
    """Allow debug collection only in local development tools mode."""

    if settings.app_env != "development" or not settings.allow_dev_tools:
        write_jsonl_event(
            "backend",
            "debug.bundle_export.rejected_non_dev",
            {"appEnv": settings.app_env, "allowDevTools": settings.allow_dev_tools},
        )
        raise HTTPException(status_code=404, detail="Debug endpoints are disabled")
    return settings


def validate_debug_payload(payload: dict[str, Any], *, max_json_chars: int) -> int:
    """Validate client debug payload size and return frontend entry count."""

    entries = payload.get("entries")
    if entries is not None and not isinstance(entries, list):
        raise HTTPException(status_code=400, detail="entries must be a list when provided")
    entry_count = len(entries or [])
    if entry_count > MAX_CLIENT_LOG_ENTRIES:
        write_jsonl_event("backend", "debug.bundle_export.payload_too_large", {"entryCount": entry_count})
        raise HTTPException(status_code=413, detail="Too many debug entries")
    payload_size = len(json.dumps(payload, ensure_ascii=False))
    if payload_size > max_json_chars:
        write_jsonl_event("backend", "debug.bundle_export.payload_too_large", {"payloadSize": payload_size})
        raise HTTPException(status_code=413, detail="Debug payload is too large")
    for index, entry in enumerate(entries or []):
        entry_size = len(json.dumps(entry, ensure_ascii=False))
        if entry_size > MAX_CLIENT_LOG_ENTRY_JSON_CHARS:
            write_jsonl_event(
                "backend",
                "debug.bundle_export.payload_too_large",
                {"entryIndex": index, "entrySize": entry_size},
            )
            raise HTTPException(status_code=413, detail=f"Debug entry {index} is too large")
    return entry_count


@router.get("/status")
def debug_status(settings: Settings = Depends(require_dev_debug)) -> dict[str, Any]:
    """Return local debug endpoint readiness."""

    write_jsonl_event("backend", "debug.status", {"appEnv": settings.app_env})
    return {
        "ok": True,
        "appEnv": settings.app_env,
        "allowDevTools": settings.allow_dev_tools,
        "message": "Local debug endpoints are enabled.",
    }


@router.post("/client-log")
async def receive_client_log(
    payload: dict[str, Any],
    settings: Settings = Depends(require_dev_debug),
) -> dict[str, Any]:
    """Accept sanitized frontend debug logs for local troubleshooting."""

    entry_count = validate_debug_payload(payload, max_json_chars=MAX_CLIENT_LOG_JSON_CHARS)
    safe_payload = sanitize_for_diagnostics(payload)
    write_jsonl_event(
        "frontend",
        "client-log.received",
        {
            "entryCount": entry_count,
            "sessionId": safe_payload.get("sessionId"),
            "page": safe_payload.get("page"),
            "location": safe_payload.get("location"),
            "payload": safe_payload,
            "appEnv": settings.app_env,
        },
    )
    return {"ok": True, "entryCount": entry_count}


@router.post("/export-bundle", dependencies=[Depends(require_csrf_token)])
async def export_debug_bundle(
    payload: dict[str, Any],
    settings: Settings = Depends(require_dev_debug),
    actor: AppUser = Depends(require_permission("admin:access")),
) -> FileResponse:
    """Create and return an admin-only local-development debug bundle zip."""

    write_jsonl_event(
        "backend",
        "debug.bundle_export.start",
        {"appEnv": settings.app_env, "actorUserId": actor.id},
    )
    try:
        entry_count = validate_debug_payload(payload, max_json_chars=MAX_EXPORT_BUNDLE_JSON_CHARS)
        write_jsonl_event(
            "backend",
            "debug.bundle_export.client_logs_received",
            {"entryCount": entry_count},
        )
        zip_path, filename = create_debug_bundle(payload)
        write_jsonl_event(
            "backend",
            "debug.bundle_export.zip_created",
            {"filename": filename, "bytes": zip_path.stat().st_size, "actorUserId": actor.id},
        )
        write_jsonl_event(
            "backend",
            "debug.bundle_export.success",
            {"filename": filename, "actorUserId": actor.id},
        )
        return FileResponse(
            path=zip_path,
            media_type="application/zip",
            filename=filename,
        )
    except HTTPException:
        raise
    except Exception as error:
        write_jsonl_event("backend", "debug.bundle_export.exception", {"error": str(error)})
        raise HTTPException(status_code=500, detail="Failed to create debug bundle") from error
