from app.models import Category
from sqlalchemy import select

from .base import OrgScopedRepository


class CategoryRepository(OrgScopedRepository[Category]):
    model = Category

    async def list_roots(self) -> list[Category]:
        result = await self.session.execute(
            select(Category).where(
                Category.organization_id == self.organization_id,
                Category.parent_id.is_(None),
            )
        )
        return list(result.scalars().all())

    async def list_all(self) -> list[Category]:
        return await self.list()

    async def list_children(self, parent_id: int) -> list[Category]:
        result = await self.session.execute(
            select(Category).where(
                Category.organization_id == self.organization_id,
                Category.parent_id == parent_id,
            )
        )
        return list(result.scalars().all())

    async def get_parent_id(self, category_id: int) -> int | None:
        return await self.session.scalar(
            select(Category.parent_id).where(
                Category.organization_id == self.organization_id,
                Category.id == category_id,
            )
        )

    async def update(self, category: Category, **fields: object) -> Category:
        for field, value in fields.items():
            setattr(category, field, value)
        self.session.add(category)
        await self.session.commit()
        await self.session.refresh(category)
        return category
