import asyncio

from sqlalchemy import select

from app.models import DeviceType

from tests.routers.factories import create_brand, create_device, create_device_type


async def test_should_create_device_type_when_valid_data_provided(client):
    response = await client.post(
        "/api/device_types",
        json={"name": "Counterbalance Forklift"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Counterbalance Forklift"
    assert isinstance(data["id"], int)


async def test_should_return_422_when_creating_device_type_without_name(client):
    response = await client.post("/api/device_types", json={})
    assert response.status_code == 422


async def test_should_list_all_device_types(client, session):
    await create_device_type(session, name="Counterbalance Forklift")
    await create_device_type(session, name="Reach Truck")

    response = await client.get("/api/device_types")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    names = {dt["name"] for dt in data}
    assert names == {"Counterbalance Forklift", "Reach Truck"}


async def test_should_return_empty_list_when_no_device_types_exist(client):
    response = await client.get("/api/device_types")
    assert response.status_code == 200
    assert response.json() == []


async def test_should_return_device_type_when_id_exists(client, session):
    dt = await create_device_type(session, name="Reach Truck")

    response = await client.get(f"/api/device_types/{dt.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == dt.id
    assert data["name"] == "Reach Truck"


async def test_should_return_404_when_device_type_id_not_found(client):
    response = await client.get("/api/device_types/999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Device type not found"


async def test_should_update_device_type_name_when_patch_provided(client, session):
    dt = await create_device_type(session, name="Counterbalance Forklift")

    response = await client.patch(
        f"/api/device_types/{dt.id}",
        json={"name": "Pallet Jack"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Pallet Jack"
    await session.refresh(dt)
    assert dt.name == "Pallet Jack"


async def test_should_return_404_when_updating_nonexistent_device_type(client):
    response = await client.patch("/api/device_types/999", json={"name": "X"})

    assert response.status_code == 404
    assert response.json()["detail"] == "Device type not found"


async def test_should_delete_device_type_when_id_exists(client, session):
    dt = await create_device_type(session)
    dt_id = dt.id

    response = await client.delete(f"/api/device_types/{dt_id}")

    assert response.status_code == 204
    session.expunge(dt)
    assert await session.get(DeviceType, dt_id) is None


async def test_should_return_404_when_deleting_nonexistent_device_type(client):
    response = await client.delete("/api/device_types/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Device type not found"


async def test_should_return_409_when_deleting_device_type_referenced_by_devices(
    client, session
):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    await create_device(session, brand.id, dt.id)

    response = await client.delete(f"/api/device_types/{dt.id}")

    assert response.status_code == 409
    assert "Cannot delete device type" in response.json()["detail"]


async def test_should_return_unchanged_device_type_when_empty_patch_sent(
    client, session
):
    dt = await create_device_type(session, name="Counterbalance Forklift")

    response = await client.patch(f"/api/device_types/{dt.id}", json={})

    assert response.status_code == 200
    assert response.json()["name"] == "Counterbalance Forklift"
    await session.refresh(dt)
    assert dt.name == "Counterbalance Forklift"


async def test_should_allow_duplicate_device_type_names_on_concurrent_create(
    client, session
):
    async with asyncio.TaskGroup() as tg:
        t1 = tg.create_task(
            client.post(
                "/api/device_types",
                json={"name": "Counterbalance Forklift"},
            )
        )
        t2 = tg.create_task(
            client.post(
                "/api/device_types",
                json={"name": "Counterbalance Forklift"},
            )
        )

    assert t1.result().status_code == 201
    assert t2.result().status_code == 201

    result = await session.execute(
        select(DeviceType).where(DeviceType.name == "Counterbalance Forklift")
    )
    device_types = result.scalars().all()
    assert len(device_types) == 2
