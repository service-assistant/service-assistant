from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, utcnow
from .associations import AttachmentDevice

if TYPE_CHECKING:
    from .chunk import Chunk
    from .device import Device


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    file_global_path: Mapped[str]
    original_filename: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    chunks: Mapped[list[Chunk]] = relationship(
        back_populates="attachment",
        passive_deletes=True,
        lazy="raise",
    )

    devices: Mapped[list[Device]] = relationship(
        back_populates="attachments",
        secondary=AttachmentDevice.__table__,
        passive_deletes=True,
        lazy="raise",
    )
