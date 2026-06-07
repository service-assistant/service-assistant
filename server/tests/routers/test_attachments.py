from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.database import get_session
from app.main import app
from app.models import AttachmentDevice

from tests.routers.conftest import AUTH_HEADERS
from tests.routers.factories import make_attachment, make_device


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


def test_should_list_all_attachments(client, mock_session):
    attachments = [
        make_attachment(id=1, original_filename="a.pdf"),
        make_attachment(id=2, original_filename="b.pdf"),
    ]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = attachments
    mock_session.execute.return_value = mock_result

    response = client.get("/api/attachments", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["original_filename"] == "a.pdf"
    assert data[1]["original_filename"] == "b.pdf"


def test_should_return_empty_list_when_no_attachments(client, mock_session):
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_session.execute.return_value = mock_result

    response = client.get("/api/attachments", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


def test_should_upload_attachment_and_return_metadata(client_with_tmp, mock_session):
    client, tmp_path = client_with_tmp

    async def set_id(obj):
        obj.id = 1
        obj.created_at = datetime.now(timezone.utc)
        obj.updated_at = datetime.now(timezone.utc)

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
        obj.created_at = datetime.now(timezone.utc)
        obj.updated_at = datetime.now(timezone.utc)

    mock_session.refresh.side_effect = set_id

    with patch("app.routers.attachments.ingest_pdf_to_attachment", new=AsyncMock()):
        response = client.post(
            "/api/attachments",
            files={"file": ("manual.pdf", b"%PDF-1.4 new content", "application/pdf")},
            data={"device_ids": ["1"]},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    assert (tmp_path / "manual.pdf").read_bytes() == b"existing file"
    assert (tmp_path / "manual__1.pdf").exists()


def test_should_return_404_when_uploading_with_nonexistent_device(
    client_with_tmp, mock_session
):
    client, _ = client_with_tmp
    mock_session.get.return_value = None

    with patch("app.routers.attachments.ingest_pdf_to_attachment", new=AsyncMock()):
        response = client.post(
            "/api/attachments",
            files={"file": ("manual.pdf", b"%PDF-1.4 content", "application/pdf")},
            data={"device_ids": ["999"]},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 404
    assert "Device 999 not found" in response.json()["detail"]


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


def test_should_delete_attachment_and_remove_file_from_disk(
    client_with_tmp, mock_session
):
    client, tmp_path = client_with_tmp
    pdf_path = tmp_path / "manual.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 content")
    mock_session.get.return_value = make_attachment(str(pdf_path))

    response = client.delete("/api/attachments/1", headers=AUTH_HEADERS)

    assert response.status_code == 204
    assert not pdf_path.exists()
    mock_session.delete.assert_called_once()
    mock_session.commit.assert_called_once()


def test_should_delete_attachment_even_when_file_missing_from_disk(
    client_with_tmp, mock_session
):
    client, tmp_path = client_with_tmp
    missing_path = str(tmp_path / "gone.pdf")
    mock_session.get.return_value = make_attachment(missing_path)

    response = client.delete("/api/attachments/1", headers=AUTH_HEADERS)

    assert response.status_code == 204
    mock_session.delete.assert_called_once()


def test_should_return_404_when_deleting_nonexistent_attachment(client, mock_session):
    mock_session.get.return_value = None

    response = client.delete("/api/attachments/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Attachment not found"


def test_should_reingest_attachment(client_with_tmp, mock_session):
    client, tmp_path = client_with_tmp
    pdf_path = tmp_path / "manual.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 content")
    attachment = make_attachment(str(pdf_path))
    mock_session.get.return_value = attachment

    async def noop_refresh(obj):
        pass

    mock_session.refresh.side_effect = noop_refresh

    with (
        patch("app.routers.attachments.delete_attachment_chunks", new=AsyncMock()),
        patch("app.routers.attachments.ingest_pdf_to_attachment", new=AsyncMock()),
    ):
        response = client.post("/api/attachments/1/reingest", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json()["id"] == 1


def test_should_return_404_when_reingesting_nonexistent_attachment(
    client_with_tmp, mock_session
):
    client, _ = client_with_tmp
    mock_session.get.return_value = None

    response = client.post("/api/attachments/999/reingest", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Attachment not found"


def test_should_list_devices_for_attachment(client, mock_session):
    devices = [make_device(id=1), make_device(id=2, name="Linde H30D")]
    attachment = make_attachment()
    attachment.devices = devices
    mock_session.get.return_value = attachment

    response = client.get("/api/attachments/1/devices", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


def test_should_return_empty_list_when_attachment_has_no_devices(client, mock_session):
    attachment = make_attachment()
    attachment.devices = []
    mock_session.get.return_value = attachment

    response = client.get("/api/attachments/1/devices", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


def test_should_return_404_when_listing_devices_for_nonexistent_attachment(
    client, mock_session
):
    mock_session.get.return_value = None

    response = client.get("/api/attachments/999/devices", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Attachment not found"


def test_should_link_device_to_attachment(client, mock_session):
    mock_session.get.side_effect = [make_attachment(), make_device()]
    mock_existing = MagicMock()
    mock_existing.scalars.return_value.first.return_value = None
    mock_session.execute.return_value = mock_existing

    response = client.post("/api/attachments/1/devices/1", headers=AUTH_HEADERS)

    assert response.status_code == 204
    mock_session.add.assert_called_once()
    mock_session.commit.assert_called_once()


def test_should_be_idempotent_when_linking_already_linked_device(client, mock_session):
    mock_session.get.side_effect = [make_attachment(), make_device()]
    existing_link = AttachmentDevice(attachment_id=1, device_id=1)
    mock_existing = MagicMock()
    mock_existing.scalars.return_value.first.return_value = existing_link
    mock_session.execute.return_value = mock_existing

    response = client.post("/api/attachments/1/devices/1", headers=AUTH_HEADERS)

    assert response.status_code == 204
    mock_session.add.assert_not_called()


def test_should_return_404_when_linking_device_to_nonexistent_attachment(
    client, mock_session
):
    mock_session.get.side_effect = [None, make_device()]

    response = client.post("/api/attachments/999/devices/1", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Attachment not found"


def test_should_return_404_when_linking_nonexistent_device(client, mock_session):
    mock_session.get.side_effect = [make_attachment(), None]

    response = client.post("/api/attachments/1/devices/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


def test_should_unlink_device_from_attachment(client, mock_session):
    link = AttachmentDevice(attachment_id=1, device_id=1)
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = link
    mock_session.execute.return_value = mock_result

    response = client.delete("/api/attachments/1/devices/1", headers=AUTH_HEADERS)

    assert response.status_code == 204
    mock_session.delete.assert_called_once_with(link)
    mock_session.commit.assert_called_once()


def test_should_return_404_when_unlinking_device_not_linked(client, mock_session):
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    mock_session.execute.return_value = mock_result

    response = client.delete("/api/attachments/1/devices/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Link not found"
