from app.services.embedding import RetrievedChunk
from app.services.retrieval import (
    get_bm25_chunks,
    get_exact_match_chunks,
    get_semantic_chunks,
    merge_hybrid_chunks,
    retrieve_context_chunks,
)
from app.models import EMBEDDING_DIMENSIONS
from sqlalchemy.ext.asyncio import AsyncSession

from tests.routers.factories import (
    create_attachment,
    create_brand,
    create_chunk,
    create_device,
    create_device_type,
    link_attachment_device,
)


def _embedding(value: float) -> list[float]:
    vector = [0.0] * EMBEDDING_DIMENSIONS
    vector[0] = value
    return vector


async def test_get_semantic_chunks_with_device_id(mocker):
    session = mocker.AsyncMock(spec=AsyncSession)

    chunk1 = mocker.MagicMock()
    chunk1.id = 1
    chunk1.content = "chunk 1"
    chunk1.attachment_id = 10
    chunk1.extra_metadata = None

    chunk2 = mocker.MagicMock()
    chunk2.id = 2
    chunk2.content = "chunk 2"
    chunk2.attachment_id = 10
    chunk2.extra_metadata = {"page": 1}

    mock_result = mocker.MagicMock()
    mock_result.all.return_value = [chunk1, chunk2]
    session.scalars.return_value = mock_result

    result = await get_semantic_chunks(session, [0.1, 0.2], device_id=5, limit=5)

    assert result == [
        {"id": 1, "content": "chunk 1", "attachment_id": 10, "extra_metadata": None},
        {
            "id": 2,
            "content": "chunk 2",
            "attachment_id": 10,
            "extra_metadata": {"page": 1},
        },
    ]
    session.scalars.assert_called_once()


async def test_get_semantic_chunks_skips_chunks_without_id(mocker):
    session = mocker.AsyncMock(spec=AsyncSession)

    chunk = mocker.MagicMock()
    chunk.id = None
    chunk.content = "skip me"

    mock_result = mocker.MagicMock()
    mock_result.all.return_value = [chunk]
    session.scalars.return_value = mock_result

    result = await get_semantic_chunks(session, [0.1], device_id=1, limit=5)

    assert result == []


async def test_get_exact_match_chunks_matches_query_tokens(mocker):
    rows: list[RetrievedChunk] = [
        {
            "id": 1,
            "content": "Fault code E-23 means hydraulic error.",
            "attachment_id": 1,
            "extra_metadata": None,
        },
        {
            "id": 2,
            "content": "Pump replacement guide.",
            "attachment_id": 1,
            "extra_metadata": None,
        },
    ]

    result = get_exact_match_chunks(rows, "E-23", limit=3)

    assert [r["id"] for r in result] == [1]


async def test_get_bm25_chunks_ranks_by_token_overlap(mocker):
    rows: list[RetrievedChunk] = [
        {
            "id": 1,
            "content": "how to replace the drive belt",
            "attachment_id": 1,
            "extra_metadata": None,
        },
        {
            "id": 2,
            "content": "hydraulic pump failure notes",
            "attachment_id": 1,
            "extra_metadata": None,
        },
        {
            "id": 3,
            "content": "battery charging procedure",
            "attachment_id": 1,
            "extra_metadata": None,
        },
    ]
    session = mocker.AsyncMock(spec=AsyncSession)

    result = await get_bm25_chunks(session, "replace belt", device_id=1, rows=rows)

    assert [r["id"] for r in result] == [1]


async def test_merge_hybrid_chunks_dedupes_and_preserves_order(session):
    a: RetrievedChunk = {
        "id": 1,
        "content": "a",
        "attachment_id": 1,
        "extra_metadata": None,
    }
    b: RetrievedChunk = {
        "id": 2,
        "content": "b",
        "attachment_id": 1,
        "extra_metadata": None,
    }
    c: RetrievedChunk = {
        "id": 1,
        "content": "a",
        "attachment_id": 1,
        "extra_metadata": None,
    }

    result = merge_hybrid_chunks([a], [b], [c])

    assert [r["id"] for r in result] == [1, 2]


