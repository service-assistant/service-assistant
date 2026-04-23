from openai import AzureOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
import os


def embed_question(question: str) -> list[float]:
    """
    Return embeddings for question
    """
    endpoint = os.environ["AZURE_OPENAI_ENDPOINT"]
    api_key = os.environ["AZURE_OPENAI_API_KEY"]
    model_name = os.environ["AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT"]
    api_version = os.environ["AZURE_OPENAI_API_VERSION"]

    client = AzureOpenAI(
        api_version=api_version, azure_endpoint=endpoint, api_key=api_key
    )

    response = client.embeddings.create(input=question, model=model_name)

    return response.data[0].embedding


async def get_close_chunks(
    session: AsyncSession, embedded_vector: list[float]
) -> list[str]:
    # TODO: use session for postgres database access
    return ["Close chunk 1", "Close chunk 2", "Close chunk 3"]
