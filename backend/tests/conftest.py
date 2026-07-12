"""Isolated test fixtures for backend route tests."""

import os
import sys
from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SESSION_SECRET", "test-session-secret")
os.environ.setdefault("MESSAGE_RATE_LIMIT_ENABLED", "true")
os.environ.setdefault("MESSAGE_RATE_LIMIT_MAX", "5")
os.environ.setdefault("MESSAGE_RATE_LIMIT_WINDOW_SECONDS", "600")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.api.dependencies import get_db_session  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db import models  # noqa: F401, E402
from app.main import app  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.auth import AppUser, AuthSession, Permission, Role, RolePermission, UserRole  # noqa: E402
from app.models.visitor_message import VisitorMessage  # noqa: E402
from app.services.rbac_service import ensure_auth_roles_permissions  # noqa: E402


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    test_tables = [
        AppUser.__table__,
        AuditLog.__table__,
        Role.__table__,
        Permission.__table__,
        UserRole.__table__,
        RolePermission.__table__,
        AuthSession.__table__,
        VisitorMessage.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=test_tables)
    with TestingSessionLocal() as session:
        ensure_auth_roles_permissions(session)
        session.commit()
        yield session
    Base.metadata.drop_all(bind=engine, tables=test_tables)
    engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_db_session() -> Generator[Session, None, None]:
        yield db_session

    get_settings.cache_clear()
    app.dependency_overrides[get_db_session] = override_db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def create_user_with_role(db: Session, *, username: str, role_key: str, password: str = "password123") -> AppUser:
    user = AppUser(
        username=username,
        email=f"{username}@example.test",
        display_name=username.title(),
        password_hash=hash_password(password),
    )
    db.add(user)
    db.flush()
    role = db.execute(select(Role).where(Role.role_key == role_key)).scalar_one()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def admin_user(db_session: Session) -> AppUser:
    return create_user_with_role(db_session, username="admin", role_key="admin", password="adminpass")


@pytest.fixture()
def normal_user(db_session: Session) -> AppUser:
    return create_user_with_role(db_session, username="user", role_key="user", password="userpass")
