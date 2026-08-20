from tests.routers.factories import (
    create_category,
    create_attachment,
    create_chunk,
    create_device,
    create_message,
    create_thread,
)
from app.models import ChunkMessage, MessageSender


async def test_member_can_get_message_chunks(member_client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    message = await create_message(session, thread.id)

    response = await member_client.get(f"/api/messages/{message.id}/chunks")

    assert response.status_code == 200


async def test_should_return_chunks_for_assistant_message(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    message = await create_message(session, thread.id, sender=MessageSender.assistant)
    attachment = await create_attachment(session)
    chunk1 = await create_chunk(
        session,
        attachment.id,
        content="Fault E-23 means hydraulic error.",
        extra_metadata={"page": 5},
    )
    chunk2 = await create_chunk(
        session,
        attachment.id,
        content="Reset procedure: hold button for 3s.",
        extra_metadata={"page": 6},
    )
    session.add(ChunkMessage(message_id=message.id, chunk_id=chunk1.id))
    session.add(ChunkMessage(message_id=message.id, chunk_id=chunk2.id))
    await session.commit()

    response = await client.get(f"/api/messages/{message.id}/chunks")

    assert response.status_code == 200
    chunks = response.json()
    assert len(chunks) == 2
    contents = {c["content"] for c in chunks}
    assert "Fault E-23 means hydraulic error." in contents
    assert chunks[0]["attachment_id"] == attachment.id


async def test_should_return_empty_list_when_message_has_no_chunks(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    message = await create_message(session, thread.id)

    response = await client.get(f"/api/messages/{message.id}/chunks")

    assert response.status_code == 200
    assert response.json() == []


async def test_should_return_404_when_message_not_found(client):
    response = await client.get("/api/messages/999/chunks")
    assert response.status_code == 404
    assert response.json()["detail"] == "Message not found"
