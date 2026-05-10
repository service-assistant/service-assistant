from openai import AsyncAzureOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import TypedDict

from ..config import Settings


class RetrievedChunk(TypedDict):
    id: int
    content: str
    document_name: str
    page: int


async def embed_question(question: str, settings: Settings) -> list[float]:
    """
    Return embeddings for question
    """
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
    session: AsyncSession, embedded_vector: list[float]
) -> list[RetrievedChunk]:
    """
    Return 5 chunks closest to the embedded_vector with metadata
    """

    query = text("""
        SELECT id, content, document_name, page 
        FROM attachment_chunks
        ORDER BY embedding <-> :vector
        LIMIT 5
    """)

    result = await session.execute(query, {"vector": str(embedded_vector)})
    rows = result.fetchall()

    return [
        {
            "id": row[0],
            "content": row[1],
            "document_name": row[2],
            "page": row[3],
        }
        for row in rows
    ]
