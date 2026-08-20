from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Organization

# Organizations aren't tenant data scoped to a single org — they're the list
# of tenants itself, only ever managed by app_admin — so this repository
# takes no organization_id, unlike every other one.


class OrganizationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, organization_id: int) -> Organization | None:
        return await self.session.get(Organization, organization_id)

    async def list(self) -> list[Organization]:
        result = await self.session.execute(
            select(Organization).order_by(Organization.name)
        )
        return list(result.scalars().all())

    async def add(self, organization: Organization) -> Organization:
        self.session.add(organization)
        await self.session.flush()
        return organization
