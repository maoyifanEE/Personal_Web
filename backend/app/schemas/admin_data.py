"""Schemas for development-only admin data foundation endpoints."""

from pydantic import BaseModel


class AdminDataSummary(BaseModel):
    visitor_message_total: int
    visitor_message_by_data_scope: dict[str, int]
    visitor_message_by_status: dict[str, int]
    soft_deleted_count: int
    audit_log_count: int
