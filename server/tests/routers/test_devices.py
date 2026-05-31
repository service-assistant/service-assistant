from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.models import Brand, Device, DeviceType

AUTH_HEADERS = {"Authorization": "Bearer CHANGEMELATER"}


def make_brand(**kwargs) -> Brand:
    defaults = dict(
        id=1,
        name="Toyota",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Brand(**defaults)


def make_device_type(**kwargs) -> DeviceType:
    defaults = dict(
        id=1,
        name="Counterbalance Forklift",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return DeviceType(**defaults)


def make_device(**kwargs) -> Device:
    defaults = dict(
        id=1,
        brand_id=1,
        device_type_id=1,
        name="Toyota 8FBE20",
        model_serial_code=None,
        image_url=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Device(**defaults)


def test_should_create_device_when_brand_and_device_type_exist(client, mock_session):
    mock_session.get.side_effect = [make_brand(), make_device_type()]

    async def set_id(obj):
        obj.id = 1

    mock_session.refresh.side_effect = set_id

    response = client.post(
        "/api/devices",
        json={"brand_id": 1, "device_type_id": 1, "name": "Toyota 8FBE20"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Toyota 8FBE20"
    assert data["brand_id"] == 1
    assert data["device_type_id"] == 1


def test_should_return_404_when_brand_not_found_on_create(client, mock_session):
    mock_session.get.side_effect = [None, make_device_type()]

    response = client.post(
        "/api/devices",
        json={"brand_id": 999, "device_type_id": 1, "name": "Toyota 8FBE20"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Brand not found"


def test_should_return_404_when_device_type_not_found_on_create(client, mock_session):
    mock_session.get.side_effect = [make_brand(), None]

    response = client.post(
        "/api/devices",
        json={"brand_id": 1, "device_type_id": 999, "name": "Toyota 8FBE20"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Device type not found"


def test_should_list_all_devices(client, mock_session):
    devices = [
        make_device(id=1, name="Toyota 8FBE20"),
        make_device(id=2, name="Linde H30D"),
    ]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = devices
    mock_session.execute.return_value = mock_result

    response = client.get("/api/devices", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["name"] == "Toyota 8FBE20"
    assert data[1]["name"] == "Linde H30D"


def test_should_return_empty_list_when_no_devices_exist(client, mock_session):
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_session.execute.return_value = mock_result

    response = client.get("/api/devices", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


def test_should_return_device_when_id_exists(client, mock_session):
    mock_session.get.return_value = make_device(id=1, name="Toyota 8FBE20")

    response = client.get("/api/devices/1", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 1
    assert data["name"] == "Toyota 8FBE20"


def test_should_return_404_when_device_id_not_found(client, mock_session):
    mock_session.get.return_value = None

    response = client.get("/api/devices/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


def test_should_update_device_name_when_patch_provided(client, mock_session):
    device = make_device(id=1, name="Toyota 8FBE20")
    mock_session.get.side_effect = [device]

    async def noop_refresh(obj):
        pass

    mock_session.refresh.side_effect = noop_refresh

    response = client.patch(
        "/api/devices/1", json={"name": "Toyota 8FBE30"}, headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Toyota 8FBE30"


def test_should_return_404_when_updating_nonexistent_device(client, mock_session):
    mock_session.get.side_effect = [None]

    response = client.patch(
        "/api/devices/999", json={"name": "X"}, headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


def test_should_return_404_when_updating_device_with_nonexistent_brand(
    client, mock_session
):
    device = make_device(id=1)
    mock_session.get.side_effect = [device, None]

    response = client.patch(
        "/api/devices/1", json={"brand_id": 999}, headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Brand not found"


def test_should_return_404_when_updating_device_with_nonexistent_device_type(
    client, mock_session
):
    device = make_device(id=1)
    mock_session.get.side_effect = [device, None]

    response = client.patch(
        "/api/devices/1", json={"device_type_id": 999}, headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Device type not found"


def test_should_delete_device_when_id_exists(client, mock_session):
    mock_session.get.return_value = make_device()

    response = client.delete("/api/devices/1", headers=AUTH_HEADERS)

    assert response.status_code == 204
    mock_session.delete.assert_called_once()
    mock_session.commit.assert_called_once()


def test_should_return_404_when_deleting_nonexistent_device(client, mock_session):
    mock_session.get.return_value = None

    response = client.delete("/api/devices/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


def test_should_return_404_when_listing_attachments_for_nonexistent_device(
    client, mock_session
):
    mock_session.get.return_value = None
    response = client.get("/api/devices/999/attachments", headers=AUTH_HEADERS)
    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"
