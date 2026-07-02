"""Add homepage canvas state storage.

This migration creates the JSONB table used by the local Journey canvas
database persistence v1. It intentionally does not seed homepage content.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260630_0004"
down_revision: str | None = "20260629_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "homepage_canvas_states",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("canvas_key", sa.String(length=80), nullable=False),
        sa.Column("schema_version", sa.String(length=80), nullable=False),
        sa.Column("canvas_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["app_users.id"]),
        sa.UniqueConstraint("canvas_key", name="uq_homepage_canvas_states_canvas_key"),
    )
    op.create_index("ix_homepage_canvas_states_id", "homepage_canvas_states", ["id"])
    op.create_index("ix_homepage_canvas_states_canvas_key", "homepage_canvas_states", ["canvas_key"])
    op.create_index(
        "ix_homepage_canvas_states_updated_by_user_id",
        "homepage_canvas_states",
        ["updated_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_homepage_canvas_states_updated_by_user_id", table_name="homepage_canvas_states")
    op.drop_index("ix_homepage_canvas_states_canvas_key", table_name="homepage_canvas_states")
    op.drop_index("ix_homepage_canvas_states_id", table_name="homepage_canvas_states")
    op.drop_table("homepage_canvas_states")
