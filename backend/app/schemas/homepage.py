"""Homepage/Journey canvas API schemas."""

from datetime import datetime
import json
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

CANVAS_KEY_DEFAULT = "default"
MAX_CANVAS_JSON_CHARS = 500_000
ALLOWED_HOMEPAGE_DISPLAY_TYPES = {"sticker", "image", "video", "card"}


class HomepageCanvasSaveRequest(BaseModel):
    canvas_key: str = Field(default=CANVAS_KEY_DEFAULT, alias="canvasKey", max_length=80)
    schema_version: str = Field(..., alias="schemaVersion", min_length=1, max_length=80)
    canvas_data: dict[str, Any] = Field(..., alias="canvasData")
    base_revision: int | None = Field(default=None, alias="baseRevision", ge=0)

    model_config = {"populate_by_name": True}

    @field_validator("canvas_key")
    @classmethod
    def require_default_canvas_key(cls, value: str) -> str:
        if value != CANVAS_KEY_DEFAULT:
            raise ValueError("canvas_key must be default")
        return value

    @model_validator(mode="after")
    def validate_payload_size(self) -> "HomepageCanvasSaveRequest":
        if not self.canvas_data:
            raise ValueError("canvas_data must not be empty")
        encoded_size = len(json.dumps(self.canvas_data, ensure_ascii=False))
        if encoded_size > MAX_CANVAS_JSON_CHARS:
            raise ValueError("canvas_data is too large")
        return self


class HomepageCanvasResponse(BaseModel):
    canvas_key: str
    schema_version: str
    canvas_data: dict[str, Any]
    revision: int
    updated_at: datetime | None
    updated_by_user_id: int | None
    exists: bool

    model_config = {"populate_by_name": True}


class HomepageMediaResponse(BaseModel):
    id: int
    media_type: str = Field(alias="mediaType")
    title: str | None
    description: str | None = None
    original_filename: str = Field(alias="originalFilename")
    stored_filename: str = Field(alias="storedFilename")
    relative_path: str = Field(alias="relativePath")
    mime_type: str = Field(alias="mimeType")
    file_size_bytes: int = Field(alias="fileSizeBytes")
    checksum_sha256: str | None = Field(default=None, alias="checksumSha256")
    sort_order: int = Field(alias="sortOrder")
    is_enabled: bool = Field(alias="isEnabled")
    url: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class HomepageMediaListResponse(BaseModel):
    media: list[HomepageMediaResponse]


class HomepageMediaUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    description: str | None = None
    sort_order: int | None = Field(default=None, alias="sortOrder")
    is_enabled: bool | None = Field(default=None, alias="isEnabled")

    model_config = {"populate_by_name": True}


class HomepageItemMediaPublic(BaseModel):
    id: int
    media_type: str = Field(alias="mediaType")
    title: str | None
    url: str
    mime_type: str = Field(alias="mimeType")
    file_size_bytes: int = Field(alias="fileSizeBytes")

    model_config = {"populate_by_name": True}


class HomepageItemResponse(BaseModel):
    id: int
    title: str
    subtitle: str | None
    description: str | None
    location_label: str | None = Field(alias="locationLabel")
    time_label: str | None = Field(alias="timeLabel")
    media_id: int | None = Field(alias="mediaId")
    display_type: str = Field(alias="displayType")
    sort_order: int = Field(alias="sortOrder")
    is_visible: bool = Field(alias="isVisible")
    media: HomepageItemMediaPublic | None = None
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class HomepagePublicItemResponse(BaseModel):
    id: int
    title: str
    subtitle: str | None
    description: str | None
    location_label: str | None = Field(alias="locationLabel")
    time_label: str | None = Field(alias="timeLabel")
    display_type: str = Field(alias="displayType")
    sort_order: int = Field(alias="sortOrder")
    media: HomepageItemMediaPublic | None = None

    model_config = {"populate_by_name": True}


class HomepagePublicResponse(BaseModel):
    items: list[HomepagePublicItemResponse]


class HomepageItemListResponse(BaseModel):
    items: list[HomepageItemResponse]


class HomepageItemCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    subtitle: str | None = Field(default=None, max_length=220)
    description: str | None = None
    location_label: str | None = Field(default=None, alias="locationLabel", max_length=160)
    time_label: str | None = Field(default=None, alias="timeLabel", max_length=160)
    media_id: int | None = Field(default=None, alias="mediaId", ge=1)
    display_type: str = Field("card", alias="displayType")
    sort_order: int = Field(0, alias="sortOrder")
    is_visible: bool = Field(True, alias="isVisible")

    model_config = {"populate_by_name": True}

    @field_validator("display_type")
    @classmethod
    def validate_display_type(cls, value: str) -> str:
        if value not in ALLOWED_HOMEPAGE_DISPLAY_TYPES:
            raise ValueError("display_type must be sticker, image, video, or card")
        return value


class HomepageItemUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    subtitle: str | None = Field(default=None, max_length=220)
    description: str | None = None
    location_label: str | None = Field(default=None, alias="locationLabel", max_length=160)
    time_label: str | None = Field(default=None, alias="timeLabel", max_length=160)
    media_id: int | None = Field(default=None, alias="mediaId", ge=1)
    display_type: str | None = Field(default=None, alias="displayType")
    sort_order: int | None = Field(default=None, alias="sortOrder")
    is_visible: bool | None = Field(default=None, alias="isVisible")

    model_config = {"populate_by_name": True}

    @field_validator("display_type")
    @classmethod
    def validate_optional_display_type(cls, value: str | None) -> str | None:
        if value is not None and value not in ALLOWED_HOMEPAGE_DISPLAY_TYPES:
            raise ValueError("display_type must be sticker, image, video, or card")
        return value
