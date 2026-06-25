"""Top-level API router."""

from fastapi import APIRouter

from app.api.routes import admin_data, dev_data, health, visitor_messages

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(visitor_messages.router, tags=["visitor messages"])
api_router.include_router(dev_data.router, prefix="/dev", tags=["development data"])
api_router.include_router(admin_data.router, prefix="/admin/data", tags=["admin data"])
