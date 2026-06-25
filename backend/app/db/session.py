"""Database engine and FastAPI session dependency."""

import logging
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

logger.info("Initializing PostgreSQL engine for app environment %s", settings.app_env)

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db_session() -> Generator[Session, None, None]:
    """Yield a database session and always close it after request handling."""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
