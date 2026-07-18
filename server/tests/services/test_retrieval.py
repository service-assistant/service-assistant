from app.services.embedding import RetrievedChunk
from app.services.retrieval import (
    get_bm25_chunks,
    get_exact_match_chunks,
    get_semantic_chunks,
    merge_hybrid_chunks,
    retrieve_context_chunks,
)
from app.services.reranker import RerankerError
from app.models import Chunk
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


async def _create_retrieval_context(session):
    brand = await create_brand(session)
    device_type = await create_device_type(session)
    device = await create_device(session, brand.id, device_type.id)
    attachment = await create_attachment(session)
    await link_attachment_device(session, attachment.id, device.id)
    return device, attachment


async def _add_chunks(session, attachment_id, chunks):
    rows = [
        Chunk(
            content=content,
            embedding=embedding,
            extra_metadata={"page": index},
            attachment_id=attachment_id,
        )
        for index, (content, embedding) in enumerate(chunks, start=1)
    ]
    session.add_all(rows)
    await session.commit()
    return rows


async def test_enabled_reranking_uses_wider_deduplicated_pool_and_translated_query(
    session, settings, mocker
):
    device, attachment = await _create_retrieval_context(session)
    await _add_chunks(
        session,
        attachment.id,
        [
            ("Fault code E-23 exact 0", _embedding(1.0)),
            ("Fault code E-23 exact 1", _embedding(0.0)),
            ("Fault code E-23 exact 2", _embedding(0.0)),
            *((f"semantic guide {index}", _embedding(0.9)) for index in range(14)),
            *(
                (f"translated query procedure {index}", _embedding(0.0))
                for index in range(15)
            ),
        ],
    )
    enabled_settings = settings.model_copy(
        update={"reranker_enabled": True, "voyage_api_key": "voyage-test-key"}
    )
    mocker.patch("app.services.retrieval.embed_question", return_value=_embedding(1.0))
    mocker.patch(
        "app.services.retrieval.translate_query", return_value="translated query"
    )
    captured_query = ""
    captured_candidates: list[RetrievedChunk] = []

    async def fake_rerank(query, candidates, received_settings):
        nonlocal captured_query, captured_candidates
        captured_query = query
        captured_candidates = candidates
        return candidates

    mocker.patch("app.services.retrieval.rerank_chunks", side_effect=fake_rerank)

    result = await retrieve_context_chunks(session, "E-23", device.id, enabled_settings)

    assert captured_query == "translated query"
    assert len(captured_candidates) == 32
    assert len({chunk["id"] for chunk in captured_candidates}) == 32
    assert sum("exact" in chunk["content"] for chunk in captured_candidates) == 3
    assert (
        sum("semantic guide" in chunk["content"] for chunk in captured_candidates) == 14
    )
    assert (
        sum("translated query" in chunk["content"] for chunk in captured_candidates)
        == 15
    )
    assert [chunk["id"] for chunk in result] == [
        chunk["id"] for chunk in captured_candidates[:5]
    ]


async def test_successful_reranking_uses_all_candidates_when_fewer_than_five_exist(
    session, settings, mocker
):
    device, attachment = await _create_retrieval_context(session)
    await _add_chunks(
        session,
        attachment.id,
        [(f"semantic guide {index}", _embedding(1.0)) for index in range(3)],
    )
    enabled_settings = settings.model_copy(
        update={"reranker_enabled": True, "voyage_api_key": "voyage-test-key"}
    )
    mocker.patch("app.services.retrieval.embed_question", return_value=_embedding(1.0))
    mocker.patch(
        "app.services.retrieval.translate_query", return_value="no matching terms"
    )

    async def reverse_ranking(query, candidates, received_settings):
        return list(reversed(candidates))

    mocker.patch("app.services.retrieval.rerank_chunks", side_effect=reverse_ranking)

    result = await retrieve_context_chunks(
        session, "unrelated question", device.id, enabled_settings
    )

    assert len(result) == 3
    assert [chunk["content"] for chunk in result] == [
        "semantic guide 2",
        "semantic guide 1",
        "semantic guide 0",
    ]


async def test_disabled_reranking_keeps_existing_limits_and_does_not_call_provider(
    session, settings, mocker
):
    device, attachment = await _create_retrieval_context(session)
    await _add_chunks(
        session,
        attachment.id,
        [(f"semantic guide {index}", _embedding(1.0)) for index in range(10)],
    )
    mocker.patch("app.services.retrieval.embed_question", return_value=_embedding(1.0))
    mocker.patch(
        "app.services.retrieval.translate_query", return_value="no matching terms"
    )
    rerank = mocker.patch("app.services.retrieval.rerank_chunks")

    result = await retrieve_context_chunks(
        session, "unrelated question", device.id, settings
    )

    assert len(result) == 7
    rerank.assert_not_called()


