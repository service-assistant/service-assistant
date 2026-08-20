from app.models import Attachment, Chunk
from sqlalchemy import func, select

from .base import Repository


class ChunkRepository(Repository[Chunk]):
    async def get(self, id: int) -> Chunk | None:
        return await self.session.scalar(
            select(Chunk)
            .join(Attachment, Attachment.id == Chunk.attachment_id)
            .where(
                Chunk.id == id,
                Attachment.organization_id == self.organization_id,
            )
        )

    async def list_page(
        self, page: int, page_size: int, attachment_id: int | None = None
    ) -> tuple[list[Chunk], int]:
        query = (
            select(Chunk)
            .join(Attachment, Attachment.id == Chunk.attachment_id)
            .where(Attachment.organization_id == self.organization_id)
            .order_by(Chunk.attachment_id, Chunk.id)
        )
        if attachment_id is not None:
            query = query.where(Chunk.attachment_id == attachment_id)

        total = await self.session.scalar(
            select(func.count()).select_from(query.subquery())
        )
        total = total or 0
        total_pages = max((total + page_size - 1) // page_size, 1)
        page = min(max(page, 1), total_pages)

        result = await self.session.execute(
            query.offset((page - 1) * page_size).limit(page_size)
        )
        return list(result.scalars().all()), total

    async def delete(self, chunk: Chunk) -> None:
        await self.session.delete(chunk)
        await self.session.commit()
