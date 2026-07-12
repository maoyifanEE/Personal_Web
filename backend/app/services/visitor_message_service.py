"""Visitor message service functions."""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import Select, func, or_, select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_secret
from app.models.auth import AppUser
from app.models.common import DataScope
from app.models.visitor_message import VisitorMessage, VisitorMessageStatus
from app.schemas.visitor_message import VisitorMessageAdminUpdate, VisitorMessageCreate
from app.services.audit_service import write_audit_log

logger = logging.getLogger(__name__)

DEV_CREATE_SCOPES = {DataScope.TEST.value, DataScope.DEMO.value, DataScope.IMPORTED.value}


@dataclass(frozen=True)
class VisitorMessageCreateResult:
    accepted: bool
    created: bool
    honeypot_triggered: bool = False
    rate_limited: bool = False
    retry_after_seconds: int | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def resolve_create_data_scope(settings: Settings, requested_scope: DataScope | None) -> str:
    """Resolve safe data_scope for public message creation."""

    if settings.app_env == "production":
        return DataScope.PRODUCTION.value

    scope = (requested_scope or DataScope.TEST).value
    if scope not in DEV_CREATE_SCOPES:
        raise ValueError("development message data_scope must be test, demo, or imported")
    return scope


def build_submitter_fingerprint(settings: Settings, client_host: str | None) -> str:
    """Hash the client label so raw IP addresses are never stored."""

    normalized_host = (client_host or "unknown").strip().lower() or "unknown"
    return hash_secret(f"visitor-message:{settings.app_env}:{normalized_host}")


def count_recent_submissions(db: Session, fingerprint: str, window_start: datetime) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(VisitorMessage)
            .where(VisitorMessage.submitter_fingerprint == fingerprint)
            .where(VisitorMessage.created_at >= window_start)
        ).scalar_one()
    )


def create_visitor_message(
    db: Session,
    payload: VisitorMessageCreate,
    settings: Settings,
    *,
    client_host: str | None,
) -> VisitorMessageCreateResult:
    """Create a public visitor message without exposing internal storage details."""

    if payload.website:
        logger.info("Visitor message honeypot accepted without persistence")
        return VisitorMessageCreateResult(accepted=True, created=False, honeypot_triggered=True)

    data_scope = resolve_create_data_scope(settings, payload.data_scope)
    fingerprint = build_submitter_fingerprint(settings, client_host)
    if settings.message_rate_limit_enabled:
        window_start = utc_now() - timedelta(seconds=settings.message_rate_limit_window_seconds)
        recent_count = count_recent_submissions(db, fingerprint, window_start)
        if recent_count >= settings.message_rate_limit_max:
            logger.warning("Visitor message rate limit exceeded for fingerprint=%s", fingerprint[:12])
            return VisitorMessageCreateResult(
                accepted=False,
                created=False,
                rate_limited=True,
                retry_after_seconds=settings.message_rate_limit_window_seconds,
            )

    message = VisitorMessage(
        nickname=payload.nickname,
        contact=payload.contact,
        message=payload.message,
        status=VisitorMessageStatus.NEW.value,
        data_scope=data_scope,
        source_app="messages",
        submitter_fingerprint=fingerprint,
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
        summary="Visitor message created through public API.",
    )
    db.commit()
    logger.info("Visitor message created: id=%s data_scope=%s", message.id, data_scope)
    return VisitorMessageCreateResult(accepted=True, created=True)


def build_message_query(
    *,
    data_scope: str | None = None,
    status: str | None = None,
    include_deleted: bool = False,
    highlighted: bool | None = None,
    search: str | None = None,
) -> Select[tuple[VisitorMessage]]:
    query = select(VisitorMessage)
    if data_scope:
        query = query.where(VisitorMessage.data_scope == data_scope)
    if status:
        query = query.where(VisitorMessage.status == status)
    if highlighted is not None:
        query = query.where(VisitorMessage.is_highlighted.is_(highlighted))
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                VisitorMessage.nickname.ilike(pattern),
                VisitorMessage.contact.ilike(pattern),
                VisitorMessage.message.ilike(pattern),
                VisitorMessage.admin_note.ilike(pattern),
            )
        )
    if not include_deleted:
        query = query.where(VisitorMessage.deleted_at.is_(None))
    return query.order_by(VisitorMessage.created_at.desc(), VisitorMessage.id.desc())


def list_visitor_messages(
    db: Session,
    *,
    data_scope: str | None = None,
    status: str | None = None,
    include_deleted: bool = False,
    highlighted: bool | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[VisitorMessage], int]:
    """List visitor messages for protected admin tooling."""

    query = build_message_query(
        data_scope=data_scope,
        status=status,
        include_deleted=include_deleted,
        highlighted=highlighted,
        search=search,
    )
    count_query = select(func.count()).select_from(query.subquery())
    total = db.execute(count_query).scalar_one()
    items = db.execute(query.limit(limit).offset(offset)).scalars().all()
    logger.info("Visitor message admin list queried: total=%s limit=%s offset=%s", total, limit, offset)
    return items, total


