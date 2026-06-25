"""Development-only admin data foundation endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.audit_log import AuditLog
from app.models.visitor_message import VisitorMessage
from app.schemas.admin_data import AdminDataSummary

logger = logging.getLogger(__name__)
router = APIRouter()


def require_admin_summary_access(settings: Settings) -> None:
    """Block admin data foundation routes outside development tools mode."""

    if not settings.dev_tools_enabled:
        logger.warning("Blocked admin data summary in env=%s", settings.app_env)
        raise HTTPException(status_code=403, detail="Admin data summary is disabled until real auth exists")


def grouped_counts(db: Session, column) -> dict[str, int]:
    rows = db.execute(select(column, func.count()).group_by(column)).all()
    return {str(key): int(count) for key, count in rows}


@router.get("/summary", response_model=AdminDataSummary)
def summary(
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AdminDataSummary:
    """Return development-only counts for future admin data center planning."""

    require_admin_summary_access(settings)
    total = db.execute(select(func.count()).select_from(VisitorMessage)).scalar_one()
    deleted = db.execute(
        select(func.count()).select_from(VisitorMessage).where(VisitorMessage.deleted_at.is_not(None))
    ).scalar_one()
    audit_total = db.execute(select(func.count()).select_from(AuditLog)).scalar_one()
    return AdminDataSummary(
        visitor_message_total=int(total),
        visitor_message_by_data_scope=grouped_counts(db, VisitorMessage.data_scope),
        visitor_message_by_status=grouped_counts(db, VisitorMessage.status),
        soft_deleted_count=int(deleted),
        audit_log_count=int(audit_total),
    )
