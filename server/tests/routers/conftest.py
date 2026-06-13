import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from app.database import get_session
from app.main import app

AUTH_HEADERS = {"Authorization": "Bearer CHANGEMELATER"}


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


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
