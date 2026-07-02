"""FastAPI application entrypoint for the local backend foundation."""

import logging
from time import perf_counter
from uuid import uuid4

from fastapi import Request
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.diagnostics import write_jsonl_event

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


@app.middleware("http")
async def add_request_diagnostics(request: Request, call_next):
    """Attach a request id and write local-development request diagnostics."""

    request_id = request.headers.get("X-Request-ID") or uuid4().hex
    request.state.request_id = request_id
    start = perf_counter()
    write_jsonl_event(
        "backend",
        "request.start",
        {
            "requestId": request_id,
            "method": request.method,
            "path": request.url.path,
            "query": request.url.query,
        },
    )
    try:
        response = await call_next(request)
    except Exception as error:
        write_jsonl_event(
            "backend",
            "request.error",
            {
                "requestId": request_id,
                "method": request.method,
                "path": request.url.path,
                "error": str(error),
            },
        )
        raise
    duration_ms = round((perf_counter() - start) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    write_jsonl_event(
        "backend",
        "request.complete",
        {
            "requestId": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "durationMs": duration_ms,
        },
    )
    return response


@app.get("/")
def backend_root() -> dict[str, str]:
    """Small backend root route for local API discovery."""

    return {
        "app": settings.app_name,
        "status": "backend foundation active",
        "docs": f"{settings.api_prefix}/health",
    }
