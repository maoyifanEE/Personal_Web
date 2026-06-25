"""Import ORM models so Alembic can discover metadata."""

from app.models.audit_log import AuditLog
from app.models.auth import AppUser, Permission, Role, RolePermission, UserRole
from app.models.visitor_message import VisitorMessage

__all__ = [
    "AppUser",
    "AuditLog",
    "Permission",
    "Role",
    "RolePermission",
    "UserRole",
    "VisitorMessage",
]
