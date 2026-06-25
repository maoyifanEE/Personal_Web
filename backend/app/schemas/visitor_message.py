"""Visitor message request and response schemas."""

from datetime import datetime

from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.common import DataScope
from app.models.visitor_message import VisitorMessageStatus


class VisitorMessageCreate(BaseModel):
    nickname: str = Field(..., max_length=80)
    contact: str | None = Field(default=None, max_length=120)
    message: str = Field(..., max_length=2000)
    data_scope: DataScope | None = None

    @model_validator(mode="before")
    @classmethod
    def accept_email_as_contact(cls, data: Any) -> Any:
        """Accept email as a local-test alias while storing the canonical contact field."""

        if isinstance(data, dict) and not data.get("contact") and data.get("email"):
            normalized = dict(data)
            normalized["contact"] = normalized["email"]
            return normalized
        return data

    @field_validator("nickname", "message")
    @classmethod
    def require_trimmed_text(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("value must not be empty")
        return trimmed

    @field_validator("contact")
    @classmethod
    def normalize_optional_contact(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


class VisitorMessageCreateResponse(BaseModel):
    id: int
    status: str
    data_scope: str
    created_at: datetime


class VisitorMessageRead(BaseModel):
    id: int
    nickname: str
    contact: str | None
    message: str
    status: str
    data_scope: str
    source_app: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    admin_note: str | None

    model_config = {"from_attributes": True}


class VisitorMessageListResponse(BaseModel):
    items: list[VisitorMessageRead]
    total: int
    limit: int
    offset: int


class VisitorMessageStatusUpdate(BaseModel):
    status: VisitorMessageStatus
