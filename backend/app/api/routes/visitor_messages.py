"""Visitor message API routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.common import DataScope
from app.models.visitor_message import VisitorMessageStatus
from app.schemas.visitor_message import (
    VisitorMessageCreate,
    VisitorMessageCreateResponse,
    VisitorMessageListResponse,
    VisitorMessageRead,
    VisitorMessageStatusUpdate,
)
from app.services.visitor_message_service import (
    create_visitor_message,
    list_visitor_messages,
    soft_delete_message,
    update_message_status,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/messages")


def require_dev_admin_access(settings: Settings) -> None:
    """Block admin-like message actions until real production auth exists."""

    if not settings.dev_tools_enabled:
        logger.warning("Blocked visitor message admin/dev route in env=%s", settings.app_env)
        raise HTTPException(status_code=403, detail="Admin message tooling is disabled until real auth exists")


@router.post("", response_model=VisitorMessageCreateResponse, status_code=201)
def create_message(
    payload: VisitorMessageCreate,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> VisitorMessageCreateResponse:
    """Create a visitor message in PostgreSQL for backend foundation testing."""

    try:
        message = create_visitor_message(db, payload, settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return VisitorMessageCreateResponse(
        id=message.id,
        status=message.status,
        data_scope=message.data_scope,
        created_at=message.created_at,
    )


@router.get("", response_model=VisitorMessageListResponse)
def list_messages(
    data_scope: DataScope | None = None,
    status: VisitorMessageStatus | None = None,
    include_deleted: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> VisitorMessageListResponse:
    """Development-only message list until admin authentication exists."""

    require_dev_admin_access(settings)
    items, total = list_visitor_messages(
        db,
        data_scope=data_scope.value if data_scope else None,
        status=status.value if status else None,
        include_deleted=include_deleted,
        limit=limit,
        offset=offset,
    )
    return VisitorMessageListResponse(
        items=[VisitorMessageRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch("/{message_id}/status", response_model=VisitorMessageRead)
def update_status(
    message_id: int,
    payload: VisitorMessageStatusUpdate,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> VisitorMessageRead:
    """Development-only status update until admin authentication exists."""

    require_dev_admin_access(settings)
    message = update_message_status(db, message_id, payload.status)
    if not message:
        raise HTTPException(status_code=404, detail="Visitor message not found")
    return VisitorMessageRead.model_validate(message)


@router.post("/{message_id}/soft-delete", response_model=VisitorMessageRead)
def soft_delete(
    message_id: int,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> VisitorMessageRead:
    """Development-only soft delete until admin authentication exists."""

    require_dev_admin_access(settings)
    message = soft_delete_message(db, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Visitor message not found")
    return VisitorMessageRead.model_validate(message)
