from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CategoryCreate(BaseModel):
    name: str = Field(description="Display name of the category.", examples=["Toyota"])
    image_url: str | None = Field(
        default=None,
        description="Publicly accessible URL of the category image.",
        examples=["https://example.com/categories/toyota.png"],
    )
    parent_id: int | None = Field(
        default=None,
        description="ID of the parent category, or `null` for a root category.",
        examples=[1],
    )


class CategoryUpdate(BaseModel):
    name: str | None = Field(
        default=None,
        description="New display name.",
        examples=["Toyota Material Handling"],
    )
    image_url: str | None = Field(
        default=None,
        description="New image URL. Pass `null` to clear the existing value.",
        examples=["https://example.com/categories/toyota_v2.png"],
    )
    parent_id: int | None = Field(
        default=None,
        description="New parent category ID. Pass `null` to make it a root category.",
        examples=[1],
    )


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Unique category ID.")
    name: str = Field(description="Display name of the category.", examples=["Toyota"])
    image_url: str | None = Field(
        description="Publicly accessible URL of the category image.",
        examples=["https://example.com/categories/toyota.png"],
    )
    parent_id: int | None = Field(
        description="ID of the parent category, or `null` for a root category.",
        examples=[1],
    )
    created_at: datetime = Field(description="Timestamp when the category was created.")
    updated_at: datetime = Field(description="Timestamp of the last update.")


class CategoryTreeRead(CategoryRead):
    children: list["CategoryTreeRead"] = Field(
        default_factory=list,
        description="Direct child categories, recursively nested.",
    )
