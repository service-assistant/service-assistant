from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, utcnow
from .associations import AttachmentDevice

if TYPE_CHECKING:
    from .attachment import Attachment
    from .category import Category
    from .chat_thread import ChatThread


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    model_serial_code: Mapped[str | None]
    image_url: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=utcnow,
        onupdate=utcnow,
    )

    category_id: Mapped[int] = mapped_column(
        ForeignKey(
            "categories.id",
            ondelete="RESTRICT",
        ),
        index=True,
    )
    category: Mapped[Category] = relationship(
        back_populates="devices",
        lazy="raise",
    )

    threads: Mapped[list[ChatThread]] = relationship(
        back_populates="device",
        passive_deletes=True,
        lazy="raise",
    )

    attachments: Mapped[list[Attachment]] = relationship(
        back_populates="devices",
        secondary=AttachmentDevice.__table__,
        passive_deletes=True,
        lazy="raise",
    )