def summarize_visitor_messages(db: Session) -> dict[str, int]:
    """Return protected admin summary counts."""

    total = int(db.execute(select(func.count()).select_from(VisitorMessage)).scalar_one())
    deleted = int(
        db.execute(
            select(func.count()).select_from(VisitorMessage).where(VisitorMessage.deleted_at.is_not(None))
        ).scalar_one()
    )
    highlighted = int(
        db.execute(
            select(func.count())
            .select_from(VisitorMessage)
            .where(VisitorMessage.is_highlighted.is_(True), VisitorMessage.deleted_at.is_(None))
        ).scalar_one()
    )
    by_status = {
        status: int(
            db.execute(
                select(func.count())
                .select_from(VisitorMessage)
                .where(VisitorMessage.status == status, VisitorMessage.deleted_at.is_(None))
            ).scalar_one()
        )
        for status in [
            VisitorMessageStatus.NEW.value,
            VisitorMessageStatus.READ.value,
            VisitorMessageStatus.ARCHIVED.value,
        ]
    }
    return {
        "total": total,
        "active": total - deleted,
        "deleted": deleted,
        "new": by_status[VisitorMessageStatus.NEW.value],
        "read": by_status[VisitorMessageStatus.READ.value],
        "archived": by_status[VisitorMessageStatus.ARCHIVED.value],
        "highlighted": highlighted,
    }


def get_visitor_message(db: Session, message_id: int, *, include_deleted: bool = False) -> VisitorMessage | None:
    message = db.get(VisitorMessage, message_id)
    if not message:
        return None
    if message.deleted_at is not None and not include_deleted:
        return None
    return message


def update_message_admin_fields(
    db: Session,
    message_id: int,
    payload: VisitorMessageAdminUpdate,
    actor: AppUser,
) -> VisitorMessage | None:
    """Update visitor message admin-managed fields."""

    message = get_visitor_message(db, message_id, include_deleted=True)
    if not message:
        return None
    if payload.status is not None:
        message.status = payload.status.value
    if payload.is_highlighted is not None:
        message.is_highlighted = payload.is_highlighted
        message.highlighted_at = utc_now() if payload.is_highlighted else None
    if payload.admin_note is not None:
        message.admin_note = payload.admin_note
    message.updated_by = f"user:{actor.id}"
    write_audit_log(
        db,
        action="visitor_message.admin_update",
        source_app="messages",
        target_table="visitor_messages",
        target_id=str(message.id),
        data_scope=message.data_scope,
        actor_type="user",
        actor_id=str(actor.id),
        actor_user_id=actor.id,
        summary="Visitor message admin fields updated.",
    )
    db.commit()
    db.refresh(message)
    logger.info("Visitor message admin-updated: id=%s actor_user_id=%s", message_id, actor.id)
    return message


def soft_delete_message(
    db: Session,
    message_id: int,
    actor: AppUser,
    reason: str = "admin soft delete",
) -> VisitorMessage | None:
    """Soft-delete a visitor message for protected admin tooling."""

    message = get_visitor_message(db, message_id)
    if not message:
        return None
    message.deleted_at = utc_now()
    message.deleted_by = f"user:{actor.id}"
    message.delete_reason = reason
    write_audit_log(
        db,
        action="visitor_message.soft_delete",
        source_app="messages",
        target_table="visitor_messages",
        target_id=str(message.id),
        data_scope=message.data_scope,
        actor_type="user",
        actor_id=str(actor.id),
        actor_user_id=actor.id,
        summary="Visitor message soft-deleted by admin.",
    )
    db.commit()
    db.refresh(message)
    logger.info("Visitor message soft-deleted: id=%s actor_user_id=%s", message_id, actor.id)
    return message


def restore_message(db: Session, message_id: int, actor: AppUser) -> VisitorMessage | None:
    """Restore a soft-deleted visitor message."""

    message = get_visitor_message(db, message_id, include_deleted=True)
    if not message:
        return None
    message.deleted_at = None
    message.deleted_by = None
    message.delete_reason = None
    message.updated_by = f"user:{actor.id}"
    write_audit_log(
        db,
        action="visitor_message.restore",
        source_app="messages",
        target_table="visitor_messages",
        target_id=str(message.id),
        data_scope=message.data_scope,
        actor_type="user",
        actor_id=str(actor.id),
        actor_user_id=actor.id,
        summary="Visitor message restored by admin.",
    )
    db.commit()
    db.refresh(message)
    logger.info("Visitor message restored: id=%s actor_user_id=%s", message_id, actor.id)
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

    now = utc_now()
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
