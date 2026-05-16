from typing import TypedDict

from openai import AsyncAzureOpenAI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings


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
    device_id: int | None = None,
) -> list[RetrievedChunk]:
    if device_id is not None:
        query = text("""
            SELECT c.id, c.content, c.attachment_id, c.metadata
            FROM chunks c
            JOIN attachments_devices ad ON c.attachment_id = ad.attachment_id
            WHERE ad.device_id = :device_id
            ORDER BY c.embedding <-> :vector
            LIMIT 5
        """)
        result = await session.execute(
            query, {"vector": str(embedded_vector), "device_id": device_id}
        )
    else:
        query = text("""
            SELECT id, content, attachment_id, metadata
            FROM chunks
            ORDER BY embedding <-> :vector
            LIMIT 5
        """)
        result = await session.execute(query, {"vector": str(embedded_vector)})

    rows = result.fetchall()
    return [
        {
            "id": row[0],
            "content": row[1],
            "attachment_id": row[2],
            "extra_metadata": row[3],
        }
        for row in rows
    ]
