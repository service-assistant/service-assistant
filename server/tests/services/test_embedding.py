from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, Mock, patch

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
async def test_get_close_chunks_without_device_id():
    session = AsyncMock(spec=AsyncSession)

    fake_rows = [
        (1, "chunk 1", 10, None),
        (2, "chunk 2", 10, {"page": 1}),
        (3, "chunk 3", 11, None),
    ]

    mock_result = Mock()
    mock_result.fetchall.return_value = fake_rows
    session.execute.return_value = mock_result

    vector = [0.1, 0.2, 0.3]
    result = await get_close_chunks(session, vector)

    assert result == [
        {"id": 1, "content": "chunk 1", "attachment_id": 10, "extra_metadata": None},
        {
            "id": 2,
            "content": "chunk 2",
            "attachment_id": 10,
            "extra_metadata": {"page": 1},
        },
        {"id": 3, "content": "chunk 3", "attachment_id": 11, "extra_metadata": None},
    ]
    session.execute.assert_called_once()


@pytest.mark.asyncio
async def test_get_close_chunks_with_device_id():
    session = AsyncMock(spec=AsyncSession)

    fake_rows = [(1, "chunk 1", 10, None)]

    mock_result = Mock()
    mock_result.fetchall.return_value = fake_rows
    session.execute.return_value = mock_result

    result = await get_close_chunks(session, [0.1, 0.2], device_id=5)

    assert result == [
        {"id": 1, "content": "chunk 1", "attachment_id": 10, "extra_metadata": None}
    ]
    session.execute.assert_called_once()
