"""Visitor message ORM model."""

from enum import StrEnum

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import DataManagementMixin, DataScope


class VisitorMessageStatus(StrEnum):
    """Allowed status values for visitor messages."""

    NEW = "new"
    READ = "read"
    ARCHIVED = "archived"


class VisitorMessage(DataManagementMixin, Base):
    """First real business table for local PostgreSQL testing."""

    __tablename__ = "visitor_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nickname: Mapped[str] = mapped_column(String(80), nullable=False)
    contact: Mapped[str | None] = mapped_column(String(120), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default=VisitorMessageStatus.NEW.value, nullable=False, index=True)
    data_scope: Mapped[str] = mapped_column(String(24), default=DataScope.TEST.value, nullable=False, index=True)
    source_app: Mapped[str] = mapped_column(String(80), default="messages", nullable=False, index=True)
