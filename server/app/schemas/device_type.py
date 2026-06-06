from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DeviceTypeCreate(BaseModel):
    name: str = Field(
        description="Display name of the device type.",
        examples=["Counterbalance Forklift"],
    )


class DeviceTypeUpdate(BaseModel):
    name: str | None = Field(
        default=None,
        description="New display name for the device type.",
        examples=["Counterbalance Forklift"],
    )


class DeviceTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Unique device type ID.")
    name: str = Field(
        description="Display name of the device type.",
        examples=["Counterbalance Forklift"],
    )
    created_at: datetime = Field(
        description="Timestamp when the device type was created."
    )
    updated_at: datetime = Field(description="Timestamp of the last update.")
