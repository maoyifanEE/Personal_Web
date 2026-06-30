"""Auth API schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    username: str | None = Field(default=None, max_length=254)
    username_or_email: str | None = Field(default=None, alias="usernameOrEmail", max_length=254)
    password: str = Field(..., min_length=1, max_length=256)


class SafeUser(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    username: str
    display_name: str = Field(alias="displayName")
    email: str | None = None
    status: str | None = None


class AuthState(BaseModel):
    authenticated: bool
    role: str = "guest"
    user: SafeUser | None = None
    roles: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)


class CsrfResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    authenticated: bool
    csrf_token: str | None = Field(default=None, alias="csrfToken")


class RoleRead(BaseModel):
    key: str
    name: str
    description: str | None = None


class AdminUserRead(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    username: str
    display_name: str = Field(alias="displayName")
    email: str | None = None
    status: str
    roles: list[str]
    last_login_at: datetime | None = Field(default=None, alias="lastLoginAt")
    created_at: datetime = Field(alias="createdAt")
    disabled_at: datetime | None = Field(default=None, alias="disabledAt")


class AdminUserCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    username: str = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=1, max_length=256)
    display_name: str | None = Field(default=None, alias="displayName", max_length=120)
    email: str | None = Field(default=None, max_length=254)
    roles: list[str] = Field(default_factory=lambda: ["user"])


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    display_name: str | None = Field(default=None, alias="displayName", max_length=120)
    email: str | None = Field(default=None, max_length=254)
    is_active: bool | None = Field(default=None, alias="isActive")


class PasswordResetRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=256)


class RoleAssignRequest(BaseModel):
    role: str
