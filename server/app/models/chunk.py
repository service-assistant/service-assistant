from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, utcnow
from .associations import ChunkMessage

if TYPE_CHECKING:
    from .attachment import Attachment
    from .message import Message

EMBEDDING_DIMENSIONS = 1536


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[int] = mapped_column(primary_key=True)
    content: Mapped[str]
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
    extra_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    attachment_id: Mapped[int] = mapped_column(
        ForeignKey(
            "attachments.id",
            ondelete="CASCADE",
        )
    )
    attachment: Mapped[Attachment] = relationship(
        back_populates="chunks",
        lazy="raise",
    )

    messages: Mapped[list[Message]] = relationship(
        back_populates="chunks",
        secondary=ChunkMessage.__table__,
        passive_deletes=True,
        lazy="raise",
    )
