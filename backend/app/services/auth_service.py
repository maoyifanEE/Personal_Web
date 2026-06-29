"""Authentication and session service for Auth/RBAC v1."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import (
    generate_csrf_token,
    generate_session_token,
    hash_secret,
    verify_password,
    verify_secret,
)
from app.models.auth import AppUser, AuthSession, Role, UserRole
from app.services.audit_service import write_audit_log
from app.services.rbac_service import get_user_permissions, get_user_roles

logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def find_user_for_login(db: Session, username_or_email: str) -> AppUser | None:
    """Find an active user by username or email."""

    normalized = username_or_email.strip().lower()
    if not normalized:
        return None
    return db.execute(
        select(AppUser).where(
            (func.lower(AppUser.username) == normalized) | (func.lower(AppUser.email) == normalized)
        )
    ).scalar_one_or_none()


def is_login_allowed(user: AppUser) -> bool:
    return user.status == "active" and user.deleted_at is None and user.disabled_at is None


def authenticate_user(db: Session, username_or_email: str, password: str) -> AppUser | None:
    """Authenticate username/password without logging secrets."""

    user = find_user_for_login(db, username_or_email)
    if not user:
        logger.info("Auth login rejected: user not found")
        return None
    if not is_login_allowed(user):
        logger.info("Auth login rejected for user_id=%s: inactive", user.id)
        return None
    if not verify_password(password, user.password_hash):
        logger.info("Auth login rejected for user_id=%s: bad password", user.id)
        return None
    logger.info("Auth login accepted for user_id=%s", user.id)
    return user


def create_session(
    db: Session,
    *,
    user: AppUser,
    settings: Settings,
    ip_label: str | None = None,
    user_agent: str | None = None,
) -> tuple[AuthSession, str, str]:
    """Create a database-backed session and return raw cookie/CSRF tokens once."""

    session_token = generate_session_token()
    csrf_token = generate_csrf_token()
    expires_at = utc_now() + timedelta(days=settings.session_expire_days)
    auth_session = AuthSession(
        user_id=user.id,
        session_token_hash=hash_secret(session_token),
        csrf_token_hash=hash_secret(csrf_token),
        expires_at=expires_at,
        last_seen_at=utc_now(),
        ip_hash=hash_secret(ip_label) if ip_label else None,
        user_agent_hash=hash_secret(user_agent) if user_agent else None,
    )
    user.last_login_at = utc_now()
    db.add(auth_session)
    write_audit_log(
        db,
        action="auth.login.success",
        source_app="auth",
        target_table="app_users",
        target_id=str(user.id),
        actor_type="user",
        actor_id=str(user.id),
        actor_user_id=user.id,
        summary="User logged in successfully.",
    )
    logger.info("Created auth session for user_id=%s", user.id)
    return auth_session, session_token, csrf_token


def get_session_by_token(db: Session, session_token: str | None) -> AuthSession | None:
    """Look up a non-expired, non-revoked session by raw cookie token."""

    if not session_token:
        return None
    token_hash = hash_secret(session_token)
    auth_session = db.execute(
        select(AuthSession).where(
            AuthSession.session_token_hash == token_hash,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > utc_now(),
        )
    ).scalar_one_or_none()
    if auth_session:
        auth_session.last_seen_at = utc_now()
    return auth_session


def revoke_session(db: Session, auth_session: AuthSession | None) -> None:
    """Revoke a session without exposing token material."""

    if not auth_session or auth_session.revoked_at:
        return
    auth_session.revoked_at = utc_now()
    write_audit_log(
        db,
        action="auth.logout",
        source_app="auth",
        target_table="auth_sessions",
        target_id=str(auth_session.id),
        actor_type="user",
        actor_id=str(auth_session.user_id),
        actor_user_id=auth_session.user_id,
        summary="User session was revoked by logout.",
    )
    logger.info("Revoked auth session id=%s user_id=%s", auth_session.id, auth_session.user_id)


def get_session_user(db: Session, auth_session: AuthSession | None) -> AppUser | None:
    if not auth_session:
        return None
    user = db.get(AppUser, auth_session.user_id)
    if not user or not is_login_allowed(user):
        return None
    return user


def build_auth_state(db: Session, user: AppUser | None) -> dict:
    """Build safe frontend auth state."""

    if not user:
        return {"authenticated": False, "role": "guest", "roles": [], "permissions": []}
    roles = get_user_roles(db, user)
    permissions = get_user_permissions(db, user)
    return {
        "authenticated": True,
        "role": "admin" if "admin" in roles else "user",
        "user": {
            "id": user.id,
            "username": user.username,
            "displayName": user.display_name or user.username,
            "email": user.email,
            "status": user.status,
        },
        "roles": roles,
        "permissions": permissions,
    }


def count_active_admins(db: Session) -> int:
    """Count active users with a non-revoked admin role."""

    return int(
        db.execute(
            select(func.count())
            .select_from(AppUser)
            .join(UserRole, UserRole.user_id == AppUser.id)
            .join(Role, Role.id == UserRole.role_id)
            .where(
                Role.role_key == "admin",
                UserRole.revoked_at.is_(None),
                AppUser.status == "active",
                AppUser.deleted_at.is_(None),
                AppUser.disabled_at.is_(None),
            )
        ).scalar_one()
    )


def validate_csrf(auth_session: AuthSession, csrf_token: str | None) -> bool:
    return bool(csrf_token and verify_secret(csrf_token, auth_session.csrf_token_hash))
