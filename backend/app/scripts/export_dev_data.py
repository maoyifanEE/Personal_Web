"""Print development visitor message data as JSON."""

import json
import logging

from app.db.session import SessionLocal
from app.schemas.visitor_message import VisitorMessageRead
from app.services.visitor_message_service import export_dev_messages

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    with SessionLocal() as db:
        messages = export_dev_messages(db)
    payload = [VisitorMessageRead.model_validate(message).model_dump(mode="json") for message in messages]
    logger.info("Exported %s visitor messages to stdout", len(payload))
    print(json.dumps({"visitor_messages": payload}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
