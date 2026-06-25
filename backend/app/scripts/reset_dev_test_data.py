"""Soft-delete development test/demo visitor messages."""

import logging

from app.db.session import SessionLocal
from app.services.visitor_message_service import reset_dev_test_data

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    with SessionLocal() as db:
        count = reset_dev_test_data(db)
    logger.info("Soft-deleted %s test/demo visitor messages", count)
    print(f"SOFT_DELETED_TEST_DEMO_MESSAGES={count}")


if __name__ == "__main__":
    main()
