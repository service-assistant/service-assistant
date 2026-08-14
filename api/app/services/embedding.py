from typing import TypedDict

from openai import AsyncAzureOpenAI


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
