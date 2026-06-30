"""RBAC lookup and seed helpers for Auth/RBAC v1."""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth import AppUser, Permission, Role, RolePermission, UserRole

logger = logging.getLogger(__name__)

AUTH_V1_PERMISSIONS = {
    "homepage:view": ("homepage", "view", "View public homepage and Journey page."),
    "homepage:edit": ("homepage", "edit", "Edit homepage or Journey local prototype controls."),
    "apps:access": ("apps", "access", "Access authenticated private app shells."),
    "users:manage": ("users", "manage", "Manage local development users."),
    "admin:access": ("admin", "access", "Access admin-only local development features."),
}

ROLE_PERMISSION_MAP = {
    "user": {"homepage:view", "apps:access"},
    "admin": {
        "homepage:view",
        "homepage:edit",
        "apps:access",
        "users:manage",
        "admin:access",
        "admin:data:read",
        "admin:data:manage",
        "visitor_messages:read",
        "visitor_messages:manage",
        "audit_logs:read",
    },
}


def ensure_auth_roles_permissions(db: Session) -> None:
    """Ensure static role and permission definitions exist without creating users."""

    logger.info("Ensuring Auth/RBAC v1 role and permission definitions")
    for role_key, display_name, description in [
        ("admin", "Administrator", "Administrator role for local admin features."),
        ("user", "User", "Normal authenticated user role."),
    ]:
        role = db.execute(select(Role).where(Role.role_key == role_key)).scalar_one_or_none()
        if not role:
            role = Role(role_key=role_key, display_name=display_name, description=description, is_system=True)
            db.add(role)
        else:
            role.display_name = display_name
            role.description = description
            role.status = "active"

    for permission_key, (resource, action, description) in AUTH_V1_PERMISSIONS.items():
        permission = db.execute(
            select(Permission).where(Permission.permission_key == permission_key)
        ).scalar_one_or_none()
        if not permission:
            permission = Permission(
                permission_key=permission_key,
                resource=resource,
                action=action,
                description=description,
                is_system=True,
            )
            db.add(permission)
        else:
            permission.resource = resource
            permission.action = action
            permission.description = description

    db.flush()
    for role_key, permission_keys in ROLE_PERMISSION_MAP.items():
        role = db.execute(select(Role).where(Role.role_key == role_key)).scalar_one()
        for permission_key in permission_keys:
            permission = db.execute(
                select(Permission).where(Permission.permission_key == permission_key)
            ).scalar_one_or_none()
            if not permission:
                continue
            existing = db.execute(
                select(RolePermission).where(
                    RolePermission.role_id == role.id,
                    RolePermission.permission_id == permission.id,
                )
            ).scalar_one_or_none()
            if not existing:
                db.add(RolePermission(role_id=role.id, permission_id=permission.id))


def get_user_roles(db: Session, user: AppUser) -> list[str]:
    """Return active, non-revoked role keys for a user."""

    rows = db.execute(
        select(Role.role_key)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user.id, UserRole.revoked_at.is_(None), Role.status == "active")
    ).scalars()
    return sorted(set(rows))


def get_user_permissions(db: Session, user: AppUser) -> list[str]:
    """Return permission keys granted through active roles."""

    rows = db.execute(
        select(Permission.permission_key)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user.id, UserRole.revoked_at.is_(None), Role.status == "active")
    ).scalars()
    return sorted(set(rows))


def user_has_role(db: Session, user: AppUser, role_key: str) -> bool:
    return role_key in get_user_roles(db, user)


def user_has_permission(db: Session, user: AppUser, permission_key: str) -> bool:
    return permission_key in get_user_permissions(db, user)
