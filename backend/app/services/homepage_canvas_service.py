"""Service helpers for shared Homepage/Journey canvas persistence."""

import logging
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth import AppUser
from app.models.homepage_canvas import HomepageCanvasState
from app.schemas.homepage import CANVAS_KEY_DEFAULT, HomepageCanvasSaveRequest
from app.core.diagnostics import write_jsonl_event
from app.services.audit_service import write_audit_log

logger = logging.getLogger(__name__)


def contains_data_url(value: Any) -> bool:
    """Return True when a nested canvas payload includes a data: URL."""

    if isinstance(value, str):
        return value.strip().lower().startswith("data:")
    if isinstance(value, list):
        return any(contains_data_url(item) for item in value)
    if isinstance(value, dict):
        return any(contains_data_url(item) for item in value.values())
    return False


def get_canvas_state(db: Session, canvas_key: str = CANVAS_KEY_DEFAULT) -> HomepageCanvasState | None:
    """Read the current shared canvas row by key."""

    state = db.execute(
        select(HomepageCanvasState).where(HomepageCanvasState.canvas_key == canvas_key)
    ).scalar_one_or_none()
    logger.info("Homepage canvas state read: key=%s exists=%s", canvas_key, bool(state))
    write_jsonl_event(
        "backend",
        "homepage.canvas.read",
        {"canvasKey": canvas_key, "exists": bool(state), "revision": getattr(state, "revision", 0)},
    )
    return state


def save_canvas_state(
    db: Session,
    payload: HomepageCanvasSaveRequest,
    actor: AppUser,
) -> HomepageCanvasState:
    """Create or update the shared Journey canvas JSONB row."""

    if contains_data_url(payload.canvas_data):
        logger.warning("Rejected homepage canvas save with data URL: user_id=%s", actor.id)
        write_jsonl_event(
            "backend",
            "homepage.canvas.save.rejected_data_url",
            {"userId": actor.id, "canvasKey": payload.canvas_key},
        )
        raise HTTPException(
            status_code=400,
            detail="Canvas contains Data URL images; database image persistence is not supported yet.",
        )

    state = get_canvas_state(db, payload.canvas_key)
    if state and payload.base_revision is not None and payload.base_revision != state.revision:
        logger.warning(
            "Rejected stale homepage canvas save: user_id=%s base_revision=%s current_revision=%s",
            actor.id,
            payload.base_revision,
            state.revision,
        )
        write_jsonl_event(
            "backend",
            "homepage.canvas.save.conflict",
            {
                "userId": actor.id,
                "canvasKey": payload.canvas_key,
                "baseRevision": payload.base_revision,
                "currentRevision": state.revision,
            },
        )
        raise HTTPException(status_code=409, detail="Canvas revision conflict. Reload before saving.")

    if not state:
        state = HomepageCanvasState(
            canvas_key=payload.canvas_key,
            schema_version=payload.schema_version,
            canvas_data=payload.canvas_data,
            revision=1,
            updated_by_user_id=actor.id,
        )
        db.add(state)
        action = "homepage_canvas.create"
    else:
        state.schema_version = payload.schema_version
        state.canvas_data = payload.canvas_data
        state.revision += 1
        state.updated_by_user_id = actor.id
        action = "homepage_canvas.update"

    db.flush()
    write_audit_log(
        db,
        action=action,
        source_app="homepage",
        target_table="homepage_canvas_states",
        target_id=str(state.id),
        actor_type="user",
        actor_id=str(actor.id),
        actor_user_id=actor.id,
        summary="Admin saved shared Homepage/Journey canvas state.",
    )
    db.commit()
    db.refresh(state)
    logger.info(
        "Homepage canvas state saved: key=%s revision=%s user_id=%s",
        state.canvas_key,
        state.revision,
        actor.id,
    )
    write_jsonl_event(
        "backend",
        "homepage.canvas.saved",
        {"userId": actor.id, "canvasKey": state.canvas_key, "revision": state.revision, "action": action},
    )
    return state


def reset_canvas_state(
    db: Session,
    actor: AppUser,
    canvas_key: str = CANVAS_KEY_DEFAULT,
) -> HomepageCanvasState | None:
    """Delete the shared Journey canvas row so public preview falls back to local/default state."""

    state = get_canvas_state(db, canvas_key)
    if not state:
        write_jsonl_event(
            "backend",
            "homepage.canvas.reset.empty",
            {"userId": actor.id, "canvasKey": canvas_key},
        )
        return None

    state_id = state.id
    revision = state.revision
    db.delete(state)
    write_audit_log(
        db,
        action="homepage_canvas.reset",
        source_app="homepage",
        target_table="homepage_canvas_states",
        target_id=str(state_id),
        actor_type="user",
        actor_id=str(actor.id),
        actor_user_id=actor.id,
        summary="Admin reset shared Homepage/Journey canvas state.",
    )
    db.commit()
    logger.info("Homepage canvas state reset: key=%s revision=%s user_id=%s", canvas_key, revision, actor.id)
    write_jsonl_event(
        "backend",
        "homepage.canvas.reset",
        {"userId": actor.id, "canvasKey": canvas_key, "previousRevision": revision},
    )
    return state
