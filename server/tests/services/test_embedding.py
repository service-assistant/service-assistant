from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import Settings
from app.services.embedding import embed_question


@pytest.mark.asyncio
async def test_embed_question_returns_first_embedding():
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

    client = MagicMock()
    client.embeddings.create = AsyncMock(
        return_value=MagicMock(data=[MagicMock(embedding=[0.0, 1.0, 0.45])])
    )

    with patch("app.services.embedding.AsyncAzureOpenAI", return_value=client):
        assert await embed_question("hello", settings) == [0.0, 1.0, 0.45]
