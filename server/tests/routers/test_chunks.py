from unittest.mock import MagicMock

from tests.routers.conftest import AUTH_HEADERS
from tests.routers.factories import make_chunk


def test_should_list_chunks(client, mock_session):
    chunks = [make_chunk(id=1), make_chunk(id=2)]
    mock_count = MagicMock()
    mock_count.scalar_one.return_value = 2
    mock_rows = MagicMock()
    mock_rows.scalars.return_value.all.return_value = chunks
    mock_session.execute.side_effect = [mock_count, mock_rows]

    response = client.get("/api/chunks", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["id"] == 1
    assert data[0]["content"] == "Fault code E-23 means hydraulic error."
    assert data[0]["attachment_id"] == 1
    assert data[0]["metadata"] == {"page": 5}


def test_should_return_empty_list_when_no_chunks(client, mock_session):
    mock_count = MagicMock()
    mock_count.scalar_one.return_value = 0
    mock_rows = MagicMock()
    mock_rows.scalars.return_value.all.return_value = []
    mock_session.execute.side_effect = [mock_count, mock_rows]

    response = client.get("/api/chunks", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


def test_should_filter_chunks_by_attachment_id(client, mock_session):
    chunks = [make_chunk(id=1, attachment_id=5), make_chunk(id=2, attachment_id=5)]
    mock_count = MagicMock()
    mock_count.scalar_one.return_value = 2
    mock_rows = MagicMock()
    mock_rows.scalars.return_value.all.return_value = chunks
    mock_session.execute.side_effect = [mock_count, mock_rows]

    response = client.get("/api/chunks?attachment_id=5", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert all(c["attachment_id"] == 5 for c in data)


def test_should_clamp_page_below_one(client, mock_session):
    mock_count = MagicMock()
    mock_count.scalar_one.return_value = 1
    mock_rows = MagicMock()
    mock_rows.scalars.return_value.all.return_value = [make_chunk()]
    mock_session.execute.side_effect = [mock_count, mock_rows]

    response = client.get("/api/chunks?page=0", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_should_delete_chunk_when_id_exists(client, mock_session):
    mock_session.get.return_value = make_chunk()

    response = client.delete("/api/chunks/1", headers=AUTH_HEADERS)

    assert response.status_code == 204
    mock_session.delete.assert_called_once()
    mock_session.commit.assert_called_once()


def test_should_return_404_when_deleting_nonexistent_chunk(client, mock_session):
    mock_session.get.return_value = None

    response = client.delete("/api/chunks/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Chunk not found"
