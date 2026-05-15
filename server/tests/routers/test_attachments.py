from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.database import get_session
from app.main import app
from app.models import Attachment

AUTH_HEADERS = {"Authorization": "Bearer CHANGEMELATER"}


def make_attachment(path: str, **kwargs) -> Attachment:
    defaults = dict(
        id=1,
        file_global_path=path,
        original_filename="manual.pdf",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    defaults.update(kwargs)
    return Attachment(**defaults)


@pytest.fixture
def mock_session():
    return AsyncMock()


@pytest.fixture
def client_with_tmp(mock_session, tmp_path):
    test_settings = Settings(
        env="test",
        database_url="postgresql+asyncpg://postgres:postgres@localhost:5432/service_assistant",
        azure_openai_endpoint="https://test.example.com",
        azure_openai_api_key="test-key",
        azure_openai_embeddings_deployment="test-deployment",
        azure_openai_api_version="2024-01-01",
        openai_api_key="test-openai-key",
        openai_chat_model="gpt-4o-mini",
        attachments_dir=tmp_path,
        auth_token="CHANGEMELATER",
    )

    async def override_get_session():
        yield mock_session

    def override_get_settings():
        return test_settings

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_settings] = override_get_settings
    with TestClient(app) as c:
        yield c, tmp_path
    app.dependency_overrides.clear()


def test_should_upload_attachment_and_return_metadata(client_with_tmp, mock_session):
    client, tmp_path = client_with_tmp

    async def set_id(obj):
        obj.id = 1

    mock_session.refresh.side_effect = set_id

    with patch("app.routers.attachments.ingest_pdf_to_attachment", new=AsyncMock()):
        response = client.post(
            "/api/attachments",
            files={"file": ("manual.pdf", b"%PDF-1.4 test content", "application/pdf")},
            data={"device_ids": ["1", "2"]},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    data = response.json()
    assert data["original_filename"] == "manual.pdf"
    assert data["id"] == 1
    assert (tmp_path / "manual.pdf").exists()


def test_should_handle_filename_collision_on_upload(client_with_tmp, mock_session):
    client, tmp_path = client_with_tmp
    (tmp_path / "manual.pdf").write_bytes(b"existing file")

    async def set_id(obj):
        obj.id = 2

    mock_session.refresh.side_effect = set_id

    with patch("app.routers.attachments.ingest_pdf_to_attachment", new=AsyncMock()):
        response = client.post(
            "/api/attachments",
            files={"file": ("manual.pdf", b"%PDF-1.4 new content", "application/pdf")},
            data={"device_ids": ["1"]},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    # Original file untouched, new file saved with __1 suffix
    assert (tmp_path / "manual.pdf").read_bytes() == b"existing file"
    assert (tmp_path / "manual__1.pdf").exists()


def test_should_return_attachment_metadata_when_id_exists(
    client_with_tmp, mock_session
):
    client, tmp_path = client_with_tmp
    mock_session.get.return_value = make_attachment(str(tmp_path / "manual.pdf"))

    response = client.get("/api/attachments/1", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 1
    assert data["original_filename"] == "manual.pdf"


def test_should_return_404_when_attachment_not_found(client_with_tmp, mock_session):
    client, _ = client_with_tmp
    mock_session.get.return_value = None

    response = client.get("/api/attachments/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Attachment not found"


def test_should_download_attachment_file_when_it_exists(client_with_tmp, mock_session):
    client, tmp_path = client_with_tmp
    pdf_path = tmp_path / "manual.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 test document")
    mock_session.get.return_value = make_attachment(str(pdf_path))

    response = client.get("/api/attachments/1/file", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.content == b"%PDF-1.4 test document"


def test_should_return_404_when_attachment_record_not_found_for_file_download(
    client_with_tmp, mock_session
):
    client, _ = client_with_tmp
    mock_session.get.return_value = None

    response = client.get("/api/attachments/999/file", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Attachment not found"


def test_should_return_404_when_file_missing_from_disk(client_with_tmp, mock_session):
    client, tmp_path = client_with_tmp
    missing_path = str(tmp_path / "missing.pdf")
    mock_session.get.return_value = make_attachment(missing_path)

    response = client.get("/api/attachments/1/file", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "File not found on disk"
