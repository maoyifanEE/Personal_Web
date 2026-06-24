"""Import ORM models so Alembic can discover metadata."""

from app.models.audit_log import AuditLog
from app.models.visitor_message import VisitorMessage

__all__ = ["AuditLog", "VisitorMessage"]
