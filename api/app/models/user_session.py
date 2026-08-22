from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import VARCHAR, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, utcnow

if TYPE_CHECKING:
    from .user import User


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    # SHA-256 hex digest of the opaque session token handed to the client (in
    # the login response body and the session cookie). The raw token is never
    # stored — same principle as passwords — so a DB read alone can't be used
    # to replay a session; the request must present the matching raw token.
    token_hash: Mapped[str] = mapped_column(VARCHAR(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=utcnow,
    )
    # Sliding expiration: pushed forward on activity (see touch_session) and
    # set to a past timestamp on logout, so "expired" and "revoked" are the
    # same check (expires_at <= now) — no separate revoked_at column needed.
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(
        back_populates="sessions",
        lazy="raise",
    )
