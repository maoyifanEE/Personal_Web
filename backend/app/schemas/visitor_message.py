"""Visitor message request and response schemas."""

from datetime import datetime
import re
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.visitor_message import VisitorMessageStatus

CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def normalize_public_text(value: str) -> str:
    """Trim input and remove control characters before persistence."""

    return CONTROL_CHARS.sub("", value).strip()


class VisitorMessageCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nickname: str = Field(..., max_length=80)
    contact: str | None = Field(default=None, max_length=120)
    message: str = Field(..., max_length=2000)
    website: str | None = Field(default=None, max_length=240)

    @field_validator("nickname", "message")
    @classmethod
    def require_trimmed_text(cls, value: str) -> str:
        trimmed = normalize_public_text(value)
        if not trimmed:
            raise ValueError("value must not be empty")
        return trimmed

    @field_validator("contact", "website")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = normalize_public_text(value)
        return trimmed or None


class VisitorMessagePublicAcceptedResponse(BaseModel):
    accepted: bool = True


class VisitorMessageAdminRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    nickname: str
    contact: str | None
    message: str
    status: str
    is_highlighted: bool = Field(alias="isHighlighted")
    highlighted_at: datetime | None = Field(alias="highlightedAt")
    data_scope: str = Field(alias="dataScope")
    source_app: str = Field(alias="sourceApp")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    deleted_at: datetime | None = Field(alias="deletedAt")
    deleted_by: str | None = Field(alias="deletedBy")
    delete_reason: str | None = Field(alias="deleteReason")
    admin_note: str | None = Field(alias="adminNote")


class VisitorMessageListResponse(BaseModel):
    items: list[VisitorMessageAdminRead]
    total: int
    limit: int
    offset: int


class VisitorMessageSummaryResponse(BaseModel):
    total: int
    active: int
    deleted: int
    new: int
    read: int
    archived: int
    highlighted: int


class VisitorMessageAdminUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: VisitorMessageStatus | None = None
    is_highlighted: bool | None = Field(default=None, alias="isHighlighted")
    admin_note: str | None = Field(default=None, alias="adminNote", max_length=2000)

    @field_validator("admin_note")
    @classmethod
    def normalize_admin_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = normalize_public_text(value)
        return trimmed or None

    @model_validator(mode="after")
    def require_change(self) -> "VisitorMessageAdminUpdate":
        has_status_update = self.status is not None
        has_highlight_update = self.is_highlighted is not None
        has_admin_note_update = "admin_note" in self.model_fields_set
        if not has_status_update and not has_highlight_update and not has_admin_note_update:
            raise ValueError("At least one update field is required")
        return self


class VisitorMessageSoftDeleteRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = normalize_public_text(value)
        return trimmed or None


# Compatibility alias for development export helpers that serialize full admin-safe rows.
VisitorMessageRead = VisitorMessageAdminRead
