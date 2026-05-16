from datetime import datetime
from enum import Enum
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

EMBEDDING_DIMENSIONS = 1536


def utcnow() -> datetime:
    return datetime.utcnow()


class MessageSender(str, Enum):
    user = "user"
    system = "system"


class Brand(SQLModel, table=True):
    __tablename__ = "brands"  # type: ignore[assignment]

    id: int | None = Field(default=None, primary_key=True)
    name: str
    logo_url: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class DeviceType(SQLModel, table=True):
    __tablename__ = "device_types"  # type: ignore[assignment]

    id: int | None = Field(default=None, primary_key=True)
    name: str
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Device(SQLModel, table=True):
    __tablename__ = "devices"  # type: ignore[assignment]

    id: int | None = Field(default=None, primary_key=True)
    brand_id: int = Field(foreign_key="brands.id", ondelete="RESTRICT")
    device_type_id: int = Field(foreign_key="device_types.id", ondelete="RESTRICT")
    name: str
    model_serial_code: str | None = None
    image_url: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Attachment(SQLModel, table=True):
    __tablename__ = "attachments"  # type: ignore[assignment]

    id: int | None = Field(default=None, primary_key=True)
    file_global_path: str
    original_filename: str
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class AttachmentDevice(SQLModel, table=True):
    __tablename__ = "attachments_devices"  # type: ignore[assignment]

    device_id: int = Field(
        foreign_key="devices.id", primary_key=True, ondelete="CASCADE"
    )
    attachment_id: int = Field(
        foreign_key="attachments.id", primary_key=True, ondelete="CASCADE"
    )
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Chunk(SQLModel, table=True):
    __tablename__ = "chunks"  # type: ignore[assignment]

    id: int | None = Field(default=None, primary_key=True)
    attachment_id: int = Field(foreign_key="attachments.id", ondelete="CASCADE")
    content: str
    embedding: Any = Field(
        sa_column=Column(Vector(EMBEDDING_DIMENSIONS), nullable=False)
    )
    extra_metadata: dict | None = Field(
        default=None, sa_column=Column("metadata", JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ChatThread(SQLModel, table=True):
    __tablename__ = "chat_threads"  # type: ignore[assignment]

    id: int | None = Field(default=None, primary_key=True)
    title: str
    device_id: int = Field(foreign_key="devices.id", ondelete="RESTRICT")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Message(SQLModel, table=True):
    __tablename__ = "messages"  # type: ignore[assignment]

    id: int | None = Field(default=None, primary_key=True)
    content: str
    thread_id: int = Field(foreign_key="chat_threads.id", ondelete="CASCADE")
    image_url: str | None = None
    sender: MessageSender = Field(sa_type=String)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ChunkMessage(SQLModel, table=True):
    __tablename__ = "chunks_messages"  # type: ignore[assignment]

    message_id: int = Field(
        foreign_key="messages.id", primary_key=True, ondelete="CASCADE"
    )
    chunk_id: int = Field(foreign_key="chunks.id", primary_key=True, ondelete="CASCADE")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
