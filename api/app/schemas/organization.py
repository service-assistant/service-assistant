from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .auth import UserRead


class OrganizationCreate(BaseModel):
    name: str = Field(
        description="Display name of the organization.", examples=["Acme Forklifts"]
    )
    slug: str = Field(
        description="Unique, URL-safe identifier used to log in.", examples=["acme"]
    )
    admin_username: str = Field(
        description="Username for the organization's first user.", examples=["alice"]
    )
    admin_password: str = Field(
        description="Password for the organization's first user.", min_length=8
    )


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, description="New display name.")
    slug: str | None = Field(
        default=None, description="New unique, URL-safe identifier used to log in."
    )


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    created_at: datetime
    updated_at: datetime


class OrganizationCreateResponse(BaseModel):
    organization: OrganizationRead
    admin_user: UserRead
