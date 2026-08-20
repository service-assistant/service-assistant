from app.models import Category, ChatThread, Device
from sqlalchemy import select

from .base import Repository


class ThreadRepository(Repository[ChatThread]):
    async def get(self, id: int) -> ChatThread | None:
        return await self.session.scalar(
            select(ChatThread)
            .join(Device, Device.id == ChatThread.device_id)
            .join(Category, Category.id == Device.category_id)
            .where(
                ChatThread.id == id,
                Category.organization_id == self.organization_id,
            )
        )

    async def list(self) -> list[ChatThread]:
        result = await self.session.execute(
            select(ChatThread)
            .join(Device, Device.id == ChatThread.device_id)
            .join(Category, Category.id == Device.category_id)
            .where(Category.organization_id == self.organization_id)
        )
        return list(result.scalars().all())

    async def add(self, thread: ChatThread) -> ChatThread:
        self.session.add(thread)
        await self.session.commit()
        await self.session.refresh(thread)
        return thread

    async def delete(self, thread: ChatThread) -> None:
        await self.session.delete(thread)
        await self.session.commit()
