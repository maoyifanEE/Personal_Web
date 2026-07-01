"""Local-development debug endpoints."""

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.core.diagnostics import sanitize_for_diagnostics, write_jsonl_event

router = APIRouter(prefix="/debug")
MAX_CLIENT_LOG_ENTRIES = 600
MAX_CLIENT_LOG_JSON_CHARS = 1_200_000
MAX_CLIENT_LOG_ENTRY_JSON_CHARS = 20_000


def require_dev_debug(settings: Settings = Depends(get_settings)) -> Settings:
    """Allow debug collection only in local development tools mode."""

    if settings.app_env != "development" or not settings.allow_dev_tools:
        write_jsonl_event(
            "backend",
            "debug.blocked",
            {"appEnv": settings.app_env, "allowDevTools": settings.allow_dev_tools},
        )
        raise HTTPException(status_code=404, detail="Debug endpoints are disabled")
    return settings


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

    entries = payload.get("entries")
    if entries is not None and not isinstance(entries, list):
        raise HTTPException(status_code=400, detail="entries must be a list when provided")
    entry_count = len(entries or [])
    if entry_count > MAX_CLIENT_LOG_ENTRIES:
        raise HTTPException(status_code=413, detail="Too many debug entries")
    payload_size = len(json.dumps(payload, ensure_ascii=False))
    if payload_size > MAX_CLIENT_LOG_JSON_CHARS:
        raise HTTPException(status_code=413, detail="Debug payload is too large")
    for index, entry in enumerate(entries or []):
        entry_size = len(json.dumps(entry, ensure_ascii=False))
        if entry_size > MAX_CLIENT_LOG_ENTRY_JSON_CHARS:
            raise HTTPException(status_code=413, detail=f"Debug entry {index} is too large")
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
