"""Homepage and Journey canvas API routes."""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import require_csrf_token, require_permission
from app.db.session import get_db_session
from app.models.auth import AppUser
from app.models.homepage_canvas import HomepageCanvasState
from app.schemas.homepage import CANVAS_KEY_DEFAULT, HomepageCanvasResponse, HomepageCanvasSaveRequest
from app.services.homepage_canvas_service import get_canvas_state, save_canvas_state

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/homepage")


def to_canvas_response(state: HomepageCanvasState | None) -> HomepageCanvasResponse:
    """Convert a canvas row or missing row into the public response shape."""

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


@router.get("/canvas", response_model=HomepageCanvasResponse)
def read_canvas(db: Session = Depends(get_db_session)) -> HomepageCanvasResponse:
    """Publicly read the current shared Journey canvas state."""

    state = get_canvas_state(db, CANVAS_KEY_DEFAULT)
    return to_canvas_response(state)


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
