import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from app.models import ChatThread, Message, MessageSender

AUTH_HEADERS = {"Authorization": "Bearer CHANGEMELATER"}


def make_thread(**kwargs) -> ChatThread:
    defaults = dict(
        id=1,
        device_id=1,
        title="Mast won't lift",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    defaults.update(kwargs)
    return ChatThread(**defaults)


def make_message(**kwargs) -> Message:
    defaults = dict(
        id=1,
        content="Test content",
        thread_id=1,
        image_url=None,
        sender=MessageSender.system,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    defaults.update(kwargs)
    return Message(**defaults)


def test_should_create_thread_when_valid_data_provided(client, mock_session):
    async def set_id(obj):
        obj.id = 1

    mock_session.refresh.side_effect = set_id

    response = client.post(
        "/api/threads",
        json={"device_id": 1, "title": "Mast won't lift"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Mast won't lift"
    assert data["device_id"] == 1


def test_should_list_all_threads(client, mock_session):
    threads = [
        make_thread(id=1, title="Thread 1"),
        make_thread(id=2, title="Thread 2"),
    ]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = threads
    mock_session.execute.return_value = mock_result

    response = client.get("/api/threads", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["title"] == "Thread 1"
    assert data[1]["title"] == "Thread 2"


def test_should_return_empty_list_when_no_threads_exist(client, mock_session):
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_session.execute.return_value = mock_result

    response = client.get("/api/threads", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


def test_should_delete_thread_when_id_exists(client, mock_session):
    mock_session.get.return_value = make_thread()

    response = client.delete("/api/threads/1", headers=AUTH_HEADERS)

    assert response.status_code == 204
    mock_session.delete.assert_called_once()
    mock_session.commit.assert_called_once()


def test_should_return_404_when_deleting_nonexistent_thread(client, mock_session):
    mock_session.get.return_value = None

    response = client.delete("/api/threads/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Thread not found"


def test_should_send_message_and_return_system_reply(client, mock_session):
    thread = make_thread(id=1, device_id=1)
    mock_session.get.return_value = thread

    async def set_id(obj):
        obj.id = 2

    mock_session.refresh.side_effect = set_id

    fake_chunks = [
        {
            "id": 10,
            "content": "Fault E-23 means hydraulic system error.",
            "attachment_id": 1,
            "extra_metadata": {"page": 5},
        }
    ]

    async def mock_stream(*args, **kwargs):
        yield "E-23 oznacza"
        yield " błąd systemu hydraulicznego."

    with (
        patch(
            "app.routers.threads.embedding.embed_question",
            new=AsyncMock(return_value=[0.1, 0.2, 0.3]),
        ),
        patch(
            "app.routers.threads.embedding.get_close_chunks",
            new=AsyncMock(return_value=fake_chunks),
        ),
        patch("app.routers.threads.llm.stream_query", new=mock_stream),
    ):
        response = client.post(
            "/api/threads/1/messages",
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
    assert message_data["id"] == 2


def test_should_store_user_message_before_reply(client, mock_session):
    thread = make_thread(id=1, device_id=1)
    mock_session.get.return_value = thread

    async def set_id(obj):
        obj.id = 2

    mock_session.refresh.side_effect = set_id

    async def mock_stream(*args, **kwargs):
        yield "Answer"

    with (
        patch(
            "app.routers.threads.embedding.embed_question",
            new=AsyncMock(return_value=[0.1]),
        ),
        patch(
            "app.routers.threads.embedding.get_close_chunks",
            new=AsyncMock(return_value=[]),
        ),
        patch("app.routers.threads.llm.stream_query", new=mock_stream),
    ):
        client.post(
            "/api/threads/1/messages",
            json={"content": "My question"},
            headers=AUTH_HEADERS,
        )

    # add called at least twice: once for user message, once for system message
    assert mock_session.add.call_count >= 2


def test_should_return_404_when_thread_not_found_on_send_message(client, mock_session):
    mock_session.get.return_value = None

    response = client.post(
        "/api/threads/999/messages",
        json={"content": "test question"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Thread not found"


def test_should_list_messages_in_thread_chronologically(client, mock_session):
    thread = make_thread(id=1)
    user_msg = make_message(id=1, content="User question", sender=MessageSender.user)
    system_msg = make_message(
        id=2, content="System answer", sender=MessageSender.system
    )

    mock_session.get.return_value = thread
    mock_scalars_result = MagicMock()
    mock_scalars_result.all.return_value = [user_msg, system_msg]
    mock_session.scalars.return_value = mock_scalars_result

    response = client.get("/api/threads/1/messages", headers=AUTH_HEADERS)

    assert response.status_code == 200
    messages = response.json()
    assert len(messages) == 2
    assert messages[0]["sender"] == "user"
    assert messages[0]["content"] == "User question"
    assert messages[1]["sender"] == "system"
    assert messages[1]["content"] == "System answer"


def test_should_return_empty_list_when_thread_has_no_messages(client, mock_session):
    mock_session.get.return_value = make_thread()
    mock_scalars_result = MagicMock()
    mock_scalars_result.all.return_value = []
    mock_session.scalars.return_value = mock_scalars_result

    response = client.get("/api/threads/1/messages", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


def test_should_return_404_when_listing_messages_for_nonexistent_thread(
    client, mock_session
):
    mock_session.get.return_value = None

    response = client.get("/api/threads/999/messages", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Thread not found"
