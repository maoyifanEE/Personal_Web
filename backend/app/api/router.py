"""Top-level API router."""

from fastapi import APIRouter

from app.api.routes import admin_data, admin_users, auth, dev_data, health, homepage, visitor_messages

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(homepage.router, tags=["homepage"])
api_router.include_router(visitor_messages.router, tags=["visitor messages"])
api_router.include_router(dev_data.router, prefix="/dev", tags=["development data"])
api_router.include_router(admin_data.router, prefix="/admin/data", tags=["admin data"])
api_router.include_router(admin_users.router, tags=["admin users"])
