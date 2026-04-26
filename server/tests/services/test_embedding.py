from unittest.mock import MagicMock, patch

from app.config import Settings
from app.services.embedding import embed_question


def test_embed_question_returns_first_embedding():
    settings = Settings(
        env="test",
        database_url="postgresql://localhost/test",
        azure_openai_endpoint="https://example",
        azure_openai_api_key="key",
        azure_openai_embeddings_deployment="dep",
        azure_openai_api_version="2024-01-01",
    )

    client = MagicMock()
    client.embeddings.create.return_value = MagicMock(
        data=[MagicMock(embedding=[0.0, 1.0, 0.45])]
    )

    with patch("app.services.embedding.AzureOpenAI", return_value=client):
        assert embed_question("hello", settings) == [0.0, 1.0, 0.45]
