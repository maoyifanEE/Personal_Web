"""Security helpers for Auth/RBAC v1 local development."""

import hmac
import logging
import secrets
from hashlib import sha256

from passlib.context import CryptContext

from app.core.config import get_settings

logger = logging.getLogger(__name__)
password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    """Hash a user password with a maintained password hashing library."""

    logger.info("Hashing password for Auth/RBAC user setup")
    return password_context.hash(plain_password)


def verify_password(plain_password: str, password_hash: str | None) -> bool:
    """Verify a password without exposing the stored hash."""

    if not password_hash:
        return False
    return password_context.verify(plain_password, password_hash)


def generate_session_token() -> str:
    """Generate an opaque random session token for the HttpOnly cookie."""

    return secrets.token_urlsafe(48)


def generate_csrf_token() -> str:
    """Generate a random CSRF token returned to authenticated browser JavaScript."""

    return secrets.token_urlsafe(32)


def hash_secret(secret: str) -> str:
    """Hash opaque random token material with a server-side HMAC secret."""

    settings = get_settings()
    digest = hmac.new(settings.session_secret.encode("utf-8"), secret.encode("utf-8"), sha256).hexdigest()
    return digest


def verify_secret(secret: str, stored_hash: str) -> bool:
    """Compare an opaque token against a stored HMAC hash."""

    return hmac.compare_digest(hash_secret(secret), stored_hash)
