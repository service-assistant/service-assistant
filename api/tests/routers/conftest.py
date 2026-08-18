import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.database import get_session
from app.main import app


@pytest.fixture(autouse=True)
def override_attachments_dir(tmp_path):
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
    routing_response = mocker.MagicMock()
    routing_response.choices[0].message.content = (
        '{"route":"standard_query","confidence":1,'
        '"recognized_problem":null,"diagnostic_message_id":null}'
    )
    routing_client.chat.completions.create = mocker.AsyncMock(
        return_value=routing_response
    )
    mocker.patch(
        "app.services.message_router.AsyncOpenAI",
        return_value=routing_client,
    )


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
        headers={"Authorization": f"Bearer {get_settings().auth_token}"},
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


@pytest.fixture(autouse=True)
def procrastinate_connector():
    """The in-memory Procrastinate connector, reset between tests.

    Uploads defer a job rather than ingesting inline, so tests assert on the
    jobs recorded here (`connector.jobs`) instead of on pipeline side effects.
    `app/procrastinate_app.py` selects this connector whenever `ENV=test`.
    """
    from procrastinate.testing import InMemoryConnector

    from app.procrastinate_app import app as procrastinate_app

    connector = procrastinate_app.connector
    assert isinstance(connector, InMemoryConnector), "ENV=test is required"
    connector.reset()
    yield connector
    connector.reset()


@pytest.fixture
def mock_ingest_pipeline(mocker):
    """Skip the real PDF pipeline when running the ingest task directly."""
    from app.services.ingest import IngestReport

    return mocker.patch(
        "app.tasks.ingest.ingest_pdf_to_attachment",
        new_callable=mocker.AsyncMock,
        return_value=IngestReport(
            total_pages=3,
            pages_processed=3,
            chunks_indexed=7,
            native_text_pages=1,
            ocr_pages_attempted=2,
            ocr_pages_succeeded=1,
            ocr_pages_skipped=1,
        ),
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
