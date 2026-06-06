from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BrandCreate(BaseModel):
    name: str = Field(description="Display name of the brand.", examples=["Toyota"])
    logo_url: str | None = Field(
        default=None,
        description="Publicly accessible URL of the brand logo image.",
        examples=["https://example.com/logos/toyota.png"],
    )


class BrandUpdate(BaseModel):
    name: str | None = Field(
        default=None,
        description="New display name.",
        examples=["Toyota Material Handling"],
    )
    logo_url: str | None = Field(
        default=None,
        description="New logo URL. Pass `null` to clear the existing value.",
        examples=["https://example.com/logos/toyota_v2.png"],
    )


class BrandRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Unique brand ID.")
    name: str = Field(description="Display name of the brand.", examples=["Toyota"])
    logo_url: str | None = Field(
        description="Publicly accessible URL of the brand logo image.",
        examples=["https://example.com/logos/toyota.png"],
    )
    created_at: datetime = Field(description="Timestamp when the brand was created.")
    updated_at: datetime = Field(description="Timestamp of the last update.")
