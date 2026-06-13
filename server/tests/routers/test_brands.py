from tests.routers.conftest import AUTH_HEADERS
from tests.routers.factories import create_brand, create_device, create_device_type


async def test_should_create_brand_when_valid_data_provided(client):
    response = await client.post(
        "/api/brands",
        json={"name": "Toyota"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Toyota"
    assert isinstance(data["id"], int)


async def test_should_return_422_when_creating_brand_without_name(client):
    response = await client.post("/api/brands", json={}, headers=AUTH_HEADERS)

    assert response.status_code == 422


async def test_should_list_all_brands(client, session):
    await create_brand(session, name="Toyota")
    await create_brand(session, name="Linde")

    response = await client.get("/api/brands", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    names = {b["name"] for b in data}
    assert names == {"Toyota", "Linde"}


async def test_should_return_empty_list_when_no_brands_exist(client):
    response = await client.get("/api/brands", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


async def test_should_return_brand_when_id_exists(client, session):
    brand = await create_brand(session, name="Toyota")

    response = await client.get(f"/api/brands/{brand.id}", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == brand.id
    assert data["name"] == "Toyota"


async def test_should_return_404_when_brand_id_not_found(client):
    response = await client.get("/api/brands/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Brand not found"


async def test_should_update_brand_name_when_patch_provided(client, session):
    brand = await create_brand(session, name="Toyota")

    response = await client.patch(
        f"/api/brands/{brand.id}", json={"name": "Toyota MH"}, headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Toyota MH"


async def test_should_return_404_when_updating_nonexistent_brand(client):
    response = await client.patch(
        "/api/brands/999", json={"name": "X"}, headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Brand not found"


async def test_should_delete_brand_when_id_exists(client, session):
    brand = await create_brand(session)

    response = await client.delete(f"/api/brands/{brand.id}", headers=AUTH_HEADERS)

    assert response.status_code == 204


async def test_should_return_404_when_deleting_nonexistent_brand(client):
    response = await client.delete("/api/brands/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Brand not found"


async def test_should_return_409_when_deleting_brand_referenced_by_devices(
    client, session
):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    await create_device(session, brand.id, dt.id)

    response = await client.delete(f"/api/brands/{brand.id}", headers=AUTH_HEADERS)

    assert response.status_code == 409
    assert "Cannot delete brand" in response.json()["detail"]


async def test_should_return_unchanged_brand_when_empty_patch_sent(client, session):
    brand = await create_brand(session, name="Toyota")

    response = await client.patch(
        f"/api/brands/{brand.id}", json={}, headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Toyota"
