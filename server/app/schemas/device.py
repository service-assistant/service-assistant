from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DeviceCreate(BaseModel):
    brand_id: int = Field(
        description="ID of the brand this device belongs to.", examples=[1]
    )
    device_type_id: int = Field(
        description="ID of the device type category.", examples=[2]
    )
    name: str = Field(
        description="Human-readable device name.", examples=["Toyota 8FBE20"]
    )
    model_serial_code: str | None = Field(
        default=None,
        description="Manufacturer model or serial code used for identification.",
        examples=["8FBE20-12345"],
    )
    image_url: str | None = Field(
        default=None,
        description="Publicly accessible URL of the device image.",
        examples=["https://example.com/images/toyota-8fbe20.jpg"],
    )


class DeviceUpdate(BaseModel):
    brand_id: int | None = Field(
        default=None, description="New brand ID.", examples=[1]
    )
    device_type_id: int | None = Field(
        default=None, description="New device type ID.", examples=[2]
    )
    name: str | None = Field(
        default=None, description="New device name.", examples=["Toyota 8FBE20"]
    )
    model_serial_code: str | None = Field(
        default=None,
        description="New model or serial code.",
        examples=["8FBE20-12345"],
    )
    image_url: str | None = Field(
        default=None,
        description="New image URL. Pass `null` to clear.",
        examples=["https://example.com/images/toyota-8fbe20-v2.jpg"],
    )


class DeviceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Unique device ID.")
    name: str = Field(
        description="Human-readable device name.", examples=["Toyota 8FBE20"]
    )
    model_serial_code: str | None = Field(
        description="Manufacturer model or serial code used for identification.",
        examples=["8FBE20-12345"],
    )
    image_url: str | None = Field(
        description="Publicly accessible URL of the device image.",
        examples=["https://example.com/images/toyota-8fbe20.jpg"],
    )
    brand_id: int = Field(
        description="ID of the brand this device belongs to.", examples=[1]
    )
    device_type_id: int = Field(
        description="ID of the device type category.", examples=[2]
    )
    created_at: datetime = Field(description="Timestamp when the device was created.")
    updated_at: datetime = Field(description="Timestamp of the last update.")