async def test_retrieve_context_chunks_uses_original_query_for_semantic_search(
    session, settings, mocker
):
    brand = await create_brand(session)
    device_type = await create_device_type(session)
    device = await create_device(session, brand.id, device_type.id)
    attachment = await create_attachment(session)
    await link_attachment_device(session, attachment.id, device.id)

    semantic_chunk = await create_chunk(
        session,
        attachment.id,
        content="Hydraulic pump failure troubleshooting",
        embedding=_embedding(1.0),
    )
    await create_chunk(
        session,
        attachment.id,
        content="Drive belt replacement guide",
        embedding=_embedding(0.0),
    )

    mocker.patch(
        "app.services.retrieval.embed_question",
        return_value=_embedding(1.0),
    )
    mocker.patch(
        "app.services.retrieval.translate_query",
        return_value="drive belt replacement",
    )

    result = await retrieve_context_chunks(
        session, "pompa hydrauliczna awaria", device.id, settings
    )

    assert result[0]["id"] == semantic_chunk.id


async def test_retrieve_context_chunks_uses_translated_query_for_bm25(
    session, settings, mocker
):
    brand = await create_brand(session)
    device_type = await create_device_type(session)
    device = await create_device(session, brand.id, device_type.id)
    attachment = await create_attachment(session)
    await link_attachment_device(session, attachment.id, device.id)

    semantic_chunk = await create_chunk(
        session,
        attachment.id,
        content="Hydraulic pressure valve test",
        embedding=_embedding(1.0),
    )
    bm25_chunk = await create_chunk(
        session,
        attachment.id,
        content="how to replace the drive belt",
        embedding=_embedding(0.0),
    )
    await create_chunk(
        session,
        attachment.id,
        content="battery charging procedure",
        embedding=_embedding(0.0),
    )

    mocker.patch(
        "app.services.retrieval.embed_question",
        return_value=_embedding(1.0),
    )
    mocker.patch(
        "app.services.retrieval.translate_query",
        return_value="how to replace the drive belt",
    )

    result = await retrieve_context_chunks(
        session, "wymiana paska napędowego", device.id, settings
    )

    ids = [r["id"] for r in result]
    assert ids[0] == semantic_chunk.id
    assert bm25_chunk.id in ids


async def test_retrieve_context_chunks_order_exact_then_semantic_then_bm25(
    session, settings, mocker
):
    brand = await create_brand(session)
    device_type = await create_device_type(session)
    device = await create_device(session, brand.id, device_type.id)
    attachment = await create_attachment(session)
    await link_attachment_device(session, attachment.id, device.id)

    exact_chunk = await create_chunk(
        session,
        attachment.id,
        content="Fault code E-23 means hydraulic error.",
        embedding=_embedding(0.0),
    )
    semantic_chunk = await create_chunk(
        session,
        attachment.id,
        content="Hydraulic system overview",
        embedding=_embedding(1.0),
    )
    bm25_chunk = await create_chunk(
        session,
        attachment.id,
        content="translated query text here",
        embedding=_embedding(0.0),
    )

    mocker.patch(
        "app.services.retrieval.embed_question",
        return_value=_embedding(1.0),
    )
    mocker.patch(
        "app.services.retrieval.translate_query",
        return_value="translated query text",
    )

    result = await retrieve_context_chunks(session, "błąd E-23", device.id, settings)

    assert [r["id"] for r in result] == [
        exact_chunk.id,
        semantic_chunk.id,
        bm25_chunk.id,
    ]


async def test_retrieve_context_chunks_deduplicates_chunks_across_sources(
    session, settings, mocker
):
    brand = await create_brand(session)
    device_type = await create_device_type(session)
    device = await create_device(session, brand.id, device_type.id)
    attachment = await create_attachment(session)
    await link_attachment_device(session, attachment.id, device.id)

    shared_chunk = await create_chunk(
        session,
        attachment.id,
        content="E-23 hydraulic pump translated query text",
        embedding=_embedding(1.0),
    )

    mocker.patch(
        "app.services.retrieval.embed_question",
        return_value=_embedding(1.0),
    )
    mocker.patch(
        "app.services.retrieval.translate_query",
        return_value="translated query text",
    )

    result = await retrieve_context_chunks(session, "błąd E-23", device.id, settings)

    assert [r["id"] for r in result] == [shared_chunk.id]
