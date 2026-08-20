from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppRole, Organization, User


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_username_and_org_slug(
        self, organization_slug: str, username: str
    ) -> User | None:
        return await self.session.scalar(
            select(User)
            .join(Organization, Organization.id == User.organization_id)
            .where(
                Organization.slug == organization_slug,
                User.username == username,
            )
        )

    async def get_by_username_and_app_role(
        self, username: str, app_role: AppRole
    ) -> User | None:
        return await self.session.scalar(
            select(User).where(User.username == username, User.app_role == app_role)
        )

    async def get_by_id(self, user_id: int) -> User | None:
        return await self.session.get(User, user_id)

    async def list_for_organization(self, organization_id: int) -> list[User]:
        result = await self.session.execute(
            select(User)
            .where(User.organization_id == organization_id)
            .order_by(User.username)
        )
        return list(result.scalars().all())

    async def add(self, user: User) -> User:
        """Adds and flushes without committing, so callers (e.g. org creation,
        which also inserts the Organization row) can commit both in one
        transaction."""
        self.session.add(user)
        await self.session.flush()
        return user

    async def delete(self, user: User) -> None:
        await self.session.delete(user)
        await self.session.commit()
