"""Add auth sessions and Auth/RBAC v1 permissions.

This migration adds session storage and static role/permission definitions only.
It intentionally does not create local development users or passwords.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260629_0003"
down_revision: str | None = "20260625_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("app_users", sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("session_token_hash", sa.String(length=128), nullable=False),
        sa.Column("csrf_token_hash", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip_hash", sa.String(length=128), nullable=True),
        sa.Column("user_agent_hash", sa.String(length=128), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["app_users.id"]),
        sa.UniqueConstraint("session_token_hash", name="uq_auth_sessions_session_token_hash"),
    )
    op.create_index("ix_auth_sessions_id", "auth_sessions", ["id"])
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_session_token_hash", "auth_sessions", ["session_token_hash"])
    op.create_index("ix_auth_sessions_created_at", "auth_sessions", ["created_at"])
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])
    op.create_index("ix_auth_sessions_revoked_at", "auth_sessions", ["revoked_at"])

    seed_auth_v1_roles_permissions()


def seed_auth_v1_roles_permissions() -> None:
    """Seed static role and permission definitions for Auth/RBAC v1."""

    op.execute(
        """
        INSERT INTO roles (role_key, display_name, description, is_system, status)
        VALUES
        (
            'user',
            'User',
            'Normal authenticated user role for private app shells.',
            true,
            'active'
        )
        ON CONFLICT (role_key) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            description = EXCLUDED.description,
            status = 'active';
        """
    )
    op.execute(
        """
        INSERT INTO permissions (permission_key, resource, action, description, is_system)
        VALUES
        (
            'homepage:view',
            'homepage',
            'view',
            'View public homepage and public Journey page.',
            true
        ),
        (
            'homepage:edit',
            'homepage',
            'edit',
            'Edit homepage or Journey local prototype controls.',
            true
        ),
        (
            'apps:access',
            'apps',
            'access',
            'Access authenticated private app shells.',
            true
        ),
        (
            'users:manage',
            'users',
            'manage',
            'Manage local development users.',
            true
        ),
        (
            'admin:access',
            'admin',
            'access',
            'Access admin-only local development features.',
            true
        )
        ON CONFLICT (permission_key) DO UPDATE
        SET resource = EXCLUDED.resource,
            action = EXCLUDED.action,
            description = EXCLUDED.description;
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT roles.id, permissions.id
        FROM roles
        JOIN permissions ON permissions.permission_key IN (
            'homepage:view',
            'apps:access'
        )
        WHERE roles.role_key = 'user'
        ON CONFLICT (role_id, permission_id) DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT roles.id, permissions.id
        FROM roles
        JOIN permissions ON permissions.permission_key IN (
            'homepage:view',
            'homepage:edit',
            'apps:access',
            'users:manage',
            'admin:access',
            'admin:data:read',
            'admin:data:manage',
            'visitor_messages:read',
            'visitor_messages:manage',
            'audit_logs:read'
        )
        WHERE roles.role_key = 'admin'
        ON CONFLICT (role_id, permission_id) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.drop_index("ix_auth_sessions_revoked_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_expires_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_created_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_session_token_hash", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")

    op.drop_column("app_users", "disabled_at")
