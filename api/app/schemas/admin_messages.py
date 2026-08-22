from datetime import datetime

from pydantic import BaseModel

from .message import MessageRead


class DebugMessageDeviceRead(BaseModel):
    id: int
    name: str
    model_serial_code: str | None
    organization_id: int
    organization_name: str
    organization_slug: str


class DebugMessageThreadRead(BaseModel):
    id: int
    title: str
    device_id: int
    device_name: str
    organization_id: int
    organization_name: str
    organization_slug: str
    message_count: int
    last_message_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DebugMessageChunkRead(BaseModel):
    id: int
    attachment_id: int
    attachment_name: str
    content: str
    metadata: dict | None


class DebugMessageRead(MessageRead):
    chunks: list[DebugMessageChunkRead]
