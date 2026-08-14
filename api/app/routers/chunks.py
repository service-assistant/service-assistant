from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Chunk
from app.schemas import ChunkRead

router = APIRouter()

_PAGE_SIZE = 20


@router.get(
    "",
    response_model=list[ChunkRead],
    summary="List chunks",
    description="Returns a paginated list of chunks, optionally filtered by attachment.",
)
async def list_chunks(
    session: AsyncSession = Depends(get_session),
    attachment_id: int | None = None,
    page: int = 1,
):
    page = max(page, 1)
    query = select(Chunk).order_by(Chunk.attachment_id, Chunk.id)
    if attachment_id is not None:
        query = query.where(Chunk.attachment_id == attachment_id)

    total_result = await session.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = total_result.scalar_one()
    total_pages = max((total + _PAGE_SIZE - 1) // _PAGE_SIZE, 1)
    page = min(page, total_pages)

    result = await session.execute(
        query.offset((page - 1) * _PAGE_SIZE).limit(_PAGE_SIZE)
    )
    return result.scalars().all()


@router.delete(
    "/{chunk_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a chunk",
    description="Permanently deletes a single chunk by its ID.",
    responses={404: {"description": "Chunk not found"}},
)
async def delete_chunk(chunk_id: int, session: AsyncSession = Depends(get_session)):
    chunk = await session.get(Chunk, chunk_id)
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")
    await session.delete(chunk)
    await session.commit()
