from tests.routers.conftest import AUTH_HEADERS
from tests.routers.factories import create_attachment, create_chunk


async def test_should_list_chunks(client, session):
    attachment = await create_attachment(session)
    await create_chunk(
        session,
        attachment.id,
        content="Fault code E-23 means hydraulic error.",
        extra_metadata={"page": 5},
    )
    await create_chunk(
        session,
        attachment.id,
        content="Reset by holding button for 3s.",
        extra_metadata={"page": 6},
    )

    response = await client.get("/api/chunks", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["content"] == "Fault code E-23 means hydraulic error."
    assert data[0]["attachment_id"] == attachment.id
    assert data[0]["metadata"] == {"page": 5}


async def test_should_return_empty_list_when_no_chunks(client):
    response = await client.get("/api/chunks", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


async def test_should_filter_chunks_by_attachment_id(client, tmp_path, session):
    attachment_a = await create_attachment(
        session, original_filename="a.pdf", file_global_path=str(tmp_path / "a.pdf")
    )
    attachment_b = await create_attachment(
        session, original_filename="b.pdf", file_global_path=str(tmp_path / "b.pdf")
    )
    await create_chunk(session, attachment_a.id)
    await create_chunk(session, attachment_b.id)
    await create_chunk(session, attachment_b.id)

    response = await client.get(
        f"/api/chunks?attachment_id={attachment_b.id}", headers=AUTH_HEADERS
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert all(c["attachment_id"] == attachment_b.id for c in data)


async def test_should_clamp_page_below_one(client, session):
    attachment = await create_attachment(session)
    await create_chunk(session, attachment.id)

    response = await client.get("/api/chunks?page=0", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_should_delete_chunk_when_id_exists(client, session):
    attachment = await create_attachment(session)
    chunk = await create_chunk(session, attachment.id)

    response = await client.delete(f"/api/chunks/{chunk.id}", headers=AUTH_HEADERS)

    assert response.status_code == 204


async def test_should_return_404_when_deleting_nonexistent_chunk(client):
    response = await client.delete("/api/chunks/999", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Chunk not found"


async def test_should_return_empty_list_when_filtering_by_nonexistent_attachment_id(
    client,
):
    response = await client.get("/api/chunks?attachment_id=999", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == []


async def test_should_paginate_chunks_to_second_page(client, session):
    attachment = await create_attachment(session)
    for i in range(21):
        await create_chunk(session, attachment.id, content=f"Chunk {i}")

    response = await client.get("/api/chunks?page=2", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert len(response.json()) == 1
