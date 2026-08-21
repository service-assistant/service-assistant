from app.models import Category, ChatThread, Chunk, ChunkMessage, Device, Message
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .base import Repository


class MessageRepository(Repository[Message]):
    async def list_for_thread(self, thread_id: int) -> list[Message]:
        result = await self.session.execute(
            select(Message)
            .join(ChatThread, ChatThread.id == Message.thread_id)
            .join(Device, Device.id == ChatThread.device_id)
            .join(Category, Category.id == Device.category_id)
            .where(
                Message.thread_id == thread_id,
                Category.organization_id == self.organization_id,
            )
            .order_by(Message.created_at)
        )
        return list(result.scalars().all())

    async def get(self, id: int) -> Message | None:
        return await self.session.scalar(
            select(Message)
            .join(ChatThread, ChatThread.id == Message.thread_id)
            .join(Device, Device.id == ChatThread.device_id)
            .join(Category, Category.id == Device.category_id)
            .where(
                Message.id == id,
                Category.organization_id == self.organization_id,
            )
        )

    async def list_chunks(self, message_id: int) -> list[Chunk]:
        result = await self.session.execute(
            select(Chunk)
            .join(ChunkMessage, ChunkMessage.chunk_id == Chunk.id)
            .join(Message, Message.id == ChunkMessage.message_id)
            .join(ChatThread, ChatThread.id == Message.thread_id)
            .join(Device, Device.id == ChatThread.device_id)
            .join(Category, Category.id == Device.category_id)
            .where(
                ChunkMessage.message_id == message_id,
                Category.organization_id == self.organization_id,
            )
        )
        return list(result.scalars().all())

    async def list_recent_for_thread(self, thread_id: int, limit: int) -> list[Message]:
        result = await self.session.execute(
            select(Message)
            .join(ChatThread, ChatThread.id == Message.thread_id)
            .join(Device, Device.id == ChatThread.device_id)
            .join(Category, Category.id == Device.category_id)
            .where(
                Message.thread_id == thread_id,
                Category.organization_id == self.organization_id,
            )
            .order_by(Message.created_at.desc())
            .limit(limit)
            .options(selectinload(Message.chunks))
        )
        return list(result.scalars().all())
