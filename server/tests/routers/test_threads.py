import json
from contextlib import asynccontextmanager

from sqlalchemy import select

from app.models import Message, MessageSender
from app.services.stt import SttError

from tests.routers.conftest import AUTH_HEADERS
from tests.routers.factories import (
    create_brand,
    create_device,
    create_device_type,
    create_message,
    create_thread,
    make_thread,
)


async def test_should_create_thread_when_valid_data_provided(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)

    response = await client.post(
        "/api/threads",
        json={"device_id": device.id, "title": "Mast won't lift"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Mast won't lift"
    assert data["device_id"] == device.id


async def test_should_return_404_when_creating_thread_with_nonexistent_device(client):
    response = await client.post(
        "/api/threads",
        json={"device_id": 999, "title": "Test"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


async def test_should_list_all_threads(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    await create_thread(session, device.id, title="Thread 1")
    await create_thread(session, device.id, title="Thread 2")

    response = await client.get("/api/threads", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    titles = {t["title"] for t in data}
    assert titles == {"Thread 1", "Thread 2"}


async def test_should_return_empty_list_when_no_threads_exist(client):
    response = await client.get("/api/threads", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


async def test_should_return_thread_when_id_exists(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    thread = await create_thread(session, device.id, title="Mast won't lift")

    response = await client.get(f"/api/threads/{thread.id}", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == thread.id
    assert data["title"] == "Mast won't lift"
    assert data["device_id"] == device.id


async def test_should_return_404_when_getting_nonexistent_thread(client):
    response = await client.get("/api/threads/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Thread not found"


async def test_should_delete_thread_when_id_exists(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    thread = await create_thread(session, device.id)

    response = await client.delete(f"/api/threads/{thread.id}", headers=AUTH_HEADERS)

    assert response.status_code == 204


async def test_should_return_404_when_deleting_nonexistent_thread(client):
    response = await client.delete("/api/threads/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Thread not found"


async def test_should_send_message_and_return_system_reply(client, session, mocker):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    thread = await create_thread(session, device.id)

    async def mock_stream(*args, **kwargs):
        yield "E-23 oznacza"
        yield " błąd systemu hydraulicznego."

    mocker.patch(
        "app.routers.threads.retrieval.retrieve_context_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )
    mocker.patch("app.routers.threads.llm.stream_query", new=mock_stream)

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={"content": "What is error E-23?"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200
    lines = response.text.splitlines()
    message_data = None
    for i, line in enumerate(lines):
        if line == "event: message":
            message_data = json.loads(lines[i + 1].removeprefix("data: "))
            break
    assert message_data is not None
    assert message_data["sender"] == "system"
    assert message_data["content"] == "E-23 oznacza błąd systemu hydraulicznego."
    assert isinstance(message_data["id"], int)


async def test_should_store_user_message_before_reply(client, session, mocker):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    thread = await create_thread(session, device.id)

    async def mock_stream(*args, **kwargs):
        yield "Answer"

    mocker.patch(
        "app.routers.threads.retrieval.retrieve_context_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )
    mocker.patch("app.routers.threads.llm.stream_query", new=mock_stream)

    await client.post(
        f"/api/threads/{thread.id}/messages",
        json={"content": "My question"},
        headers=AUTH_HEADERS,
    )

    result = await session.execute(
        select(Message).where(Message.thread_id == thread.id)
    )
    messages = result.scalars().all()
    assert len(messages) >= 2
    senders = {m.sender for m in messages}
    assert MessageSender.user in senders
    assert MessageSender.system in senders


async def test_should_return_404_when_thread_not_found_on_send_message(client):
    response = await client.post(
        "/api/threads/999/messages",
        json={"content": "test question"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Thread not found"


async def test_should_list_messages_in_thread_chronologically(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    thread = await create_thread(session, device.id)
    await create_message(
        session, thread.id, content="User question", sender=MessageSender.user
    )
    await create_message(
        session, thread.id, content="System answer", sender=MessageSender.system
    )

    response = await client.get(
        f"/api/threads/{thread.id}/messages", headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    messages = response.json()
    assert len(messages) == 2
    assert messages[0]["sender"] == "user"
    assert messages[0]["content"] == "User question"
    assert messages[1]["sender"] == "system"
    assert messages[1]["content"] == "System answer"


async def test_should_return_empty_list_when_thread_has_no_messages(client, session):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    thread = await create_thread(session, device.id)

    response = await client.get(
        f"/api/threads/{thread.id}/messages", headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    assert response.json() == []


async def test_should_return_404_when_listing_messages_for_nonexistent_thread(client):
    response = await client.get("/api/threads/999/messages", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Thread not found"


async def test_should_transcribe_audio_when_thread_exists(client, session, mocker):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    thread = await create_thread(session, device.id)

    mocker.patch(
        "app.routers.threads.stt.transcribe",
        new=mocker.AsyncMock(return_value="Oil pressure low"),
    )

    response = await client.post(
        f"/api/threads/{thread.id}/messages/transcribe",
        files={"audio": ("recording.m4a", b"fake audio bytes", "audio/m4a")},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["transcript"] == "Oil pressure low"


async def test_should_return_404_when_transcribing_for_nonexistent_thread(client):
    response = await client.post(
        "/api/threads/999/messages/transcribe",
        files={"audio": ("recording.m4a", b"fake audio bytes", "audio/m4a")},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Thread not found"


async def test_should_return_502_when_stt_service_fails(client, session, mocker):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    thread = await create_thread(session, device.id)

    mocker.patch(
        "app.routers.threads.stt.transcribe",
        new=mocker.AsyncMock(
            side_effect=SttError("Deepgram error 503: service unavailable")
        ),
    )

    response = await client.post(
        f"/api/threads/{thread.id}/messages/transcribe",
        files={"audio": ("recording.m4a", b"fake audio bytes", "audio/m4a")},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 502


async def test_should_return_422_when_audio_is_empty(client, session, mocker):
    brand = await create_brand(session)
    dt = await create_device_type(session)
    device = await create_device(session, brand.id, dt.id)
    thread = await create_thread(session, device.id)

    mocker.patch(
        "app.routers.threads.stt.transcribe",
        new=mocker.AsyncMock(side_effect=SttError("Empty audio file")),
    )

    response = await client.post(
        f"/api/threads/{thread.id}/messages/transcribe",
        files={"audio": ("recording.m4a", b"", "audio/m4a")},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 422


def test_should_stream_final_transcript_when_audio_sent(ws_client, mocker):
    client, mock_session = ws_client
    mock_session.get.return_value = make_thread(id=1)

    class MockDgWs:
        def __init__(self):
            self.send = mocker.AsyncMock()

        def __aiter__(self):
            return self._iter()

        async def _iter(self):
            yield json.dumps(
                {
                    "type": "Results",
                    "is_final": True,
                    "channel": {
                        "alternatives": [
                            {"transcript": "Opisz mi co mówi kod błedu 2:002?"}
                        ]
                    },
                }
            )

    @asynccontextmanager
    async def mock_deepgram_ws(*args, **kwargs):
        yield MockDgWs()

    mocker.patch("app.routers.threads.stt.deepgram_websocket", new=mock_deepgram_ws)

    with client.websocket_connect(
        "/api/threads/1/messages/transcribe-stream?token=CHANGEMELATER"
    ) as ws:
        ws.send_bytes(b"\x00" * 64)
        data = ws.receive_json()

    assert data["type"] == "final"
    assert data["transcript"] == "Opisz mi co mówi kod błedu 2:002?"


def test_should_send_error_when_thread_not_found_via_websocket(ws_client):
    client, mock_session = ws_client
    mock_session.get.return_value = None

    with client.websocket_connect(
        "/api/threads/999/messages/transcribe-stream?token=CHANGEMELATER"
    ) as ws:
        data = ws.receive_json()

    assert data["type"] == "error"
    assert "Thread not found" in data["message"]


def test_should_send_error_when_stt_service_fails_during_stream(ws_client, mocker):
    client, mock_session = ws_client
    mock_session.get.return_value = make_thread(id=1)

    @asynccontextmanager
    async def mock_failing_dg_ws(*args, **kwargs):
        raise SttError("Deepgram connection failed")
        yield

    mocker.patch("app.routers.threads.stt.deepgram_websocket", new=mock_failing_dg_ws)

    with client.websocket_connect(
        "/api/threads/1/messages/transcribe-stream?token=CHANGEMELATER"
    ) as ws:
        data = ws.receive_json()

    assert data["type"] == "error"
    assert "Deepgram connection failed" in data["message"]
