"""Homepage/Journey canvas API schemas."""

from datetime import datetime
import json
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

CANVAS_KEY_DEFAULT = "default"
MAX_CANVAS_JSON_CHARS = 500_000


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
