"""Add homepage media and display item tables.

This migration creates the first database-backed homepage media foundation.
It does not seed content and does not alter existing tables.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260702_0005"
down_revision: str | None = "20260630_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "homepage_media",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("media_type", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_filename", sa.String(length=255), nullable=False),
        sa.Column("relative_path", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("stored_filename", name="uq_homepage_media_stored_filename"),
        sa.UniqueConstraint("relative_path", name="uq_homepage_media_relative_path"),
    )
    op.create_index("ix_homepage_media_id", "homepage_media", ["id"])
    op.create_index("ix_homepage_media_media_type", "homepage_media", ["media_type"])
    op.create_index("ix_homepage_media_sort_order", "homepage_media", ["sort_order"])
    op.create_index("ix_homepage_media_is_enabled", "homepage_media", ["is_enabled"])
    op.create_index("ix_homepage_media_checksum_sha256", "homepage_media", ["checksum_sha256"])

    op.create_table(
        "homepage_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("subtitle", sa.String(length=220), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location_label", sa.String(length=160), nullable=True),
        sa.Column("time_label", sa.String(length=160), nullable=True),
        sa.Column("media_id", sa.Integer(), nullable=True),
        sa.Column("display_type", sa.String(length=32), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["media_id"], ["homepage_media.id"]),
    )
    op.create_index("ix_homepage_items_id", "homepage_items", ["id"])
    op.create_index("ix_homepage_items_media_id", "homepage_items", ["media_id"])
    op.create_index("ix_homepage_items_display_type", "homepage_items", ["display_type"])
    op.create_index("ix_homepage_items_sort_order", "homepage_items", ["sort_order"])
    op.create_index("ix_homepage_items_is_visible", "homepage_items", ["is_visible"])


def downgrade() -> None:
    op.drop_index("ix_homepage_items_is_visible", table_name="homepage_items")
    op.drop_index("ix_homepage_items_sort_order", table_name="homepage_items")
    op.drop_index("ix_homepage_items_display_type", table_name="homepage_items")
    op.drop_index("ix_homepage_items_media_id", table_name="homepage_items")
    op.drop_index("ix_homepage_items_id", table_name="homepage_items")
    op.drop_table("homepage_items")

    op.drop_index("ix_homepage_media_checksum_sha256", table_name="homepage_media")
    op.drop_index("ix_homepage_media_is_enabled", table_name="homepage_media")
    op.drop_index("ix_homepage_media_sort_order", table_name="homepage_media")
    op.drop_index("ix_homepage_media_media_type", table_name="homepage_media")
    op.drop_index("ix_homepage_media_id", table_name="homepage_media")
    op.drop_table("homepage_media")
