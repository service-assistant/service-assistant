from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SAEnum
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, utcnow
from .associations import ChunkMessage

if TYPE_CHECKING:
    from .chat_thread import ChatThread
    from .chunk import Chunk


class MessageSender(str, Enum):
    user = "user"
    assistant = "assistant"


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    content: Mapped[str]
    sender: Mapped[MessageSender] = mapped_column(
        SAEnum(MessageSender, native_enum=False)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    thread_id: Mapped[int] = mapped_column(
        ForeignKey(
            "chat_threads.id",
            ondelete="CASCADE",
        )
    )
    thread: Mapped[ChatThread] = relationship(
        back_populates="messages",
        lazy="raise",
    )

    chunks: Mapped[list[Chunk]] = relationship(
        back_populates="messages",
        secondary=ChunkMessage.__table__,
        passive_deletes=True,
        lazy="raise",
    )
