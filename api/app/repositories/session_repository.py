from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import utcnow
from app.models import User, UserSession
from app.security import generate_session_token, hash_session_token


class SessionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_session(
        self, user: User, idle_timeout_minutes: int
    ) -> tuple[UserSession, str]:
        raw_token = generate_session_token()
        user_session = UserSession(
            user_id=user.id,
            token_hash=hash_session_token(raw_token),
            expires_at=utcnow() + timedelta(minutes=idle_timeout_minutes),
        )
        self.session.add(user_session)
        await self.session.commit()
        await self.session.refresh(user_session)
        return user_session, raw_token

    async def get_active_session_by_token(self, raw_token: str) -> UserSession | None:
        token_hash = hash_session_token(raw_token)
        return await self.session.scalar(
            select(UserSession).where(
                UserSession.token_hash == token_hash,
                UserSession.expires_at > utcnow(),
            )
        )

    async def touch_session(
        self,
        user_session: UserSession,
        idle_timeout_minutes: int,
        extend_threshold_minutes: int,
    ) -> None:
        now = utcnow()
        # expires_at drifts down toward `now` as the session sits idle. If it's
        # still within `extend_threshold_minutes` of a full fresh expiry, the
        # session was touched recently enough — skip the write. This reconstructs
        # "time since last touch" from expires_at alone, no separate column needed.
        fresh_expiry = now + timedelta(minutes=idle_timeout_minutes)
        if fresh_expiry - user_session.expires_at < timedelta(
            minutes=extend_threshold_minutes
        ):
            return
        user_session.expires_at = fresh_expiry
        self.session.add(user_session)
        await self.session.commit()

    async def revoke_session_by_token(self, raw_token: str) -> None:
        user_session = await self.get_active_session_by_token(raw_token)
        if user_session is None:
            return
        user_session.expires_at = utcnow() - timedelta(seconds=1)
        self.session.add(user_session)
        await self.session.commit()
