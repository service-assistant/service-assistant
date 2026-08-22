from app.models import Organization
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

SYSTEM_ORGANIZATION_SLUG = "system"


async def get_system_organization_id(session: AsyncSession) -> int:
    result = await session.execute(
        select(Organization.id).where(Organization.slug == SYSTEM_ORGANIZATION_SLUG)
    )
    return result.scalar_one()
