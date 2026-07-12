"""Add visitor message management fields.

This migration keeps public message submission privacy-preserving by storing
a server-side fingerprint instead of raw IP address data.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260712_0006"
down_revision: str | None = "20260702_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "visitor_messages",
        sa.Column("is_highlighted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("visitor_messages", sa.Column("highlighted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("visitor_messages", sa.Column("submitter_fingerprint", sa.String(length=128), nullable=True))
    op.create_index("ix_visitor_messages_is_highlighted", "visitor_messages", ["is_highlighted"])
    op.create_index("ix_visitor_messages_submitter_fingerprint", "visitor_messages", ["submitter_fingerprint"])
    op.create_index(
        "ix_visitor_messages_submitter_fingerprint_created_at",
        "visitor_messages",
        ["submitter_fingerprint", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_visitor_messages_submitter_fingerprint_created_at", table_name="visitor_messages")
    op.drop_index("ix_visitor_messages_submitter_fingerprint", table_name="visitor_messages")
    op.drop_index("ix_visitor_messages_is_highlighted", table_name="visitor_messages")
    op.drop_column("visitor_messages", "submitter_fingerprint")
    op.drop_column("visitor_messages", "highlighted_at")
    op.drop_column("visitor_messages", "is_highlighted")
