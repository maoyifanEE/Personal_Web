"""Development-only data tooling routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.schemas.visitor_message import VisitorMessageRead
from app.services.visitor_message_service import export_dev_messages, reset_dev_test_data, seed_dev_messages

logger = logging.getLogger(__name__)
router = APIRouter()


def require_dev_tools(settings: Settings) -> None:
    """Ensure development endpoints are impossible to use in production."""

    if not settings.dev_tools_enabled:
        logger.warning("Blocked /api/dev route in env=%s allow_dev_tools=%s", settings.app_env, settings.allow_dev_tools)
        raise HTTPException(status_code=403, detail="Development data tools are disabled")


@router.post("/seed")
def seed(db: Session = Depends(get_db_session), settings: Settings = Depends(get_settings)) -> dict[str, int]:
    """Insert safe fake visitor message data for local PostgreSQL testing only."""

    require_dev_tools(settings)
    count = seed_dev_messages(db)
    return {"inserted": count}


@router.post("/reset-test-data")
def reset_test_data(
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, int]:
    """Soft-delete test/demo data only for local development reset."""

    require_dev_tools(settings)
    count = reset_dev_test_data(db)
    return {"soft_deleted": count}


@router.get("/export")
def export_data(
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, list[VisitorMessageRead]]:
    """Return development JSON export without writing files."""

    require_dev_tools(settings)
    messages = export_dev_messages(db)
    return {"visitor_messages": [VisitorMessageRead.model_validate(message) for message in messages]}
