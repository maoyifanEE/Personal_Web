"""Health endpoint response schemas."""

from datetime import datetime

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    app: str
    environment: str
    database: str
    timestamp: datetime
