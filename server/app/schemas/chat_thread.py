from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ThreadCreate(BaseModel):
    device_id: int = Field(
        description="ID of the device this chat thread is about.",
        examples=[1],
    )
    title: str = Field(
        description="Short descriptive title for the thread.",
        examples=["Mast won't lift under load"],
    )


class ChatThreadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Unique thread ID.")
    title: str = Field(
        description="Short descriptive title for the thread.",
        examples=["Mast won't lift under load"],
    )
    device_id: int = Field(
        description="ID of the device this thread is about.", examples=[1]
    )
    created_at: datetime = Field(description="Timestamp when the thread was created.")
    updated_at: datetime = Field(description="Timestamp of the last update.")
