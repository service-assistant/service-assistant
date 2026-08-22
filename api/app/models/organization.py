from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import VARCHAR, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, utcnow

if TYPE_CHECKING:
    from .attachment import Attachment
    from .category import Category
    from .user import User


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(VARCHAR(255))
    # Unique constraint already gives Postgres an index; no need for a second one
    # given we expect only a handful of organizations.
    slug: Mapped[str] = mapped_column(VARCHAR(255), unique=True)
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

    users: Mapped[list[User]] = relationship(
        back_populates="organization",
        passive_deletes=True,
        lazy="raise",
    )
    categories: Mapped[list[Category]] = relationship(
        back_populates="organization",
        passive_deletes=True,
        lazy="raise",
    )
    attachments: Mapped[list[Attachment]] = relationship(
        back_populates="organization",
        passive_deletes=True,
        lazy="raise",
    )
