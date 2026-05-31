from datetime import datetime, timezone
from unittest.mock import MagicMock

AUTH_HEADERS = {"Authorization": "Bearer CHANGEMELATER"}


def test_should_return_chunks_for_system_message(client, mock_session):
    now = datetime.now(timezone.utc)
    mock_exists = MagicMock()
    mock_exists.fetchone.return_value = (1,)
    mock_chunks = MagicMock()
    mock_chunks.fetchall.return_value = [
        (1, 10, "Fault E-23 means hydraulic error.", {"page": 5}, now, now),
        (2, 10, "Reset procedure: hold button for 3s.", {"page": 6}, now, now),
    ]
    mock_session.execute.side_effect = [mock_exists, mock_chunks]

    response = client.get("/api/messages/1/chunks", headers=AUTH_HEADERS)

    assert response.status_code == 200
    chunks = response.json()
    assert len(chunks) == 2
    assert chunks[0]["id"] == 1
    assert chunks[0]["content"] == "Fault E-23 means hydraulic error."
    assert chunks[0]["attachment_id"] == 10
    assert chunks[0]["metadata"] == {"page": 5}
    assert chunks[1]["id"] == 2


def test_should_return_empty_list_when_message_has_no_chunks(client, mock_session):
    mock_exists = MagicMock()
    mock_exists.fetchone.return_value = (1,)
    mock_chunks = MagicMock()
    mock_chunks.fetchall.return_value = []
    mock_session.execute.side_effect = [mock_exists, mock_chunks]

    response = client.get("/api/messages/1/chunks", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


def test_should_return_404_when_message_not_found(client, mock_session):
    mock_exists = MagicMock()
    mock_exists.fetchone.return_value = None
    mock_session.execute.return_value = mock_exists

    response = client.get("/api/messages/999/chunks", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Message not found"
