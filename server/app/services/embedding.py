from typing import TypedDict

from openai import AsyncAzureOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
# from sqlmodel import select

from ..config import Settings
from ..models import AttachmentDevice, Chunk


class RetrievedChunk(TypedDict):
    id: int
    content: str
    attachment_id: int
    extra_metadata: dict | None


async def embed_question(question: str, settings: Settings) -> list[float]:
    client = AsyncAzureOpenAI(
        api_version=settings.azure_openai_api_version,
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
    )
    response = await client.embeddings.create(
        input=question, model=settings.azure_openai_embeddings_deployment
    )
    return response.data[0].embedding


async def get_close_chunks(
    session: AsyncSession,
    embedded_vector: list[float],
    device_id: int,
) -> list[RetrievedChunk]:
    result = await session.scalars(
        select(Chunk)
        .join(AttachmentDevice, AttachmentDevice.attachment_id == Chunk.attachment_id)
        .where(AttachmentDevice.device_id == device_id)
        .order_by(Chunk.embedding.op("<->")(embedded_vector))
        .limit(5)
    )
    chunks = result.all()

    return [
        {
            "id": chunk.id,
            "content": chunk.content,
            "attachment_id": chunk.attachment_id,
            "extra_metadata": chunk.extra_metadata,
        }
        for chunk in chunks
    ]
