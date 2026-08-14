from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, utcnow
from .associations import AttachmentDevice

if TYPE_CHECKING:
    from .attachment import Attachment
    from .brand import Brand
    from .chat_thread import ChatThread
    from .device_type import DeviceType


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    model_serial_code: Mapped[str | None]
    image_url: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    brand_id: Mapped[int] = mapped_column(
        ForeignKey(
            "brands.id",
            ondelete="RESTRICT",
        )
    )
    brand: Mapped[Brand] = relationship(
        back_populates="devices",
        lazy="raise",
    )

    device_type_id: Mapped[int] = mapped_column(
        ForeignKey(
            "device_types.id",
            ondelete="RESTRICT",
        )
    )
    device_type: Mapped[DeviceType] = relationship(
        back_populates="devices",
        lazy="raise",
    )

    threads: Mapped[list[ChatThread]] = relationship(
        back_populates="device",
        lazy="raise",
    )

    attachments: Mapped[list[Attachment]] = relationship(
        back_populates="devices",
        secondary=AttachmentDevice.__table__,
        passive_deletes=True,
        lazy="raise",
    )
