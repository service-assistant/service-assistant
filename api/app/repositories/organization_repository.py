from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, ChatThread, Device, Organization

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

    async def update(
        self, organization: Organization, **fields: object
    ) -> Organization:
        for field, value in fields.items():
            setattr(organization, field, value)
        self.session.add(organization)
        await self.session.commit()
        await self.session.refresh(organization)
        return organization

    async def delete(self, organization: Organization) -> None:
        # devices.category_id and chat_threads.device_id are ON DELETE
        # RESTRICT (guard rails for the single-entity delete endpoints), so a
        # cascading delete of the whole tenant has to clear them explicitly
        # before the CASCADE from Organization to Category can go through.
        category_ids_subq = select(Category.id).where(
            Category.organization_id == organization.id
        )
        device_ids_subq = select(Device.id).where(
            Device.category_id.in_(category_ids_subq)
        )
        await self.session.execute(
            sa_delete(ChatThread).where(ChatThread.device_id.in_(device_ids_subq))
        )
        await self.session.execute(
            sa_delete(Device).where(Device.category_id.in_(category_ids_subq))
        )
        await self.session.delete(organization)
        await self.session.flush()
