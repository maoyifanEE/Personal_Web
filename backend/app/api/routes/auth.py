"""Authentication routes for local Auth/RBAC v1."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_session, get_optional_current_user
from app.core.config import Settings, get_settings
from app.core.security import generate_csrf_token, hash_secret
from app.db.session import get_db_session
from app.models.auth import AuthSession
from app.schemas.auth import AuthState, CsrfResponse, LoginRequest
from app.services.audit_service import write_audit_log
from app.services.auth_service import (
    authenticate_user,
    build_auth_state,
    create_session,
    get_session_user,
    revoke_session,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth")


def set_session_cookie(response: Response, settings: Settings, session_token: str) -> None:
    """Write the HttpOnly backend session cookie."""

    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.session_expire_days * 24 * 60 * 60,
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    """Clear the configured backend session cookie."""

    response.delete_cookie(key=settings.session_cookie_name, path="/", samesite="lax")


@router.post("/login", response_model=AuthState)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AuthState:
    """Authenticate a local user and create a DB-backed browser session."""

    username = (payload.username_or_email or payload.username or "").strip()
    user = authenticate_user(db, username, payload.password)
    if not user:
        write_audit_log(
            db,
            action="auth.login.failure",
            source_app="auth",
            summary="Login failed for supplied username/email.",
            actor_type="guest",
            actor_id=username[:80] or None,
        )
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid username or password")

    _, session_token, _ = create_session(
        db,
        user=user,
        settings=settings,
        ip_label=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    set_session_cookie(response, settings, session_token)
    auth_state = build_auth_state(db, user)
    db.commit()
    logger.info("Login route completed for user_id=%s", user.id)
    return AuthState(**auth_state)


@router.post("/logout")
def logout(
    response: Response,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    session: AuthSession | None = Depends(get_current_session),
) -> dict[str, bool]:
    """Revoke the current session if it exists and clear the session cookie."""

    revoke_session(db, session)
    clear_session_cookie(response, settings)
    db.commit()
    logger.info("Logout route completed session_id=%s", getattr(session, "id", None))
    return {"ok": True}


@router.get("/me", response_model=AuthState)
def me(
    db: Session = Depends(get_db_session),
    user=Depends(get_optional_current_user),
) -> AuthState:
    """Return the current authentication state for frontend guards."""

    return AuthState(**build_auth_state(db, user))


@router.get("/csrf", response_model=CsrfResponse)
def csrf(
    db: Session = Depends(get_db_session),
    session: AuthSession | None = Depends(get_current_session),
) -> CsrfResponse:
    """Rotate and return a CSRF token for authenticated unsafe requests."""

    user = get_session_user(db, session)
    if not user or not session:
        return CsrfResponse(authenticated=False, csrf_token=None)

    token = generate_csrf_token()
    session.csrf_token_hash = hash_secret(token)
    db.commit()
    logger.info("Rotated CSRF token for session_id=%s user_id=%s", session.id, user.id)
    return CsrfResponse(authenticated=True, csrf_token=token)