async def test_reranker_failure_falls_back_to_existing_hybrid_limits(
    session, settings, mocker
):
    device, attachment = await _create_retrieval_context(session)
    rows = await _add_chunks(
        session,
        attachment.id,
        [
            *((f"semantic guide {index}", _embedding(1.0)) for index in range(10)),
            *(
                (
                    (
                        f"translated query procedure {index}"
                        if index < 3
                        else f"procedure notes {index}"
                    ),
                    _embedding(0.0),
                )
                for index in range(10)
            ),
        ],
    )
    enabled_settings = settings.model_copy(
        update={"reranker_enabled": True, "voyage_api_key": "voyage-test-key"}
    )
    mocker.patch("app.services.retrieval.embed_question", return_value=_embedding(1.0))
    mocker.patch(
        "app.services.retrieval.translate_query", return_value="translated query"
    )
    rerank = mocker.patch(
        "app.services.retrieval.rerank_chunks",
        side_effect=RerankerError("provider unavailable"),
    )

    result = await retrieve_context_chunks(
        session, "unrelated question", device.id, enabled_settings
    )

    semantic_rows = rows[:10]
    bm25_rows = rows[10:]
    assert [chunk["id"] for chunk in result] == [
        *(row.id for row in semantic_rows[:7]),
        *(row.id for row in bm25_rows[:3]),
    ]
    rerank.assert_awaited_once()


async def test_diagnostic_mode_bypasses_enabled_reranking(session, settings, mocker):
    device, attachment = await _create_retrieval_context(session)
    await _add_chunks(
        session,
        attachment.id,
        [(f"diagnostic procedure {index}", _embedding(1.0)) for index in range(10)],
    )
    enabled_settings = settings.model_copy(
        update={"reranker_enabled": True, "voyage_api_key": "voyage-test-key"}
    )
    mocker.patch("app.services.retrieval.embed_question", return_value=_embedding(1.0))
    mocker.patch(
        "app.services.retrieval.translate_query", return_value="no matching terms"
    )
    rerank = mocker.patch("app.services.retrieval.rerank_chunks")

    result = await retrieve_context_chunks(
        session,
        "diagnostic question",
        device.id,
        enabled_settings,
        diagnostic_mode_2002=True,
    )

    assert len(result) == 7
    rerank.assert_not_called()


async def test_reranking_preserves_a_matching_technical_code_in_final_context(
    session, settings, mocker
):
    device, attachment = await _create_retrieval_context(session)
    await _add_chunks(
        session,
        attachment.id,
        [
            ("Fault code E-23 primary", _embedding(0.0)),
            ("Fault code E-23 alternate", _embedding(0.0)),
            *(
                (f"unrelated semantic guide {index}", _embedding(1.0))
                for index in range(5)
            ),
        ],
    )
    enabled_settings = settings.model_copy(
        update={"reranker_enabled": True, "voyage_api_key": "voyage-test-key"}
    )
    mocker.patch("app.services.retrieval.embed_question", return_value=_embedding(1.0))
    mocker.patch(
        "app.services.retrieval.translate_query", return_value="translated query"
    )

    async def rank_codes_after_semantic(query, candidates, received_settings):
        return [*candidates[2:], candidates[1], candidates[0]]

    mocker.patch(
        "app.services.retrieval.rerank_chunks", side_effect=rank_codes_after_semantic
    )

    result = await retrieve_context_chunks(
        session, "What is E-23?", device.id, enabled_settings
    )

    assert "E-23" in result[-1]["content"]
    assert result[-1]["content"] == "Fault code E-23 alternate"


async def test_reranking_keeps_code_in_score_order_when_already_in_top_five(
    session, settings, mocker
):
    device, attachment = await _create_retrieval_context(session)
    await _add_chunks(
        session,
        attachment.id,
        [
            ("Fault code E-23 primary", _embedding(0.0)),
            *(
                (f"unrelated semantic guide {index}", _embedding(1.0))
                for index in range(5)
            ),
        ],
    )
    enabled_settings = settings.model_copy(
        update={"reranker_enabled": True, "voyage_api_key": "voyage-test-key"}
    )
    mocker.patch("app.services.retrieval.embed_question", return_value=_embedding(1.0))
    mocker.patch(
        "app.services.retrieval.translate_query", return_value="translated query"
    )
    captured: dict[str, list[RetrievedChunk]] = {}

    async def rank_code_first(query, candidates, received_settings):
        ranked = [candidates[0], *candidates[1:]]
        captured["ranked"] = ranked
        return ranked

    mocker.patch("app.services.retrieval.rerank_chunks", side_effect=rank_code_first)

    result = await retrieve_context_chunks(
        session, "What is E-23?", device.id, enabled_settings
    )

    assert [chunk["id"] for chunk in result] == [
        chunk["id"] for chunk in captured["ranked"][:5]
    ]
