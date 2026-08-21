from datetime import datetime, timedelta, timezone

from app.models import ChunkMessage, MessageSender
from tests.routers.factories import (
    create_attachment,
    create_category,
    create_chunk,
    create_device,
    create_message,
    create_organization,
    create_thread,
    link_attachment_device,
)


async def test_app_admin_lists_all_threads_newest_first(app_admin_client, session):
    other_organization = await create_organization(session, name="Other Service")
    default_category = await create_category(session)
    other_category = await create_category(
        session, organization_id=other_organization.id, name="Linde"
    )
    default_device = await create_device(session, default_category.id, name="Toyota")
    other_device = await create_device(session, other_category.id, name="Linde H20")
    older = await create_thread(session, default_device.id, title="Older thread")
    newer = await create_thread(session, other_device.id, title="Newer thread")
    older.created_at = datetime.now(timezone.utc) - timedelta(days=1)
    newer.created_at = datetime.now(timezone.utc)
    await create_message(
        session, newer.id, content="Question", sender=MessageSender.user
    )
    await create_message(session, newer.id, content="Answer")
    await session.commit()

    response = await app_admin_client.get("/api/admin/messages/threads")

    assert response.status_code == 200
    data = response.json()
    assert [thread["id"] for thread in data] == [newer.id, older.id]
    assert data[0]["organization_name"] == "Other Service"
    assert data[0]["device_name"] == "Linde H20"
    assert data[0]["message_count"] == 2
    assert data[0]["last_message_at"] is not None


async def test_app_admin_reads_thread_messages_chronologically(
    app_admin_client, session
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    question = await create_message(
        session, thread.id, content="Question", sender=MessageSender.user
    )
    answer = await create_message(session, thread.id, content="Answer")
    attachment = await create_attachment(
        session, original_filename="service-manual.pdf"
    )
    chunk = await create_chunk(
        session,
        attachment.id,
        content="Hydraulic pressure procedure",
        extra_metadata={"page": 4, "images": ["diagram.png"]},
    )
    session.add(ChunkMessage(message_id=answer.id, chunk_id=chunk.id))
    await session.commit()

    response = await app_admin_client.get(
        f"/api/admin/messages/threads/{thread.id}/messages"
    )

    assert response.status_code == 200
    data = response.json()
    assert [message["id"] for message in data] == [question.id, answer.id]
    assert data[0]["chunks"] == []
    assert data[1]["chunks"] == [
        {
            "id": chunk.id,
            "attachment_id": attachment.id,
            "attachment_name": "service-manual.pdf",
            "content": "Hydraulic pressure procedure",
            "metadata": {"page": 4, "images": ["diagram.png"]},
        }
    ]


async def test_app_admin_creates_thread_for_another_organization(
    app_admin_client, session
):
    organization = await create_organization(session, name="Remote Service")
    category = await create_category(session, organization_id=organization.id)
    device = await create_device(session, category.id, name="Still RX60")

    response = await app_admin_client.post(
        "/api/admin/messages/threads",
        json={"device_id": device.id, "title": "Hydraulic issue"},
    )

    assert response.status_code == 201
    assert response.json()["title"] == "Hydraulic issue"
    assert response.json()["organization_id"] == organization.id
    assert response.json()["message_count"] == 0


async def test_app_admin_sends_message_in_another_organizations_thread(
    app_admin_client, session, mock_azure_embeddings, mock_openai_llm
):
    organization = await create_organization(session)
    category = await create_category(session, organization_id=organization.id)
    device = await create_device(session, category.id)
    attachment = await create_attachment(session, organization_id=organization.id)
    await link_attachment_device(session, attachment.id, device.id)
    await create_chunk(session, attachment.id)
    thread = await create_thread(session, device.id)

    response = await app_admin_client.post(
        f"/api/admin/messages/threads/{thread.id}/messages",
        json={"content": "What is error E-23?"},
    )

    assert response.status_code == 200
    events = {
        line.removeprefix("event: ")
        for line in response.text.splitlines()
        if line.startswith("event: ")
    }
    assert "chunk" in events
    assert "message" in events


async def test_message_debug_endpoints_require_app_admin(client):
    response = await client.get("/api/admin/messages/threads")
    assert response.status_code == 403
