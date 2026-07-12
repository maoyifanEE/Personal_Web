"""Public visitor message API routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.schemas.visitor_message import VisitorMessageCreate, VisitorMessagePublicAcceptedResponse
from app.services.visitor_message_service import create_visitor_message

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/messages")


@router.post("", response_model=VisitorMessagePublicAcceptedResponse, status_code=status.HTTP_201_CREATED)
def create_message(
    payload: VisitorMessageCreate,
    request: Request,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> VisitorMessagePublicAcceptedResponse:
    """Accept a public visitor message without exposing storage internals."""

    try:
        result = create_visitor_message(
            db,
            payload,
            settings,
            client_host=request.client.host if request.client else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result.rate_limited:
        headers = {"Retry-After": str(result.retry_after_seconds)} if result.retry_after_seconds else None
        logger.warning("Visitor message public create rejected by rate limit")
        raise HTTPException(
            status_code=429,
            detail="Please wait before submitting another message",
            headers=headers,
        )

    return VisitorMessagePublicAcceptedResponse(accepted=True)
