from app.models import Device

from tests.routers.factories import (
    create_attachment,
    create_category,
    create_device,
    create_thread,
    link_attachment_device,
)


async def test_should_create_device_when_category_exists(client, session):
    category = await create_category(session)

    response = await client.post(
        "/api/devices",
        json={
            "category_id": category.id,
            "name": "Toyota 8FBE20",
            "model_serial_code": "8FBE20-12345",
            "image_url": "https://example.com/images/toyota-8fbe20.jpg",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Toyota 8FBE20"
    assert data["category_id"] == category.id
    assert data["model_serial_code"] == "8FBE20-12345"
    assert data["image_url"] == "https://example.com/images/toyota-8fbe20.jpg"


async def test_should_create_device_without_category(client):
    response = await client.post(
        "/api/devices",
        json={"name": "Toyota 8FBE20"},
    )

    assert response.status_code == 201
    assert response.json()["category_id"] is None


async def test_should_return_404_when_category_not_found_on_create(client):
    response = await client.post(
        "/api/devices",
        json={"category_id": 999, "name": "Toyota 8FBE20"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Category not found"


async def test_should_return_422_when_creating_device_without_required_fields(client):
    response = await client.post("/api/devices", json={})
    assert response.status_code == 422


async def test_should_list_all_devices(client, session):
    category = await create_category(session)
    await create_device(session, category.id, name="Toyota 8FBE20")
    await create_device(session, category.id, name="Linde H30D")

    response = await client.get("/api/devices")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    names = {d["name"] for d in data}
    assert names == {"Toyota 8FBE20", "Linde H30D"}


async def test_should_return_empty_list_when_no_devices_exist(client):
    response = await client.get("/api/devices")
    assert response.status_code == 200
    assert response.json() == []


async def test_should_return_device_when_id_exists(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id, name="Toyota 8FBE20")

    response = await client.get(f"/api/devices/{device.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == device.id
    assert data["name"] == "Toyota 8FBE20"


async def test_should_return_404_when_device_id_not_found(client):
    response = await client.get("/api/devices/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


async def test_should_update_device_name_when_patch_provided(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id, name="Toyota 8FBE20")

    response = await client.patch(
        f"/api/devices/{device.id}",
        json={"name": "Toyota 8FBE30"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Toyota 8FBE30"
    await session.refresh(device)
    assert device.name == "Toyota 8FBE30"


async def test_should_return_404_when_updating_nonexistent_device(client):
    response = await client.patch("/api/devices/999", json={"name": "X"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


async def test_should_return_404_when_updating_device_with_nonexistent_category(
    client, session
):
    category = await create_category(session)
    device = await create_device(session, category.id)

    response = await client.patch(
        f"/api/devices/{device.id}", json={"category_id": 999}
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Category not found"


async def test_should_clear_category_when_patch_sets_it_to_null(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)

    response = await client.patch(
        f"/api/devices/{device.id}", json={"category_id": None}
    )

    assert response.status_code == 200
    assert response.json()["category_id"] is None
    await session.refresh(device)
    assert device.category_id is None


async def test_should_delete_device_when_id_exists(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)
    device_id = device.id

    response = await client.delete(f"/api/devices/{device_id}")

    assert response.status_code == 204
    session.expunge(device)
    assert await session.get(Device, device_id) is None


async def test_should_return_404_when_deleting_nonexistent_device(client):
    response = await client.delete("/api/devices/999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


async def test_should_return_409_when_deleting_device_referenced_by_threads(
    client, session
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    await create_thread(session, device.id)

    response = await client.delete(f"/api/devices/{device.id}")

    assert response.status_code == 409
    assert "Cannot delete device" in response.json()["detail"]


async def test_should_list_attachments_for_device(client, tmp_path, session):
    category = await create_category(session)
    device = await create_device(session, category.id)
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

    response = await client.get(f"/api/devices/{device.id}/attachments")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    filenames = {a["original_filename"] for a in data}
    assert filenames == {"manual_a.pdf", "manual_b.pdf"}


async def test_should_return_empty_list_when_device_has_no_attachments(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)

    response = await client.get(f"/api/devices/{device.id}/attachments")

    assert response.status_code == 200
    assert response.json() == []


async def test_should_return_404_when_listing_attachments_for_nonexistent_device(
    client,
):
    response = await client.get("/api/devices/999/attachments")
    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


async def test_should_update_only_category_when_partial_patch_provided(client, session):
    category_old = await create_category(session, name="Counterbalance Forklift")
    category_new = await create_category(session, name="Reach Truck")
    device = await create_device(session, category_old.id, name="Toyota 8FBE20")

    response = await client.patch(
        f"/api/devices/{device.id}",
        json={"category_id": category_new.id},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["category_id"] == category_new.id
    assert data["name"] == "Toyota 8FBE20"
    await session.refresh(device)
    assert device.category_id == category_new.id
    assert device.name == "Toyota 8FBE20"
