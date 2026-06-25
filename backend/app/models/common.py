"""Shared model fields and enums for business data tables."""

from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class DataScope(StrEnum):
    """Project-wide data classification values."""

    PRODUCTION = "production"
    TEST = "test"
    DEMO = "demo"
    IMPORTED = "imported"


class TimestampMixin:
    """Created and updated timestamps for mutable records."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class DataManagementMixin(TimestampMixin):
    """Common metadata for future admin data management."""

    data_scope: Mapped[str] = mapped_column(String(24), default=DataScope.TEST.value, nullable=False, index=True)
    source_app: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    created_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    deleted_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    delete_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
