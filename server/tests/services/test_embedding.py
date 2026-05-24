from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.services.embedding import embed_question, get_close_chunks


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


@pytest.mark.asyncio
async def test_get_close_chunks_with_device_id():
    session = AsyncMock(spec=AsyncSession)

    chunk1 = MagicMock()
    chunk1.id = 1
    chunk1.content = "chunk 1"
    chunk1.attachment_id = 10
    chunk1.extra_metadata = None

    chunk2 = MagicMock()
    chunk2.id = 2
    chunk2.content = "chunk 2"
    chunk2.attachment_id = 10
    chunk2.extra_metadata = {"page": 1}

    mock_result = MagicMock()
    mock_result.all.return_value = [chunk1, chunk2]
    session.scalars.return_value = mock_result

    result = await get_close_chunks(session, [0.1, 0.2], device_id=5)

    assert result == [
        {"id": 1, "content": "chunk 1", "attachment_id": 10, "extra_metadata": None},
        {
            "id": 2,
            "content": "chunk 2",
            "attachment_id": 10,
            "extra_metadata": {"page": 1},
        },
    ]
    session.scalars.assert_called_once()
