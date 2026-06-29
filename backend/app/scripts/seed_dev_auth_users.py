"""Seed local Auth/RBAC v1 users for development only."""

import logging

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.auth import AppUser, Role, UserRole
from app.services.rbac_service import ensure_auth_roles_permissions

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger(__name__)


DEV_USERS = [
    {"username": "1", "password": "1", "display_name": "Local Admin", "role": "admin"},
    {"username": "2", "password": "2", "display_name": "Local User", "role": "user"},
]


def upsert_user_role(db, user: AppUser, role_key: str) -> None:
    """Assign or restore a seed user's expected role."""

    role = db.execute(select(Role).where(Role.role_key == role_key)).scalar_one()
    existing = db.execute(
        select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)
    ).scalar_one_or_none()
    if existing:
        existing.revoked_at = None
        existing.revoked_by_user_id = None
        existing.revoke_reason = None
    else:
        db.add(UserRole(user_id=user.id, role_id=role.id))


def seed_dev_auth_users() -> None:
    """Create the local admin/user accounts used by browser auth smoke tests."""

    settings = get_settings()
    if not settings.dev_tools_enabled:
        raise RuntimeError("Refusing to seed auth users unless APP_ENV=development and ALLOW_DEV_TOOLS=true")

    with SessionLocal() as db:
        ensure_auth_roles_permissions(db)
        for seed in DEV_USERS:
            user = db.execute(select(AppUser).where(AppUser.username == seed["username"])).scalar_one_or_none()
            if not user:
                user = AppUser(
                    username=seed["username"],
                    display_name=seed["display_name"],
                    password_hash=hash_password(seed["password"]),
                    status="active",
                    is_system=True,
                    admin_note="Development-only seeded account.",
                )
                db.add(user)
                db.flush()
                logger.info("Created development auth user username=%s user_id=%s", seed["username"], user.id)
            else:
                user.display_name = seed["display_name"]
                user.password_hash = hash_password(seed["password"])
                user.status = "active"
                user.disabled_at = None
                user.is_system = True
                logger.info("Updated development auth user username=%s user_id=%s", seed["username"], user.id)
            upsert_user_role(db, user, seed["role"])

        db.commit()
        logger.info("Development Auth/RBAC users are ready: admin_username=1 user_username=2")


if __name__ == "__main__":
    seed_dev_auth_users()
