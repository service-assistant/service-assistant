from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import VARCHAR, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, utcnow

if TYPE_CHECKING:
    from .organization import Organization
    from .user_session import UserSession


class AppRole(str, Enum):
    # Regular application user. Everyone except us.
    user = "user"
    # Us — application owners. Only role allowed into the debug app.
    admin = "admin"


class OrgRole(str, Enum):
    # Full privileges within their own org for now; a lower-privilege
    # "member" role with restricted permissions is future work.
    member = "member"
    admin = "admin"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("organization_id", "username"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
    )
    username: Mapped[str] = mapped_column(VARCHAR(255))
    password_hash: Mapped[str] = mapped_column(VARCHAR(255))
    app_role: Mapped[AppRole] = mapped_column(SAEnum(AppRole, native_enum=False))
    org_role: Mapped[OrgRole] = mapped_column(SAEnum(OrgRole, native_enum=False))
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

    organization: Mapped[Organization] = relationship(
        back_populates="users",
        lazy="raise",
    )
    sessions: Mapped[list[UserSession]] = relationship(
        back_populates="user",
        passive_deletes=True,
        lazy="raise",
    )
