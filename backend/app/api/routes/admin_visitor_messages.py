"""Protected admin visitor message routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import require_csrf_token, require_permission, require_role
from app.db.session import get_db_session
from app.models.auth import AppUser
from app.models.common import DataScope
from app.models.visitor_message import VisitorMessageStatus
from app.schemas.visitor_message import (
    VisitorMessageAdminRead,
    VisitorMessageAdminUpdate,
    VisitorMessageListResponse,
    VisitorMessageSoftDeleteRequest,
    VisitorMessageSummaryResponse,
)
from app.services.visitor_message_service import (
    get_visitor_message,
    list_visitor_messages,
    restore_message,
    soft_delete_message,
    summarize_visitor_messages,
    update_message_admin_fields,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/messages")


def require_admin_role(_: AppUser = Depends(require_role("admin"))) -> None:
    """Require the admin role in addition to granular permissions."""


@router.get("/summary", response_model=VisitorMessageSummaryResponse)
def message_summary(
    db: Session = Depends(get_db_session),
    _: None = Depends(require_admin_role),
    actor: AppUser = Depends(require_permission("visitor_messages:read")),
) -> VisitorMessageSummaryResponse:
    """Return admin visitor message counts."""

    logger.info("Visitor message summary requested by user_id=%s", actor.id)
    return VisitorMessageSummaryResponse(**summarize_visitor_messages(db))


@router.get("", response_model=VisitorMessageListResponse)
def list_messages(
    data_scope: DataScope | None = None,
    status: VisitorMessageStatus | None = None,
    include_deleted: bool = False,
    highlighted: bool | None = None,
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db_session),
    _: None = Depends(require_admin_role),
    actor: AppUser = Depends(require_permission("visitor_messages:read")),
) -> VisitorMessageListResponse:
    """List visitor messages for authenticated admins."""

    items, total = list_visitor_messages(
        db,
        data_scope=data_scope.value if data_scope else None,
        status=status.value if status else None,
        include_deleted=include_deleted,
        highlighted=highlighted,
        search=search,
        limit=limit,
        offset=offset,
    )
    logger.info("Visitor message list returned to user_id=%s total=%s", actor.id, total)
    return VisitorMessageListResponse(
        items=[VisitorMessageAdminRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{message_id}", response_model=VisitorMessageAdminRead)
def get_message(
    message_id: int,
    include_deleted: bool = False,
    db: Session = Depends(get_db_session),
    _: None = Depends(require_admin_role),
    actor: AppUser = Depends(require_permission("visitor_messages:read")),
) -> VisitorMessageAdminRead:
    """Return a single visitor message for authenticated admins."""

    message = get_visitor_message(db, message_id, include_deleted=include_deleted)
    if not message:
        raise HTTPException(status_code=404, detail="Visitor message not found")
    logger.info("Visitor message detail returned to user_id=%s message_id=%s", actor.id, message_id)
    return VisitorMessageAdminRead.model_validate(message)


@router.patch(
    "/{message_id}",
    response_model=VisitorMessageAdminRead,
    dependencies=[Depends(require_csrf_token)],
)
def update_message(
    message_id: int,
    payload: VisitorMessageAdminUpdate,
    db: Session = Depends(get_db_session),
    _: None = Depends(require_admin_role),
    actor: AppUser = Depends(require_permission("visitor_messages:manage")),
) -> VisitorMessageAdminRead:
    """Update admin-managed visitor message fields."""

    message = update_message_admin_fields(db, message_id, payload, actor)
    if not message:
        raise HTTPException(status_code=404, detail="Visitor message not found")
    return VisitorMessageAdminRead.model_validate(message)


@router.delete(
    "/{message_id}",
    response_model=VisitorMessageAdminRead,
    dependencies=[Depends(require_csrf_token)],
)
def delete_message(
    message_id: int,
    payload: VisitorMessageSoftDeleteRequest | None = None,
    db: Session = Depends(get_db_session),
    _: None = Depends(require_admin_role),
    actor: AppUser = Depends(require_permission("visitor_messages:manage")),
) -> VisitorMessageAdminRead:
    """Soft-delete a visitor message. Permanent purge is intentionally absent."""

    reason = payload.reason if payload and payload.reason else "admin soft delete"
    message = soft_delete_message(db, message_id, actor, reason)
    if not message:
        raise HTTPException(status_code=404, detail="Visitor message not found")
    return VisitorMessageAdminRead.model_validate(message)


@router.post(
    "/{message_id}/restore",
    response_model=VisitorMessageAdminRead,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_csrf_token)],
)
def restore_deleted_message(
    message_id: int,
    db: Session = Depends(get_db_session),
    _: None = Depends(require_admin_role),
    actor: AppUser = Depends(require_permission("visitor_messages:manage")),
) -> VisitorMessageAdminRead:
    """Restore a soft-deleted visitor message."""

    message = restore_message(db, message_id, actor)
    if not message:
        raise HTTPException(status_code=404, detail="Visitor message not found")
    return VisitorMessageAdminRead.model_validate(message)
