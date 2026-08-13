import json
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


@pytest.fixture(autouse=True)
def block_unmocked_router_openai_calls(mocker):
    """Keep router tests deterministic and prevent accidental external API calls."""
    translation_client = mocker.MagicMock()
    translation_client.responses.create = mocker.AsyncMock(
        return_value=mocker.MagicMock(output_text="translated query")
    )
    mocker.patch(
        "app.services.translation.AsyncOpenAI",
        return_value=translation_client,
    )

    routing_client = mocker.MagicMock()

    async def standard_routing_response(**kwargs):
        schema = kwargs["response_format"]["json_schema"]["schema"]
        diagnostic_mode = "recognized_problem" in schema["properties"]
        payload = {
            "route": "standard_query",
            "confidence": 1,
            "clarification_question": None,
            "missing_information": [],
        }
        if diagnostic_mode:
            payload.update(
                {
                    "recognized_problem": None,
                    "diagnostic_message_id": None,
                }
            )
        routing_response = mocker.MagicMock()
        routing_response.choices[0].message.content = json.dumps(payload)
        return routing_response

    routing_client.chat.completions.create = mocker.AsyncMock(
        side_effect=standard_routing_response
    )
    mocker.patch(
        "app.services.message_router.AsyncOpenAI",
        return_value=routing_client,
    )

    from app.services.context_support import ContextSupport, ContextSupportDecision

    async def direct_context_support(question, chunks, settings):
        return ContextSupportDecision(
            support=ContextSupport.direct_support,
            direct_chunk_ids=[chunk["id"] for chunk in chunks],
        )

    mocker.patch(
        "app.services.context_support.evaluate_context_support",
        side_effect=direct_context_support,
    )


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
    """Patch every OpenAI client used by the message endpoint."""

    async def _stream():
        event = mocker.MagicMock()
        event.choices[0].delta.content = "Test response"
        yield event

    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(return_value=_stream())
    continuation_response = mocker.MagicMock(output_text="0")
    mock_client.responses.create = mocker.AsyncMock(return_value=continuation_response)
    mocker.patch("app.services.llm.AsyncOpenAI", return_value=mock_client)
    return mock_client


@pytest.fixture
def mock_ingest_fitz(mocker):
    """Skip the ingestion pipeline in attachment endpoint tests."""
    from app.services.ingest import IngestReport

    return mocker.patch(
        "app.routers.attachments.ingest_pdf_to_attachment",
        new_callable=mocker.AsyncMock,
        return_value=IngestReport(),
    )


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
