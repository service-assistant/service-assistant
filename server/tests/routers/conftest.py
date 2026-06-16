import os

import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from app.database import get_session
from app.main import app


@pytest.fixture(autouse=True)
def override_attachments_dir(tmp_path):
    from app.config import get_settings

    test_settings = get_settings().model_copy(update={"attachments_dir": tmp_path})
    app.dependency_overrides[get_settings] = lambda: test_settings
    yield
    app.dependency_overrides.pop(get_settings, None)


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
        headers={"Authorization": f"Bearer {os.getenv('AUTH_TOKEN')}"},
    ) as c:
        yield c


@pytest.fixture
async def unauthenticated_client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as c:
        yield c


@pytest.fixture
def mock_azure_embeddings(mocker):
    """Patches AsyncAzureOpenAI in embedding.py to return a 1536-dim zero vector."""
    mock_client = mocker.MagicMock()
    mock_response = mocker.MagicMock()
    mock_response.data = [mocker.MagicMock(embedding=[0.0] * 1536)]
    mock_client.embeddings.create = mocker.AsyncMock(return_value=mock_response)
    mocker.patch("app.services.embedding.AsyncAzureOpenAI", return_value=mock_client)
    return mock_client


@pytest.fixture
def mock_openai_llm(mocker):
    """Patches AsyncOpenAI in llm.py to stream a single 'Test response' chunk."""

    async def _stream():
        event = mocker.MagicMock()
        event.choices[0].delta.content = "Test response"
        yield event

    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(return_value=_stream())
    mocker.patch("app.services.llm.AsyncOpenAI", return_value=mock_client)
    return mock_client


@pytest.fixture
def mock_ingest_fitz(mocker):
    """Patches fitz.open in ingest.py to return an empty document (no pages processed)."""
    mock_doc = mocker.MagicMock()
    mock_doc.pages.return_value = iter([])
    mocker.patch("app.services.ingest.fitz.open", return_value=mock_doc)


@pytest.fixture
def ws_client(mocker):
    """TestClient-based fixture for WebSocket tests only."""
    mock_session = mocker.AsyncMock()
    mock_session.add = mocker.MagicMock()

    async def override_get_session():
        yield mock_session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as c:
        yield c, mock_session
    app.dependency_overrides.clear()
