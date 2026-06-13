from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError

from tests.routers.conftest import AUTH_HEADERS
from tests.routers.factories import make_device_type


def test_should_create_device_type_when_valid_data_provided(client, mock_session):
    async def set_id(obj):
        obj.id = 1
        obj.created_at = datetime.now(timezone.utc)
        obj.updated_at = datetime.now(timezone.utc)

    mock_session.refresh.side_effect = set_id

    response = client.post(
        "/api/device_types",
        json={"name": "Counterbalance Forklift"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Counterbalance Forklift"
    assert data["id"] == 1
    mock_session.add.assert_called_once()
    mock_session.commit.assert_called_once()


def test_should_return_422_when_creating_device_type_without_name(client, mock_session):
    response = client.post("/api/device_types", json={}, headers=AUTH_HEADERS)

    assert response.status_code == 422


def test_should_list_all_device_types(client, mock_session, mocker):
    device_types = [
        make_device_type(id=1, name="Counterbalance Forklift"),
        make_device_type(id=2, name="Reach Truck"),
    ]
    mock_result = mocker.MagicMock()
    mock_result.scalars.return_value.all.return_value = device_types
    mock_session.execute.return_value = mock_result

    response = client.get("/api/device_types", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["name"] == "Counterbalance Forklift"
    assert data[1]["name"] == "Reach Truck"


def test_should_return_empty_list_when_no_device_types_exist(
    client, mock_session, mocker
):
    mock_result = mocker.MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_session.execute.return_value = mock_result

    response = client.get("/api/device_types", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


def test_should_return_device_type_when_id_exists(client, mock_session):
    mock_session.get.return_value = make_device_type(id=1, name="Reach Truck")

    response = client.get("/api/device_types/1", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 1
    assert data["name"] == "Reach Truck"


def test_should_return_404_when_device_type_id_not_found(client, mock_session):
    mock_session.get.return_value = None

    response = client.get("/api/device_types/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Device type not found"


def test_should_update_device_type_name_when_patch_provided(client, mock_session):
    device_type = make_device_type(id=1, name="Counterbalance Forklift")
    mock_session.get.return_value = device_type

    async def noop_refresh(obj):
        pass

    mock_session.refresh.side_effect = noop_refresh

    response = client.patch(
        "/api/device_types/1",
        json={"name": "Pallet Jack"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Pallet Jack"


def test_should_return_404_when_updating_nonexistent_device_type(client, mock_session):
    mock_session.get.return_value = None

    response = client.patch(
        "/api/device_types/999", json={"name": "X"}, headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Device type not found"


def test_should_delete_device_type_when_id_exists(client, mock_session):
    mock_session.get.return_value = make_device_type()

    response = client.delete("/api/device_types/1", headers=AUTH_HEADERS)

    assert response.status_code == 204
    mock_session.delete.assert_called_once()
    mock_session.commit.assert_called_once()


def test_should_return_404_when_deleting_nonexistent_device_type(client, mock_session):
    mock_session.get.return_value = None

    response = client.delete("/api/device_types/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Device type not found"


def test_should_return_409_when_deleting_device_type_referenced_by_devices(
    client, mock_session
):
    mock_session.get.return_value = make_device_type()
    mock_session.commit.side_effect = IntegrityError(None, None, Exception())

    response = client.delete("/api/device_types/1", headers=AUTH_HEADERS)

    assert response.status_code == 409
    assert "Cannot delete device type" in response.json()["detail"]
    mock_session.rollback.assert_called_once()
