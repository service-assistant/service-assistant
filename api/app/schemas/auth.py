from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    organization_slug: str = Field(description="Slug of the organization to log into.")
    username: str = Field(description="Username within the organization.")
    password: str = Field(description="Account password.")


class AdminLoginRequest(BaseModel):
    username: str = Field(description="Username of the app_admin account.")
    password: str = Field(description="Account password.")


class UserRead(BaseModel):
    id: int
    organization_id: int
    organization_slug: str
    username: str
    app_role: str
    org_role: str


class LoginResponse(BaseModel):
    token: str = Field(
        description="Opaque session token; also set as an httponly cookie."
    )
    user: UserRead


class SessionResponse(BaseModel):
    authenticated: bool
    user: UserRead | None = None
