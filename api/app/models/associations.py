from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class AttachmentDevice(Base):
    __tablename__ = "attachments_devices"

    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    attachment_id: Mapped[int] = mapped_column(
        ForeignKey("attachments.id", ondelete="CASCADE"), primary_key=True
    )


class ChunkMessage(Base):
    __tablename__ = "chunks_messages"

    message_id: Mapped[int] = mapped_column(
        ForeignKey(
            "messages.id",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )
    chunk_id: Mapped[int] = mapped_column(
        ForeignKey(
            "chunks.id",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )
