"""Health check routes."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db_session

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
def health_check(
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> JSONResponse:
    """Return application and database health without leaking connection details."""

    timestamp = datetime.now(timezone.utc).isoformat()
    try:
        db.execute(text("SELECT 1"))
        logger.info("Health check passed for environment=%s", settings.app_env)
        return JSONResponse(
            status_code=200,
            content={
                "status": "ok",
                "app": settings.app_name,
                "environment": settings.app_env,
                "database": "ok",
                "timestamp": timestamp,
            },
        )
    except Exception as exc:
        logger.exception("Health check database probe failed: %s", exc.__class__.__name__)
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "app": settings.app_name,
                "environment": settings.app_env,
                "database": "error",
                "timestamp": timestamp,
            },
        )
