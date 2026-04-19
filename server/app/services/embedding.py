from openai import AzureOpenAI
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


def get_close_chunks(embedded_vector: list[float]) -> list[str]:
    return ["a", "b", "c"]
