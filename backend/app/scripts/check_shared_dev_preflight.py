"""Read-only shared-development database preflight."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.core.config import SHARED_DEV_DATABASE_NAME, SHARED_DEV_DATABASE_USER, Settings, get_settings
from app.core.diagnostics import write_jsonl_event


class SharedDevPreflightError(RuntimeError):
    """Raised when shared-development database preflight fails."""


def get_code_alembic_heads(backend_dir: Path | None = None) -> list[str]:
    """Return code Alembic heads without mutating a database."""

    backend_dir = backend_dir or Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    return list(ScriptDirectory.from_config(config).get_heads())


def run_database_preflight(
    *,
    settings: Settings | None = None,
    engine_factory: Callable[[str], Engine] | None = None,
    code_heads_factory: Callable[[], list[str]] | None = None,
) -> dict[str, Any]:
    """Verify shared DB identity and revision using read-only SQL."""

    settings = settings or get_settings()
    if settings.personal_web_data_profile != "shared_remote":
        raise SharedDevPreflightError("Shared database preflight requires shared_remote profile")
    code_heads = (code_heads_factory or get_code_alembic_heads)()
    if len(code_heads) != 1:
        raise SharedDevPreflightError("Shared database preflight requires exactly one code Alembic head")
    code_head = code_heads[0]
    engine = (engine_factory or create_engine)(settings.database_url)
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                db_name = connection.execute(text("select current_database()")).scalar_one()
                db_user = connection.execute(text("select current_user")).scalar_one()
                db_revision = connection.execute(text("select version_num from alembic_version")).scalar_one()
                transaction.rollback()
            except Exception:
                transaction.rollback()
                raise
    finally:
        dispose = getattr(engine, "dispose", None)
        if dispose:
            dispose()

    if db_name != SHARED_DEV_DATABASE_NAME:
        raise SharedDevPreflightError("Shared database identity check failed")
    if db_user != SHARED_DEV_DATABASE_USER:
        raise SharedDevPreflightError("Shared database role check failed")
    if db_revision != code_head:
        raise SharedDevPreflightError("Shared database Alembic revision mismatch")
    result = {"ok": True, "database": "verified", "role": "verified", "alembicRevision": "matched"}
    write_jsonl_event("backend", "shared_dev.database_preflight.ok", result)
    return result


def main() -> int:
    try:
        print(json.dumps(run_database_preflight(), sort_keys=True))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": type(exc).__name__}, sort_keys=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
