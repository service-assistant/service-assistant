import asyncio

from app.models import Brand
from tests.routers.factories import create_brand, create_device, create_device_type


async def test_should_create_brand_when_valid_data_provided(client):
    response = await client.post(
        "/api/brands",
        json={"name": "Linde", "logo_url": "https://example.com/logo.png"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Linde"
    assert data["logo_url"] == "https://example.com/logo.png"
    assert isinstance(data["id"], int)


async def test_should_return_422_when_creating_brand_without_name(client):
    response = await client.post("/api/brands", json={})
    assert response.status_code == 422


async def test_should_list_all_brands(client, session):
    await create_brand(session, name="Toyota")
    await create_brand(session, name="Linde")

    response = await client.get("/api/brands")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    names = {b["name"] for b in data}
    assert names == {"Toyota", "Linde"}


async def test_should_return_empty_list_when_no_brands_exist(client):
    response = await client.get("/api/brands")
    assert response.status_code == 200
    assert response.json() == []


async def test_should_return_brand_when_id_exists(client, session):
    brand = await create_brand(session, name="Toyota")

    response = await client.get(f"/api/brands/{brand.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == brand.id
    assert data["name"] == "Toyota"


async def test_should_return_404_when_brand_id_not_found(client):
    response = await client.get("/api/brands/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Brand not found"


async def test_should_update_brand_name_when_patch_provided(client, session):
    brand = await create_brand(
        session,
        name="Toyota",
        logo_url="https://example.com/logo.png",
    )

    response = await client.patch(f"/api/brands/{brand.id}", json={"name": "Toyota MH"})

    assert response.status_code == 200
    assert response.json()["name"] == "Toyota MH"
    assert response.json()["logo_url"] == "https://example.com/logo.png"
    await session.refresh(brand)
    assert brand.name == "Toyota MH"
    assert brand.logo_url == "https://example.com/logo.png"


async def test_should_return_404_when_updating_nonexistent_brand(client):
    response = await client.patch("/api/brands/999", json={"name": "X"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Brand not found"


async def test_should_delete_brand_when_id_exists(client, session):
    brand = await create_brand(session)
    brand_id = brand.id

    response = await client.delete(f"/api/brands/{brand_id}")

    assert response.status_code == 204
    session.expunge(brand)
    assert await session.get(Brand, brand_id) is None


async def test_should_return_404_when_deleting_nonexistent_brand(client):
    response = await client.delete("/api/brands/999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Brand not found"


async def test_should_return_409_when_deleting_brand_referenced_by_devices(
    client, session
):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    await create_device(session, brand.id, dt.id)

    response = await client.delete(f"/api/brands/{brand.id}")

    assert response.status_code == 409
    assert "Cannot delete brand" in response.json()["detail"]


async def test_should_return_unchanged_brand_when_empty_patch_sent(client, session):
    brand = await create_brand(session, name="Toyota")

    response = await client.patch(f"/api/brands/{brand.id}", json={})

    assert response.status_code == 200
    assert response.json()["name"] == "Toyota"
    await session.refresh(brand)
    assert brand.name == "Toyota"


async def test_should_handle_concurrent_brand_delete_and_device_create(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)

    async with asyncio.TaskGroup() as tg:
        t1 = tg.create_task(client.delete(f"/api/brands/{brand.id}"))
        t2 = tg.create_task(
            client.post(
                "/api/devices",
                json={
                    "name": "Test Device",
                    "brand_id": brand.id,
                    "device_type_id": dt.id,
                },
            )
        )

    delete_status = t1.result().status_code
    create_status = t2.result().status_code
    assert (delete_status == 204) != (create_status == 201)
