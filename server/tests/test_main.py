import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.main import app


@pytest.fixture
def healthy_client(mocker):
    mock_session = mocker.AsyncMock(spec=AsyncSession)
    mock_result = mocker.MagicMock()
    mock_result.fetchone.return_value = (1,)
    mock_session.execute.return_value = mock_result

    async def override():
        yield mock_session

    app.dependency_overrides[get_session] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def unhealthy_client(mocker):
    mock_session = mocker.AsyncMock(spec=AsyncSession)
    mock_session.execute.side_effect = Exception("DB connection failed")

    async def override():
        yield mock_session

    app.dependency_overrides[get_session] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_should_return_healthy_when_database_is_reachable(healthy_client):
    response = healthy_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_should_return_503_when_database_is_unreachable(unhealthy_client):
    response = unhealthy_client.get("/health")
    assert response.status_code == 503
    assert response.json()["status"] == "unhealthy"


def test_should_return_401_when_no_auth_header_provided(healthy_client):
    response = healthy_client.get("/api/brands")
    assert response.status_code == 401
    assert response.json() == {"detail": "Unauthorized"}


def test_should_return_401_when_wrong_token_provided(healthy_client):
    response = healthy_client.get(
        "/api/brands", headers={"Authorization": "Bearer wrong-token"}
    )
    assert response.status_code == 401


def test_should_allow_docs_endpoint_without_auth(healthy_client):
    response = healthy_client.get("/docs")
    assert response.status_code == 200


def test_should_allow_redoc_endpoint_without_auth(healthy_client):
    response = healthy_client.get("/redoc")
    assert response.status_code == 200


def test_should_allow_openapi_json_without_auth(healthy_client):
    response = healthy_client.get("/openapi.json")
    assert response.status_code == 200


def test_should_allow_health_endpoint_without_auth(healthy_client):
    response = healthy_client.get("/health")
    assert response.status_code == 200
