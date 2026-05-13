from unittest.mock import MagicMock, AsyncMock, Mock, patch
from sqlalchemy.ext.asyncio import AsyncSession
import pytest
from pathlib import Path

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
    )

    client = MagicMock()
    client.embeddings.create = AsyncMock(
        return_value=MagicMock(data=[MagicMock(embedding=[0.0, 1.0, 0.45])])
    )

    with patch("app.services.embedding.AsyncAzureOpenAI", return_value=client):
        assert await embed_question("hello", settings) == [0.0, 1.0, 0.45]


@pytest.mark.asyncio
async def test_get_close_chunks():
    session = AsyncMock(spec=AsyncSession)

    fake_rows = [
        (1, "chunk 1", "/attachments/sample.pdf", 0),
        (2, "chunk 2", "/attachments/sample.pdf", 1),
        (3, "chunk 3", "/attachments/sample.pdf", 2),
    ]

    mock_result = Mock()
    mock_result.fetchall.return_value = fake_rows
    session.execute.return_value = mock_result

    vector = [0.1, 0.2, 0.3]
    result = await get_close_chunks(session, vector)

    assert result == [
        {
            "id": 1,
            "content": "chunk 1",
            "document_name": "/attachments/sample.pdf",
            "page": 0,
        },
        {
            "id": 2,
            "content": "chunk 2",
            "document_name": "/attachments/sample.pdf",
            "page": 1,
        },
        {
            "id": 3,
            "content": "chunk 3",
            "document_name": "/attachments/sample.pdf",
            "page": 2,
        },
    ]

    session.execute.assert_called_once()
