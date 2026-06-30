"""Reusable FastAPI auth dependencies for protected APIs."""

import logging

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.diagnostics import write_jsonl_event
from app.db.session import get_db_session
from app.models.auth import AppUser, AuthSession
from app.services.auth_service import get_session_by_token, get_session_user, validate_csrf
from app.services.rbac_service import user_has_permission, user_has_role

logger = logging.getLogger(__name__)


def get_current_session(
    request: Request,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AuthSession | None:
    """Resolve the current session from the configured HttpOnly cookie."""

    session_token = request.cookies.get(settings.session_cookie_name)
    return get_session_by_token(db, session_token)


def get_optional_current_user(
    db: Session = Depends(get_db_session),
    session: AuthSession | None = Depends(get_current_session),
) -> AppUser | None:
    """Return the current user or None for guests."""

    return get_session_user(db, session)


def get_current_user(user: AppUser | None = Depends(get_optional_current_user)) -> AppUser:
    """Require an authenticated user."""

    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def require_authenticated_user(user: AppUser = Depends(get_current_user)) -> AppUser:
    return user


def require_role(role_key: str):
    """Return a dependency requiring a role."""

    def dependency(db: Session = Depends(get_db_session), user: AppUser = Depends(get_current_user)) -> AppUser:
        if not user_has_role(db, user, role_key):
            logger.warning("Role denied: user_id=%s role=%s", user.id, role_key)
            write_jsonl_event("backend", "rbac.role.denied", {"userId": user.id, "role": role_key})
            raise HTTPException(status_code=403, detail="Permission denied")
        write_jsonl_event("backend", "rbac.role.granted", {"userId": user.id, "role": role_key})
        return user

    return dependency


def require_permission(permission_key: str):
    """Return a dependency requiring a permission."""

    def dependency(db: Session = Depends(get_db_session), user: AppUser = Depends(get_current_user)) -> AppUser:
        if not user_has_permission(db, user, permission_key):
            logger.warning("Permission denied: user_id=%s permission=%s", user.id, permission_key)
            write_jsonl_event(
                "backend",
                "rbac.permission.denied",
                {"userId": user.id, "permission": permission_key},
            )
            raise HTTPException(status_code=403, detail="Permission denied")
        write_jsonl_event(
            "backend",
            "rbac.permission.granted",
            {"userId": user.id, "permission": permission_key},
        )
        return user

    return dependency


def require_csrf_token(
    request: Request,
    db: Session = Depends(get_db_session),
    session: AuthSession | None = Depends(get_current_session),
    settings: Settings = Depends(get_settings),
) -> AuthSession:
    """Require a valid CSRF token for authenticated unsafe requests."""

    if request.method.upper() not in {"POST", "PUT", "PATCH", "DELETE"}:
        if not session:
            raise HTTPException(status_code=401, detail="Authentication required")
        return session
    if not session:
        raise HTTPException(status_code=401, detail="Authentication required")
    csrf_token = request.headers.get(settings.csrf_header_name)
    if not validate_csrf(session, csrf_token):
        logger.warning("CSRF validation failed for session_id=%s", session.id)
        write_jsonl_event(
            "backend",
            "auth.csrf.denied",
            {"sessionId": session.id, "path": request.url.path},
        )
        raise HTTPException(status_code=403, detail="CSRF token required")
    write_jsonl_event("backend", "auth.csrf.granted", {"sessionId": session.id, "path": request.url.path})
    return session
