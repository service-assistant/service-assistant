from tests.routers.factories import create_category, create_device, create_thread


async def test_should_list_devices_in_app_admins_own_organization(
    app_admin_client, session
):
    category = await create_category(session)
    await create_device(session, category.id, name="Toyota 8FBE20")

    response = await app_admin_client.get("/api/admin/next-best-step/devices")

    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_should_forbid_org_admin_from_listing_devices(client):
    response = await client.get("/api/admin/next-best-step/devices")

    assert response.status_code == 403


async def test_should_create_thread_when_valid_data_provided(app_admin_client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)

    response = await app_admin_client.post(
        "/api/admin/next-best-step/threads",
        json={"device_id": device.id, "title": "Mast won't lift"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Mast won't lift"
    assert data["device_id"] == device.id


async def test_should_return_404_when_creating_thread_with_nonexistent_device(
    app_admin_client,
):
    response = await app_admin_client.post(
        "/api/admin/next-best-step/threads",
        json={"device_id": 999, "title": "Test"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


async def test_should_stream_debug_events_when_sending_message(
    app_admin_client, session, mock_azure_embeddings, mock_openai_llm
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)

    response = await app_admin_client.post(
        f"/api/admin/next-best-step/threads/{thread.id}/messages",
        json={"content": "What is error E-23?"},
    )

    assert response.status_code == 200
    events = {
        line.removeprefix("event: ")
        for line in response.text.splitlines()
        if line.startswith("event: ")
    }
    assert "debug" in events
    assert "message" in events


async def test_should_return_404_when_thread_not_found_on_send_message(
    app_admin_client,
):
    response = await app_admin_client.post(
        "/api/admin/next-best-step/threads/999/messages",
        json={"content": "What is error E-23?"},
    )

    assert response.status_code == 404
