"""Audit log ORM model for backend data actions."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import DataScope


class AuditLog(Base):
    """Simple audit foundation for future admin data center work."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    source_app: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    target_table: Mapped[str | None] = mapped_column(String(120), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    data_scope: Mapped[str] = mapped_column(String(24), default=DataScope.TEST.value, nullable=False, index=True)
    actor_type: Mapped[str] = mapped_column(String(40), default="system", nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
