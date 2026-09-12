from typing import NotRequired, TypedDict

from openai import AsyncAzureOpenAI


from app.config import Settings


class RetrievedChunk(TypedDict):
    id: int
    content: str
    attachment_id: int
    extra_metadata: dict | None
    reranker_score: NotRequired[float]


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


async def embed_questions(
    questions: list[str], settings: Settings
) -> list[list[float]]:
    """Embed multiple queries in one request, preserving their input order."""
    if not questions:
        return []

    client = AsyncAzureOpenAI(
        api_version=settings.azure_openai_api_version,
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
    )
    response = await client.embeddings.create(
        input=questions, model=settings.azure_openai_embeddings_deployment
    )
    ordered = sorted(response.data, key=lambda item: item.index)
    if len(ordered) != len(questions) or [item.index for item in ordered] != list(
        range(len(questions))
    ):
        raise RuntimeError("Azure returned an incomplete query embedding batch")
    return [item.embedding for item in ordered]
