from openai import AzureOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from ..config import Settings


def embed_question(question: str, settings: Settings) -> list[float]:
    """
    Return embeddings for question
    """
    client = AzureOpenAI(
        api_version=settings.azure_openai_api_version,
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
    )

    response = client.embeddings.create(
        input=question, model=settings.azure_openai_embeddings_deployment
    )

    return response.data[0].embedding


async def get_close_chunks(
    session: AsyncSession, embedded_vector: list[float]
) -> list[str]:
    '''
    Return 5 chunks closest to the embedded_vector
    '''

    query = text("""
        SELECT content
        FROM attachment_chunks
        ORDER BY embedding <-> :vector
        LIMIT 5
    """)

    result = await session.execute(
        query,
        {"vector": embedded_vector}
    )

    rows = result.fetchall()

    return [row[0] for row in rows]

