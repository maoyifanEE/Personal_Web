"""Create database RBAC foundation tables.

This migration adds schema-only auth readiness for future protected admin features.
It seeds system role and permission definitions, but it does not create real users,
password hashes, sessions, or login behavior.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260625_0002"
down_revision: str | None = "20260624_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "app_users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "status IN ('active', 'disabled', 'locked', 'archived')",
            name="ck_app_users_status",
        ),
        sa.UniqueConstraint("username", name="uq_app_users_username"),
        sa.UniqueConstraint("email", name="uq_app_users_email"),
    )
    op.create_index("ix_app_users_id", "app_users", ["id"])
    op.create_index("ix_app_users_username", "app_users", ["username"])
    op.create_index("ix_app_users_email", "app_users", ["email"])
    op.create_index("ix_app_users_status", "app_users", ["status"])

    op.add_column("audit_logs", sa.Column("actor_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_audit_logs_actor_user_id_app_users",
        "audit_logs",
        "app_users",
        ["actor_user_id"],
        ["id"],
    )
    op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"])

    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("role_key", sa.String(length=80), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('active', 'disabled', 'archived')",
            name="ck_roles_status",
        ),
        sa.UniqueConstraint("role_key", name="uq_roles_role_key"),
    )
    op.create_index("ix_roles_id", "roles", ["id"])
    op.create_index("ix_roles_role_key", "roles", ["role_key"])
    op.create_index("ix_roles_status", "roles", ["status"])

    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("permission_key", sa.String(length=120), nullable=False),
        sa.Column("resource", sa.String(length=80), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("permission_key", name="uq_permissions_permission_key"),
    )
    op.create_index("ix_permissions_id", "permissions", ["id"])
    op.create_index("ix_permissions_permission_key", "permissions", ["permission_key"])
    op.create_index("ix_permissions_resource", "permissions", ["resource"])
    op.create_index("ix_permissions_action", "permissions", ["action"])

    op.create_table(
        "user_roles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("assigned_by_user_id", sa.Integer(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by_user_id", sa.Integer(), nullable=True),
        sa.Column("revoke_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["app_users.id"]),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["app_users.id"]),
        sa.ForeignKeyConstraint(["revoked_by_user_id"], ["app_users.id"]),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_id_role_id"),
    )
    op.create_index("ix_user_roles_id", "user_roles", ["id"])
    op.create_index("ix_user_roles_user_id", "user_roles", ["user_id"])
    op.create_index("ix_user_roles_role_id", "user_roles", ["role_id"])
    op.create_index("ix_user_roles_assigned_by_user_id", "user_roles", ["assigned_by_user_id"])
    op.create_index("ix_user_roles_revoked_by_user_id", "user_roles", ["revoked_by_user_id"])

    op.create_table(
        "role_permissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("permission_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"]),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_role_id_permission_id"),
    )
    op.create_index("ix_role_permissions_id", "role_permissions", ["id"])
    op.create_index("ix_role_permissions_role_id", "role_permissions", ["role_id"])
    op.create_index("ix_role_permissions_permission_id", "role_permissions", ["permission_id"])

    seed_system_role_permissions()


def seed_system_role_permissions() -> None:
    """Seed safe role and permission definitions without creating any users."""

    op.execute(
        """
        INSERT INTO roles (role_key, display_name, description, is_system, status)
        VALUES (
            'admin',
            'Administrator',
            'Full administrator role for future protected admin features.',
            true,
            'active'
        );
        """
    )
    op.execute(
        """
        INSERT INTO permissions (permission_key, resource, action, description, is_system)
        VALUES
        (
            'admin:data:read',
            'admin_data',
            'read',
            'Read future admin data center summaries and records.',
            true
        ),
        (
            'admin:data:manage',
            'admin_data',
            'manage',
            'Manage future admin data center records.',
            true
        ),
        (
            'visitor_messages:read',
            'visitor_messages',
            'read',
            'Read visitor messages in future admin tools.',
            true
        ),
        (
            'visitor_messages:manage',
            'visitor_messages',
            'manage',
            'Update, archive, or soft-delete visitor messages in future admin tools.',
            true
        ),
        (
            'audit_logs:read',
            'audit_logs',
            'read',
            'Read audit logs in future admin tools.',
            true
        );
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT roles.id, permissions.id
        FROM roles
        CROSS JOIN permissions
        WHERE roles.role_key = 'admin'
          AND permissions.permission_key IN (
              'admin:data:read',
              'admin:data:manage',
              'visitor_messages:read',
              'visitor_messages:manage',
              'audit_logs:read'
          );
        """
    )


def downgrade() -> None:
    op.drop_index("ix_role_permissions_permission_id", table_name="role_permissions")
    op.drop_index("ix_role_permissions_role_id", table_name="role_permissions")
    op.drop_index("ix_role_permissions_id", table_name="role_permissions")
    op.drop_table("role_permissions")

    op.drop_index("ix_user_roles_revoked_by_user_id", table_name="user_roles")
    op.drop_index("ix_user_roles_assigned_by_user_id", table_name="user_roles")
    op.drop_index("ix_user_roles_role_id", table_name="user_roles")
    op.drop_index("ix_user_roles_user_id", table_name="user_roles")
    op.drop_index("ix_user_roles_id", table_name="user_roles")
    op.drop_table("user_roles")

    op.drop_index("ix_permissions_action", table_name="permissions")
    op.drop_index("ix_permissions_resource", table_name="permissions")
    op.drop_index("ix_permissions_permission_key", table_name="permissions")
    op.drop_index("ix_permissions_id", table_name="permissions")
    op.drop_table("permissions")

    op.drop_index("ix_roles_status", table_name="roles")
    op.drop_index("ix_roles_role_key", table_name="roles")
    op.drop_index("ix_roles_id", table_name="roles")
    op.drop_table("roles")

    op.drop_index("ix_audit_logs_actor_user_id", table_name="audit_logs")
    op.drop_constraint("fk_audit_logs_actor_user_id_app_users", "audit_logs", type_="foreignkey")
    op.drop_column("audit_logs", "actor_user_id")

    op.drop_index("ix_app_users_status", table_name="app_users")
    op.drop_index("ix_app_users_email", table_name="app_users")
    op.drop_index("ix_app_users_username", table_name="app_users")
    op.drop_index("ix_app_users_id", table_name="app_users")
    op.drop_table("app_users")
