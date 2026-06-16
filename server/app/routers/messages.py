from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas import ChunkRead

router = APIRouter()


@router.get(
    "/{message_id}/chunks",
    response_model=list[ChunkRead],
    summary="Get source chunks for a message",
    description=(
        "Returns the document chunks that were retrieved from the vector store "
        "and used as RAG context when generating the assistant message. "
        "Only applicable to messages with `sender = system`."
    ),
    responses={404: {"description": "Message not found"}},
)
async def get_message_chunks(
    message_id: int,
    session: AsyncSession = Depends(get_session),
):
    exists = await session.execute(
        text("SELECT 1 FROM messages WHERE id = :id"),
        {"id": message_id},
    )
    if not exists.fetchone():
        raise HTTPException(status_code=404, detail="Message not found")

    result = await session.execute(
        text("""
            SELECT c.id, c.attachment_id, c.content, c.metadata, c.created_at, c.updated_at
            FROM chunks c
            JOIN chunks_messages cm ON c.id = cm.chunk_id
            WHERE cm.message_id = :message_id
        """),
        {"message_id": message_id},
    )
    rows = result.fetchall()
    return [
        ChunkRead(
            id=row[0],
            attachment_id=row[1],
            content=row[2],
            metadata=row[3],
            created_at=row[4],
            updated_at=row[5],
        )
        for row in rows
    ]
