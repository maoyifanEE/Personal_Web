"""Homepage/Journey canvas persistence model."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class HomepageCanvasState(Base):
    """Single-key JSONB state for the shared Journey canvas."""

    __tablename__ = "homepage_canvas_states"
    __table_args__ = (UniqueConstraint("canvas_key", name="uq_homepage_canvas_states_canvas_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    canvas_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    schema_version: Mapped[str] = mapped_column(String(80), nullable=False)
    canvas_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
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
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("app_users.id"), nullable=True, index=True)
