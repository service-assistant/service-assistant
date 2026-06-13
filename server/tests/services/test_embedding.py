from pathlib import Path

import pytest

from app.config import Settings
from app.services.embedding import embed_question


@pytest.mark.asyncio
async def test_embed_question_returns_first_embedding(mocker):
    settings = Settings(
        env="test",
        database_url="postgresql://localhost/test",
        azure_openai_endpoint="https://example",
        azure_openai_api_key="key",
        azure_openai_embeddings_deployment="dep",
        azure_openai_api_version="2024-01-01",
        openai_chat_model="gpt",
        openai_api_key="key",
        attachments_dir=Path("../attachments"),
        auth_token="token",
    )

    client = mocker.MagicMock()
    client.embeddings.create = mocker.AsyncMock(
        return_value=mocker.MagicMock(
            data=[mocker.MagicMock(embedding=[0.0, 1.0, 0.45])]
        )
    )

    mocker.patch("app.services.embedding.AsyncAzureOpenAI", return_value=client)
    assert await embed_question("hello", settings) == [0.0, 1.0, 0.45]
