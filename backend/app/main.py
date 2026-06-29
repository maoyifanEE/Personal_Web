"""FastAPI application entrypoint for the local backend foundation."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()

logger.info(
    "Starting %s in env=%s debug=%s dev_tools=%s",
    settings.app_name,
    settings.app_env,
    settings.app_debug,
    settings.allow_dev_tools,
)

app = FastAPI(
    title=settings.app_name,
    debug=settings.app_debug,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/")
def backend_root() -> dict[str, str]:
    """Small backend root route for local API discovery."""

    return {
        "app": settings.app_name,
        "status": "backend foundation active",
        "docs": f"{settings.api_prefix}/health",
    }
