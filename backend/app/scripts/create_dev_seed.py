"""Seed fake development visitor message data."""

import logging

from app.db.session import SessionLocal
from app.services.visitor_message_service import seed_dev_messages

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    with SessionLocal() as db:
        count = seed_dev_messages(db)
    logger.info("Seeded %s fake development visitor messages", count)
    print(f"SEEDED_FAKE_VISITOR_MESSAGES={count}")


if __name__ == "__main__":
    main()
