from tests.routers.conftest import AUTH_HEADERS
from tests.routers.factories import (
    create_attachment,
    create_brand,
    create_device,
    create_device_type,
    create_thread,
    link_attachment_device,
)


async def test_should_create_device_when_brand_and_device_type_exist(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)

    response = await client.post(
        "/api/devices",
        json={
            "brand_id": brand.id,
            "device_type_id": dt.id,
            "name": "Toyota 8FBE20",
            "model_serial_code": "8FBE20-12345",
            "image_url": "https://example.com/images/toyota-8fbe20.jpg",
        },
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Toyota 8FBE20"
    assert data["brand_id"] == brand.id
    assert data["device_type_id"] == dt.id
    assert data["model_serial_code"] == "8FBE20-12345"
    assert data["image_url"] == "https://example.com/images/toyota-8fbe20.jpg"


async def test_should_return_404_when_brand_not_found_on_create(client, session):
    dt = await create_device_type(session)

    response = await client.post(
        "/api/devices",
        json={"brand_id": 999, "device_type_id": dt.id, "name": "Toyota 8FBE20"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Brand not found"


async def test_should_return_404_when_device_type_not_found_on_create(client, session):
    brand = await create_brand(session)

    response = await client.post(
        "/api/devices",
        json={"brand_id": brand.id, "device_type_id": 999, "name": "Toyota 8FBE20"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Device type not found"


async def test_should_return_422_when_creating_device_without_required_fields(client):
    response = await client.post("/api/devices", json={}, headers=AUTH_HEADERS)

    assert response.status_code == 422


async def test_should_list_all_devices(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    await create_device(session, brand.id, dt.id, name="Toyota 8FBE20")
    await create_device(session, brand.id, dt.id, name="Linde H30D")

    response = await client.get("/api/devices", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    names = {d["name"] for d in data}
    assert names == {"Toyota 8FBE20", "Linde H30D"}


async def test_should_return_empty_list_when_no_devices_exist(client):
    response = await client.get("/api/devices", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


async def test_should_return_device_when_id_exists(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id, name="Toyota 8FBE20")

    response = await client.get(f"/api/devices/{device.id}", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == device.id
    assert data["name"] == "Toyota 8FBE20"


async def test_should_return_404_when_device_id_not_found(client):
    response = await client.get("/api/devices/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


async def test_should_update_device_name_when_patch_provided(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id, name="Toyota 8FBE20")

    response = await client.patch(
        f"/api/devices/{device.id}",
        json={"name": "Toyota 8FBE30"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Toyota 8FBE30"


async def test_should_return_404_when_updating_nonexistent_device(client):
    response = await client.patch(
        "/api/devices/999", json={"name": "X"}, headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


async def test_should_return_404_when_updating_device_with_nonexistent_brand(
    client, session
):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)

    response = await client.patch(
        f"/api/devices/{device.id}", json={"brand_id": 999}, headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Brand not found"


async def test_should_return_404_when_updating_device_with_nonexistent_device_type(
    client, session
):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)

    response = await client.patch(
        f"/api/devices/{device.id}", json={"device_type_id": 999}, headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Device type not found"


async def test_should_delete_device_when_id_exists(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)

    response = await client.delete(f"/api/devices/{device.id}", headers=AUTH_HEADERS)

    assert response.status_code == 204


async def test_should_return_404_when_deleting_nonexistent_device(client):
    response = await client.delete("/api/devices/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


async def test_should_return_409_when_deleting_device_referenced_by_threads(
    client, session
):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    await create_thread(session, device.id)

    response = await client.delete(f"/api/devices/{device.id}", headers=AUTH_HEADERS)

    assert response.status_code == 409
    assert "Cannot delete device" in response.json()["detail"]


async def test_should_list_attachments_for_device(client, tmp_path, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    attachment_a = await create_attachment(
        session,
        original_filename="manual_a.pdf",
        file_global_path=str(tmp_path / "manual_a.pdf"),
    )
    attachment_b = await create_attachment(
        session,
        original_filename="manual_b.pdf",
        file_global_path=str(tmp_path / "manual_b.pdf"),
    )
    await link_attachment_device(session, attachment_a.id, device.id)
    await link_attachment_device(session, attachment_b.id, device.id)

    response = await client.get(
        f"/api/devices/{device.id}/attachments", headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    filenames = {a["original_filename"] for a in data}
    assert filenames == {"manual_a.pdf", "manual_b.pdf"}


async def test_should_return_empty_list_when_device_has_no_attachments(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)

    response = await client.get(
        f"/api/devices/{device.id}/attachments", headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    assert response.json() == []


async def test_should_return_404_when_listing_attachments_for_nonexistent_device(
    client,
):
    response = await client.get("/api/devices/999/attachments", headers=AUTH_HEADERS)
    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


async def test_should_update_only_device_type_when_partial_patch_provided(
    client, session
):
    brand = await create_brand(session)
    dt_old = await create_device_type(session, name="Counterbalance Forklift")
    dt_new = await create_device_type(session, name="Reach Truck")
    device = await create_device(session, brand.id, dt_old.id, name="Toyota 8FBE20")

    response = await client.patch(
        f"/api/devices/{device.id}",
        json={"device_type_id": dt_new.id},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["device_type_id"] == dt_new.id
    assert data["name"] == "Toyota 8FBE20"
