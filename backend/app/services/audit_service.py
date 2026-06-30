"""Audit log service."""

import logging

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def write_audit_log(
    db: Session,
    *,
    action: str,
    source_app: str,
    summary: str,
    target_table: str | None = None,
    target_id: str | None = None,
    data_scope: str = "test",
    actor_type: str = "system",
    actor_id: str | None = None,
    actor_user_id: int | None = None,
) -> AuditLog:
    """Create an audit log row for development and future admin actions."""

    log = AuditLog(
        action=action,
        source_app=source_app,
        target_table=target_table,
        target_id=target_id,
        data_scope=data_scope,
        actor_type=actor_type,
        actor_id=actor_id,
        actor_user_id=actor_user_id,
        summary=summary,
    )
    db.add(log)
    logger.info("Audit log queued: action=%s source_app=%s target=%s", action, source_app, target_id)
    return log
