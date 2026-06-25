"""Visitor message service functions."""

import logging
from datetime import datetime, timezone

from sqlalchemy import Select, func, select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.common import DataScope
from app.models.visitor_message import VisitorMessage, VisitorMessageStatus
from app.schemas.visitor_message import VisitorMessageCreate
from app.services.audit_service import write_audit_log

logger = logging.getLogger(__name__)

DEV_CREATE_SCOPES = {DataScope.TEST.value, DataScope.DEMO.value, DataScope.IMPORTED.value}


def resolve_create_data_scope(settings: Settings, requested_scope: DataScope | None) -> str:
    """Resolve safe data_scope for public message creation."""

    if settings.app_env == "production":
        return DataScope.PRODUCTION.value

    scope = (requested_scope or DataScope.TEST).value
    if scope not in DEV_CREATE_SCOPES:
        raise ValueError("development message data_scope must be test, demo, or imported")
    return scope


def create_visitor_message(db: Session, payload: VisitorMessageCreate, settings: Settings) -> VisitorMessage:
    """Create a visitor message and audit the action."""

    data_scope = resolve_create_data_scope(settings, payload.data_scope)
    message = VisitorMessage(
        nickname=payload.nickname,
        contact=payload.contact,
        message=payload.message,
        status=VisitorMessageStatus.NEW.value,
        data_scope=data_scope,
        source_app="messages",
    )
    db.add(message)
    db.flush()
    write_audit_log(
        db,
        action="visitor_message.create",
        source_app="messages",
        target_table="visitor_messages",
        target_id=str(message.id),
        data_scope=data_scope,
        actor_type="anonymous",
        summary="Visitor message created through backend API.",
    )
    db.commit()
    db.refresh(message)
    logger.info("Visitor message created: id=%s data_scope=%s", message.id, data_scope)
    return message


def build_message_query(
    *,
    data_scope: str | None = None,
    status: str | None = None,
    include_deleted: bool = False,
) -> Select[tuple[VisitorMessage]]:
    query = select(VisitorMessage)
    if data_scope:
        query = query.where(VisitorMessage.data_scope == data_scope)
    if status:
        query = query.where(VisitorMessage.status == status)
    if not include_deleted:
        query = query.where(VisitorMessage.deleted_at.is_(None))
    return query.order_by(VisitorMessage.created_at.desc())


def list_visitor_messages(
    db: Session,
    *,
    data_scope: str | None = None,
    status: str | None = None,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[VisitorMessage], int]:
    """List visitor messages for development/admin testing."""

    query = build_message_query(data_scope=data_scope, status=status, include_deleted=include_deleted)
    count_query = select(func.count()).select_from(query.subquery())
    total = db.execute(count_query).scalar_one()
    items = db.execute(query.limit(limit).offset(offset)).scalars().all()
    logger.info("Visitor message list queried: total=%s limit=%s offset=%s", total, limit, offset)
    return items, total


def update_message_status(db: Session, message_id: int, status: VisitorMessageStatus) -> VisitorMessage | None:
    """Update visitor message status for development/admin testing."""

    message = db.get(VisitorMessage, message_id)
    if not message or message.deleted_at is not None:
        return None
    message.status = status.value
    write_audit_log(
        db,
        action="visitor_message.status_update",
        source_app="messages",
        target_table="visitor_messages",
        target_id=str(message.id),
        data_scope=message.data_scope,
        actor_type="dev",
        summary=f"Visitor message status updated to {status.value}.",
    )
    db.commit()
    db.refresh(message)
    logger.info("Visitor message status updated: id=%s status=%s", message_id, status.value)
    return message


def soft_delete_message(db: Session, message_id: int, reason: str = "development soft delete") -> VisitorMessage | None:
    """Soft-delete a visitor message for development/admin testing."""

    message = db.get(VisitorMessage, message_id)
    if not message or message.deleted_at is not None:
        return None
    message.deleted_at = datetime.now(timezone.utc)
    message.deleted_by = "dev"
    message.delete_reason = reason
    write_audit_log(
        db,
        action="visitor_message.soft_delete",
        source_app="messages",
        target_table="visitor_messages",
        target_id=str(message.id),
        data_scope=message.data_scope,
        actor_type="dev",
        summary="Visitor message soft-deleted in development tooling.",
    )
    db.commit()
    db.refresh(message)
    logger.info("Visitor message soft-deleted: id=%s", message_id)
    return message


def seed_dev_messages(db: Session) -> int:
    """Insert safe fake test/demo visitor messages for local development."""

    fake_messages = [
        VisitorMessage(
            nickname="Demo Visitor",
            contact="demo@example.test",
            message="Fake demo message.",
            data_scope=DataScope.DEMO.value,
        ),
        VisitorMessage(
            nickname="Local Tester",
            contact="tester@example.test",
            message="Fake local test message.",
            data_scope=DataScope.TEST.value,
        ),
        VisitorMessage(
            nickname="Import Preview",
            contact=None,
            message="Fake imported preview message.",
            data_scope=DataScope.IMPORTED.value,
        ),
    ]
    db.add_all(fake_messages)
    db.flush()
    for message in fake_messages:
        write_audit_log(
            db,
            action="dev.seed",
            source_app="messages",
            target_table="visitor_messages",
            target_id=str(message.id),
            data_scope=message.data_scope,
            actor_type="dev",
            summary="Fake visitor message seeded for local development.",
        )
    db.commit()
    logger.info("Development seed inserted %s fake visitor messages", len(fake_messages))
    return len(fake_messages)


def reset_dev_test_data(db: Session) -> int:
    """Soft-delete development test/demo/imported visitor messages only."""

    now = datetime.now(timezone.utc)
    result = db.execute(
        update(VisitorMessage)
        .where(
            VisitorMessage.data_scope.in_(
                [
                    DataScope.TEST.value,
                    DataScope.DEMO.value,
                    DataScope.IMPORTED.value,
                ]
            )
        )
        .where(VisitorMessage.deleted_at.is_(None))
        .values(deleted_at=now, deleted_by="dev", delete_reason="development reset-test-data")
    )
    affected = int(result.rowcount or 0)
    write_audit_log(
        db,
        action="dev.reset_test_data",
        source_app="messages",
        target_table="visitor_messages",
        data_scope=DataScope.TEST.value,
        actor_type="dev",
        summary=f"Development reset soft-deleted {affected} test/demo/imported visitor messages.",
    )
    db.commit()
    logger.info("Development reset soft-deleted %s visitor messages", affected)
    return affected


def export_dev_messages(db: Session) -> list[VisitorMessage]:
    """Return current visitor messages for JSON development review."""

    return db.execute(select(VisitorMessage).order_by(VisitorMessage.created_at.desc())).scalars().all()
