"""Create visitor_messages and audit_logs baseline tables.

This is the first baseline migration for the local PostgreSQL backend.
Future auth and app tables will be added in later phases.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260624_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "visitor_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nickname", sa.String(length=80), nullable=False),
        sa.Column("contact", sa.String(length=120), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="new"),
        sa.Column("data_scope", sa.String(length=24), nullable=False, server_default="test"),
        sa.Column("source_app", sa.String(length=80), nullable=False, server_default="messages"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.String(length=120), nullable=True),
        sa.Column("updated_by", sa.String(length=120), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.String(length=120), nullable=True),
        sa.Column("delete_reason", sa.Text(), nullable=True),
        sa.Column("admin_note", sa.Text(), nullable=True),
    )
    op.create_index("ix_visitor_messages_id", "visitor_messages", ["id"])
    op.create_index("ix_visitor_messages_status", "visitor_messages", ["status"])
    op.create_index("ix_visitor_messages_data_scope", "visitor_messages", ["data_scope"])
    op.create_index("ix_visitor_messages_source_app", "visitor_messages", ["source_app"])
    op.create_index("ix_visitor_messages_deleted_at", "visitor_messages", ["deleted_at"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("source_app", sa.String(length=80), nullable=False),
        sa.Column("target_table", sa.String(length=120), nullable=True),
        sa.Column("target_id", sa.String(length=120), nullable=True),
        sa.Column("data_scope", sa.String(length=24), nullable=False, server_default="test"),
        sa.Column("actor_type", sa.String(length=40), nullable=False, server_default="system"),
        sa.Column("actor_id", sa.String(length=120), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_logs_id", "audit_logs", ["id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_source_app", "audit_logs", ["source_app"])
    op.create_index("ix_audit_logs_data_scope", "audit_logs", ["data_scope"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_data_scope", table_name="audit_logs")
    op.drop_index("ix_audit_logs_source_app", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_visitor_messages_deleted_at", table_name="visitor_messages")
    op.drop_index("ix_visitor_messages_source_app", table_name="visitor_messages")
    op.drop_index("ix_visitor_messages_data_scope", table_name="visitor_messages")
    op.drop_index("ix_visitor_messages_status", table_name="visitor_messages")
    op.drop_index("ix_visitor_messages_id", table_name="visitor_messages")
    op.drop_table("visitor_messages")
