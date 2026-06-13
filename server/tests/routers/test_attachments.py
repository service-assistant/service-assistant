from tests.routers.conftest import AUTH_HEADERS
from tests.routers.factories import (
    create_attachment,
    create_brand,
    create_device,
    create_device_type,
    link_attachment_device,
)


async def test_should_list_all_attachments(client, tmp_path, session):
    await create_attachment(
        session, original_filename="a.pdf", file_global_path=str(tmp_path / "a.pdf")
    )
    await create_attachment(
        session, original_filename="b.pdf", file_global_path=str(tmp_path / "b.pdf")
    )

    response = await client.get("/api/attachments", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    filenames = {a["original_filename"] for a in data}
    assert filenames == {"a.pdf", "b.pdf"}


async def test_should_return_empty_list_when_no_attachments(client):
    response = await client.get("/api/attachments", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


async def test_should_upload_attachment_and_return_metadata(
    client, tmp_path, session, mocker
):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device1 = await create_device(session, brand.id, dt.id, name="Device 1")
    device2 = await create_device(session, brand.id, dt.id, name="Device 2")

    mocker.patch(
        "app.routers.attachments.ingest_pdf_to_attachment", new=mocker.AsyncMock()
    )

    response = await client.post(
        "/api/attachments",
        files={"file": ("manual.pdf", b"%PDF-1.4 test content", "application/pdf")},
        data={"device_ids": [str(device1.id), str(device2.id)]},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["original_filename"] == "manual.pdf"
    assert isinstance(data["id"], int)
    assert (tmp_path / "manual.pdf").exists()


async def test_should_handle_filename_collision_on_upload(
    client, tmp_path, session, mocker
):
    (tmp_path / "manual.pdf").write_bytes(b"existing file")
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)

    mocker.patch(
        "app.routers.attachments.ingest_pdf_to_attachment", new=mocker.AsyncMock()
    )

    response = await client.post(
        "/api/attachments",
        files={"file": ("manual.pdf", b"%PDF-1.4 new content", "application/pdf")},
        data={"device_ids": [str(device.id)]},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 201
    assert (tmp_path / "manual.pdf").read_bytes() == b"existing file"
    assert (tmp_path / "manual__1.pdf").exists()


async def test_should_return_404_when_uploading_with_nonexistent_device(client, mocker):
    mocker.patch(
        "app.routers.attachments.ingest_pdf_to_attachment", new=mocker.AsyncMock()
    )

    response = await client.post(
        "/api/attachments",
        files={"file": ("manual.pdf", b"%PDF-1.4 content", "application/pdf")},
        data={"device_ids": ["999"]},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 404
    assert "Device 999 not found" in response.json()["detail"]


async def test_should_return_attachment_metadata_when_id_exists(
    client, tmp_path, session
):
    attachment = await create_attachment(
        session,
        file_global_path=str(tmp_path / "manual.pdf"),
        original_filename="manual.pdf",
    )

    response = await client.get(
        f"/api/attachments/{attachment.id}", headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == attachment.id
    assert data["original_filename"] == "manual.pdf"


async def test_should_return_404_when_attachment_not_found(client):
    response = await client.get("/api/attachments/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Attachment not found"


async def test_should_download_attachment_file_when_it_exists(
    client, tmp_path, session
):
    pdf_path = tmp_path / "manual.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 test document")
    attachment = await create_attachment(
        session,
        file_global_path=str(pdf_path),
        original_filename="manual.pdf",
    )

    response = await client.get(
        f"/api/attachments/{attachment.id}/file", headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    assert response.content == b"%PDF-1.4 test document"


async def test_should_return_404_when_attachment_record_not_found_for_file_download(
    client,
):
    response = await client.get("/api/attachments/999/file", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Attachment not found"


async def test_should_return_404_when_file_missing_from_disk(client, tmp_path, session):
    attachment = await create_attachment(
        session,
        file_global_path=str(tmp_path / "missing.pdf"),
        original_filename="missing.pdf",
    )

    response = await client.get(
        f"/api/attachments/{attachment.id}/file", headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "File not found on disk"


async def test_should_delete_attachment_and_remove_file_from_disk(
    client, tmp_path, session
):
    pdf_path = tmp_path / "manual.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 content")
    attachment = await create_attachment(
        session,
        file_global_path=str(pdf_path),
        original_filename="manual.pdf",
    )

    response = await client.delete(
        f"/api/attachments/{attachment.id}", headers=AUTH_HEADERS
    )

    assert response.status_code == 204
    assert not pdf_path.exists()


async def test_should_delete_attachment_even_when_file_missing_from_disk(
    client, tmp_path, session
):
    attachment = await create_attachment(
        session,
        file_global_path=str(tmp_path / "gone.pdf"),
        original_filename="gone.pdf",
    )

    response = await client.delete(
        f"/api/attachments/{attachment.id}", headers=AUTH_HEADERS
    )

    assert response.status_code == 204


async def test_should_return_404_when_deleting_nonexistent_attachment(client):
    response = await client.delete("/api/attachments/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Attachment not found"


async def test_should_reingest_attachment(client, tmp_path, session, mocker):
    pdf_path = tmp_path / "manual.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 content")
    attachment = await create_attachment(
        session,
        file_global_path=str(pdf_path),
        original_filename="manual.pdf",
    )

    mocker.patch(
        "app.routers.attachments.delete_attachment_chunks", new=mocker.AsyncMock()
    )
    mocker.patch(
        "app.routers.attachments.ingest_pdf_to_attachment", new=mocker.AsyncMock()
    )

    response = await client.post(
        f"/api/attachments/{attachment.id}/reingest", headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["id"] == attachment.id


async def test_should_return_404_when_reingesting_nonexistent_attachment(client):
    response = await client.post("/api/attachments/999/reingest", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Attachment not found"


async def test_should_list_devices_for_attachment(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device1 = await create_device(session, brand.id, dt.id, name="Device 1")
    device2 = await create_device(session, brand.id, dt.id, name="Device 2")
    attachment = await create_attachment(session)
    await link_attachment_device(session, attachment.id, device1.id)
    await link_attachment_device(session, attachment.id, device2.id)

    response = await client.get(
        f"/api/attachments/{attachment.id}/devices", headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


async def test_should_return_empty_list_when_attachment_has_no_devices(client, session):
    attachment = await create_attachment(session)

    response = await client.get(
        f"/api/attachments/{attachment.id}/devices", headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    assert response.json() == []


async def test_should_return_404_when_listing_devices_for_nonexistent_attachment(
    client,
):
    response = await client.get("/api/attachments/999/devices", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Attachment not found"


async def test_should_link_device_to_attachment(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    attachment = await create_attachment(session)

    response = await client.post(
        f"/api/attachments/{attachment.id}/devices/{device.id}", headers=AUTH_HEADERS
    )

    assert response.status_code == 204


async def test_should_be_idempotent_when_linking_already_linked_device(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    attachment = await create_attachment(session)
    await link_attachment_device(session, attachment.id, device.id)

    response = await client.post(
        f"/api/attachments/{attachment.id}/devices/{device.id}", headers=AUTH_HEADERS
    )

    assert response.status_code == 204


async def test_should_return_404_when_linking_device_to_nonexistent_attachment(
    client, session
):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)

    response = await client.post(
        f"/api/attachments/999/devices/{device.id}", headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Attachment not found"


async def test_should_return_404_when_linking_nonexistent_device(client, session):
    attachment = await create_attachment(session)

    response = await client.post(
        f"/api/attachments/{attachment.id}/devices/999", headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


async def test_should_unlink_device_from_attachment(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    attachment = await create_attachment(session)
    await link_attachment_device(session, attachment.id, device.id)

    response = await client.delete(
        f"/api/attachments/{attachment.id}/devices/{device.id}", headers=AUTH_HEADERS
    )

    assert response.status_code == 204


async def test_should_return_404_when_unlinking_device_not_linked(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    attachment = await create_attachment(session)

    response = await client.delete(
        f"/api/attachments/{attachment.id}/devices/{device.id}", headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Link not found"
