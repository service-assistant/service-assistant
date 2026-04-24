from openai import AzureOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

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
    # TODO: use session for postgres database access
    return ["Close chunk 1", "Close chunk 2", "Close chunk 3"]
