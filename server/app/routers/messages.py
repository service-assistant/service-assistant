from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session

router = APIRouter()


class ChunkPublic(BaseModel):
    id: int = Field(description="Unique chunk ID.")
    attachment_id: int = Field(
        description="ID of the attachment this chunk was extracted from."
    )
    content: str = Field(description="Raw text content of the chunk.")
    metadata: dict | None = Field(
        default=None,
        description="Optional metadata stored alongside the chunk (e.g. page number).",
    )
    created_at: datetime
    updated_at: datetime


@router.get(
    "/{message_id}/chunks",
    response_model=list[ChunkPublic],
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
        ChunkPublic(
            id=row[0],
            attachment_id=row[1],
            content=row[2],
            metadata=row[3],
            created_at=row[4],
            updated_at=row[5],
        )
        for row in rows
    ]
