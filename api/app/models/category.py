from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import VARCHAR, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, utcnow

if TYPE_CHECKING:
    from .device import Device


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(VARCHAR(255))
    image_url: Mapped[str | None] = mapped_column(VARCHAR(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=utcnow,
        onupdate=utcnow,
    )

    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id"),
    )
    parent: Mapped[Category | None] = relationship(
        remote_side=[id],
        back_populates="children",
        lazy="raise",
    )
    children: Mapped[list[Category]] = relationship(
        back_populates="parent",
        lazy="raise",
        passive_deletes=True,
    )

    devices: Mapped[list[Device]] = relationship(
        back_populates="category",
        lazy="raise",
    )
