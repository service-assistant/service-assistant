from datetime import datetime
from unittest.mock import MagicMock

from app.models import Brand

AUTH_HEADERS = {"Authorization": "Bearer CHANGEMELATER"}


def make_brand(**kwargs) -> Brand:
    defaults = dict(
        id=1,
        name="Toyota",
        logo_url=None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    defaults.update(kwargs)
    return Brand(**defaults)


def test_should_create_brand_when_valid_data_provided(client, mock_session):
    async def set_id(obj):
        obj.id = 1

    mock_session.refresh.side_effect = set_id

    response = client.post("/api/brands", json={"name": "Toyota"}, headers=AUTH_HEADERS)

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Toyota"
    assert data["id"] == 1
    mock_session.add.assert_called_once()
    mock_session.commit.assert_called_once()


def test_should_create_brand_with_logo_url(client, mock_session):
    async def set_id(obj):
        obj.id = 2
        obj.logo_url = "https://example.com/logo.png"

    mock_session.refresh.side_effect = set_id

    response = client.post(
        "/api/brands",
        json={"name": "Linde", "logo_url": "https://example.com/logo.png"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 201
    assert response.json()["logo_url"] == "https://example.com/logo.png"


def test_should_list_all_brands(client, mock_session):
    brands = [make_brand(id=1, name="Toyota"), make_brand(id=2, name="Linde")]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = brands
    mock_session.execute.return_value = mock_result

    response = client.get("/api/brands", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["name"] == "Toyota"
    assert data[1]["name"] == "Linde"


def test_should_return_empty_list_when_no_brands_exist(client, mock_session):
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_session.execute.return_value = mock_result

    response = client.get("/api/brands", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


def test_should_return_brand_when_id_exists(client, mock_session):
    mock_session.get.return_value = make_brand(id=1, name="Toyota")

    response = client.get("/api/brands/1", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 1
    assert data["name"] == "Toyota"


def test_should_return_404_when_brand_id_not_found(client, mock_session):
    mock_session.get.return_value = None

    response = client.get("/api/brands/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Brand not found"


def test_should_update_brand_name_when_patch_provided(client, mock_session):
    brand = make_brand(id=1, name="Toyota")
    mock_session.get.return_value = brand

    async def noop_refresh(obj):
        pass

    mock_session.refresh.side_effect = noop_refresh

    response = client.patch(
        "/api/brands/1", json={"name": "Toyota MH"}, headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Toyota MH"


def test_should_return_404_when_updating_nonexistent_brand(client, mock_session):
    mock_session.get.return_value = None

    response = client.patch("/api/brands/999", json={"name": "X"}, headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Brand not found"


def test_should_delete_brand_when_id_exists(client, mock_session):
    mock_session.get.return_value = make_brand()

    response = client.delete("/api/brands/1", headers=AUTH_HEADERS)

    assert response.status_code == 204
    mock_session.delete.assert_called_once()
    mock_session.commit.assert_called_once()


def test_should_return_404_when_deleting_nonexistent_brand(client, mock_session):
    mock_session.get.return_value = None

    response = client.delete("/api/brands/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Brand not found"
