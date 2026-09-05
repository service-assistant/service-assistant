import pytest
from app.config import get_settings

from app.database import get_session
from app.main import app
from app.models import AppRole, OrgRole
from app.repositories import SessionRepository
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from tests.routers.factories import DEFAULT_ORGANIZATION_ID, create_user


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
        "app.services.chat.retrieval.translation.AsyncOpenAI",
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
        "app.services.chat.diagnostic.router.AsyncOpenAI",
        return_value=routing_client,
    )


async def _authenticated_client(
    session,
    cookie_name: str = "session_token",
    headers: dict[str, str] | None = None,
    **user_kwargs,
):
    user = await create_user(session, **user_kwargs)
    _, raw_token = await SessionRepository(session).create_session(
        user, idle_timeout_minutes=get_settings().session_idle_timeout_minutes
    )
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
        cookies={cookie_name: raw_token},
        headers=headers or {},
    )


@pytest.fixture
async def client(session):
    # Scoped to the seeded "default" org (id=2), matching every other
    # factory's default organization_id, so requests through this client see
    # the same rows `create_category`/`create_device`/etc. create by default.
    async with await _authenticated_client(
        session,
        organization_id=DEFAULT_ORGANIZATION_ID,
        app_role=AppRole.user,
        org_role=OrgRole.admin,
    ) as c:
        yield c


@pytest.fixture
async def member_client(session):
    # Same org as `client`, but org_role=member — a technician using the
    # mobile app rather than an org admin.
    async with await _authenticated_client(
        session,
        organization_id=DEFAULT_ORGANIZATION_ID,
        app_role=AppRole.user,
        org_role=OrgRole.member,
    ) as c:
        yield c


@pytest.fixture
async def app_admin_client(session):
    # app_admin's organization_id is arbitrary (the system org in real usage)
    # — the app_role check, not org membership, is what gates app_admin-only
    # routers like jobs/benchmark, so DEFAULT_ORGANIZATION_ID is fine here.
    # org_role=admin too, matching the real bootstrap script, since some
    # routers (e.g. the transcribe websocket) gate on org_role instead.
    async with await _authenticated_client(
        session,
        cookie_name="admin_session_token",
        headers={"X-Auth-Scope": "admin"},
        organization_id=DEFAULT_ORGANIZATION_ID,
        app_role=AppRole.admin,
        org_role=OrgRole.admin,
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
    mocker.patch(
        "app.services.chat.retrieval.embedding.AsyncAzureOpenAI",
        return_value=mock_client,
    )
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
    mocker.patch("app.services.chat.generation.AsyncOpenAI", return_value=mock_client)
    return mock_client


@pytest.fixture(autouse=True)
def procrastinate_connector():
    """The in-memory Procrastinate connector, reset between tests.

    Uploads defer a job rather than ingesting inline, so tests assert on the
    jobs recorded here (`connector.jobs`) instead of on pipeline side effects.
    `app/procrastinate_app.py` selects this connector whenever `ENV=test`.
    """
    from app.procrastinate_app import app as procrastinate_app
    from procrastinate.testing import InMemoryConnector

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
