"""Admin user management routes for local Auth/RBAC v1."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import require_csrf_token, require_permission
from app.core.security import hash_password
from app.db.session import get_db_session
from app.models.auth import AppUser, Role, UserRole
from app.schemas.auth import (
    AdminUserCreate,
    AdminUserRead,
    AdminUserUpdate,
    PasswordResetRequest,
    RoleAssignRequest,
    RoleRead,
)
from app.services.audit_service import write_audit_log
from app.services.auth_service import count_active_admins
from app.services.rbac_service import ensure_auth_roles_permissions, get_user_roles

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/users")


def to_admin_user_read(db: Session, user: AppUser) -> AdminUserRead:
    """Convert a database user row into a safe admin response object."""

    return AdminUserRead(
        id=user.id,
        username=user.username,
        display_name=user.display_name or user.username,
        email=user.email,
        status=user.status,
        roles=get_user_roles(db, user),
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        disabled_at=user.disabled_at,
    )


def normalize_roles(roles: list[str]) -> list[str]:
    """Keep only supported local Auth/RBAC v1 roles."""

    allowed = {"admin", "user"}
    normalized = sorted({role for role in roles if role in allowed})
    return normalized or ["user"]


def assign_role(db: Session, user: AppUser, role_key: str, actor_id: int | None = None) -> None:
    """Assign or restore a role for a user."""

    role = db.execute(select(Role).where(Role.role_key == role_key)).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=400, detail="Unknown role")
    existing = db.execute(
        select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)
    ).scalar_one_or_none()
    if existing:
        existing.revoked_at = None
        existing.revoked_by_user_id = None
        existing.revoke_reason = None
    else:
        db.add(UserRole(user_id=user.id, role_id=role.id, assigned_by_user_id=actor_id))


@router.get("/roles", response_model=list[RoleRead])
def list_roles(
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("users:manage")),
) -> list[RoleRead]:
    """List assignable local roles."""

    ensure_auth_roles_permissions(db)
    roles = db.execute(select(Role).where(Role.status == "active").order_by(Role.role_key)).scalars().all()
    logger.info("Admin role list read by user_id=%s", actor.id)
    return [RoleRead(key=role.role_key, name=role.display_name, description=role.description) for role in roles]


@router.get("", response_model=list[AdminUserRead])
def list_users(
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("users:manage")),
) -> list[AdminUserRead]:
    """List local users for the admin-only user management UI."""

    ensure_auth_roles_permissions(db)
    users = db.execute(select(AppUser).order_by(AppUser.id)).scalars().all()
    logger.info("Admin user list read by user_id=%s count=%s", actor.id, len(users))
    return [to_admin_user_read(db, user) for user in users]


@router.post("", response_model=AdminUserRead, dependencies=[Depends(require_csrf_token)])
def create_user(
    payload: AdminUserCreate,
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("users:manage")),
) -> AdminUserRead:
    """Create a local user with one or more Auth/RBAC v1 roles."""

    ensure_auth_roles_permissions(db)
    username = payload.username.strip()
    if db.execute(select(AppUser).where(AppUser.username == username)).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")
    user = AppUser(
        username=username,
        display_name=(payload.display_name or username).strip(),
        email=payload.email.strip().lower() if payload.email else None,
        password_hash=hash_password(payload.password),
        status="active",
    )
    db.add(user)
    db.flush()
    for role_key in normalize_roles(payload.roles):
        assign_role(db, user, role_key, actor.id)
    write_audit_log(
        db,
        action="admin.users.create",
        source_app="admin_users",
        target_table="app_users",
        target_id=str(user.id),
        actor_type="user",
        actor_id=str(actor.id),
        actor_user_id=actor.id,
        summary="Admin created a local user.",
    )
    db.commit()
    logger.info("Admin user_id=%s created user_id=%s", actor.id, user.id)
    return to_admin_user_read(db, user)


@router.patch("/{user_id}", response_model=AdminUserRead, dependencies=[Depends(require_csrf_token)])
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("users:manage")),
) -> AdminUserRead:
    """Update profile fields or active state for a local user."""

    user = db.get(AppUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip() or user.username
    if payload.email is not None:
        user.email = payload.email.strip().lower() or None
    if payload.is_active is not None:
        if not payload.is_active:
            if "admin" in get_user_roles(db, user) and count_active_admins(db) <= 1:
                raise HTTPException(status_code=400, detail="Cannot disable the last active admin")
            user.status = "disabled"
            user.disabled_at = datetime.now(timezone.utc)
        else:
            user.status = "active"
            user.disabled_at = None
    write_audit_log(
        db,
        action="admin.users.update",
        source_app="admin_users",
        target_table="app_users",
        target_id=str(user.id),
        actor_type="user",
        actor_id=str(actor.id),
        actor_user_id=actor.id,
        summary="Admin updated a local user.",
    )
    db.commit()
    logger.info("Admin user_id=%s updated user_id=%s", actor.id, user.id)
    return to_admin_user_read(db, user)


@router.post("/{user_id}/reset-password", response_model=AdminUserRead, dependencies=[Depends(require_csrf_token)])
def reset_password(
    user_id: int,
    payload: PasswordResetRequest,
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("users:manage")),
) -> AdminUserRead:
    """Reset a local user's password hash."""

    user = db.get(AppUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(payload.password)
    write_audit_log(
        db,
        action="admin.users.reset_password",
        source_app="admin_users",
        target_table="app_users",
        target_id=str(user.id),
        actor_type="user",
        actor_id=str(actor.id),
        actor_user_id=actor.id,
        summary="Admin reset a local user password.",
    )
    db.commit()
    logger.info("Admin user_id=%s reset password for user_id=%s", actor.id, user.id)
    return to_admin_user_read(db, user)


@router.post("/{user_id}/roles", response_model=AdminUserRead, dependencies=[Depends(require_csrf_token)])
def add_role(
    user_id: int,
    payload: RoleAssignRequest,
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("users:manage")),
) -> AdminUserRead:
    """Assign a role to a user."""

    user = db.get(AppUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    assign_role(db, user, payload.role, actor.id)
    db.commit()
    logger.info("Admin user_id=%s added role=%s to user_id=%s", actor.id, payload.role, user.id)
    return to_admin_user_read(db, user)


@router.delete("/{user_id}/roles/{role_key}", response_model=AdminUserRead, dependencies=[Depends(require_csrf_token)])
def remove_role(
    user_id: int,
    role_key: str,
    db: Session = Depends(get_db_session),
    actor: AppUser = Depends(require_permission("users:manage")),
) -> AdminUserRead:
    """Soft-revoke a role assignment from a user."""

    user = db.get(AppUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if role_key == "admin" and "admin" in get_user_roles(db, user) and count_active_admins(db) <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove the last active admin role")
    role = db.execute(select(Role).where(Role.role_key == role_key)).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    user_role = db.execute(
        select(UserRole).where(
            UserRole.user_id == user.id,
            UserRole.role_id == role.id,
            UserRole.revoked_at.is_(None),
        )
    ).scalar_one_or_none()
    if user_role:
        user_role.revoked_at = datetime.now(timezone.utc)
        user_role.revoked_by_user_id = actor.id
        user_role.revoke_reason = "Removed by admin user management."
    db.commit()
    logger.info("Admin user_id=%s removed role=%s from user_id=%s", actor.id, role_key, user.id)
    return to_admin_user_read(db, user)
