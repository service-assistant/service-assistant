from types import SimpleNamespace
from typing import cast

from app.config import Settings
from app.services.chat.agent.retrieval import (
    _with_adjacent_context,
    retrieve_for_agent_queries,
)
from app.services.chat.retrieval import RetrievedChunk, retrieve_for_queries
from app.services.chat.retrieval import service as retrieval_service


async def test_retrieval_trace_should_show_parallel_work_and_dependencies(mocker):
    mocker.patch(
        "app.services.chat.retrieval.service.get_device_document_language",
        return_value="en",
    )
    mocker.patch(
        "app.services.chat.retrieval.service.embed_question",
        new=mocker.AsyncMock(return_value=[0.1, 0.2]),
    )
    mocker.patch(
        "app.services.chat.retrieval.service.translate_query",
        new=mocker.AsyncMock(return_value="translated query"),
    )
    mocker.patch(
        "app.services.chat.retrieval.service._fetch_device_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )
    mocker.patch(
        "app.services.chat.retrieval.service.get_exact_match_chunks", return_value=[]
    )
    mocker.patch(
        "app.services.chat.retrieval.service.get_semantic_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )
    mocker.patch(
        "app.services.chat.retrieval.service.get_bm25_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )
    mocker.patch(
        "app.services.chat.retrieval.service.rerank_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )
    trace = {}
    settings = cast(Settings, SimpleNamespace(reranker_enabled=True))

    await retrieval_service.retrieve_context_chunks(
        mocker.AsyncMock(),
        "polskie pytanie",
        device_id=123,
        settings=settings,
        retrieval_trace=trace,
    )

    timings = {item["key"]: item for item in trace["timeline"]}
    assert set(timings) == {
        "embedding",
        "translation",
        "fetch_chunks",
        "exact_match",
        "semantic_search",
        "bm25",
        "reranker",
    }
    preparation_finished_at = max(
        timings[key]["end_ms"] for key in ("embedding", "translation", "fetch_chunks")
    )
    assert timings["exact_match"]["start_ms"] >= preparation_finished_at
    search_finished_at = max(
        timings[key]["end_ms"] for key in ("exact_match", "semantic_search", "bm25")
    )
    assert timings["reranker"]["start_ms"] >= search_finished_at


async def test_should_fuse_and_deduplicate_multi_query_results(mocker):
    first = [
        {"id": 1, "content": "A", "attachment_id": 1, "extra_metadata": None},
        {"id": 2, "content": "B", "attachment_id": 1, "extra_metadata": None},
    ]
    second = [
        {"id": 2, "content": "B", "attachment_id": 1, "extra_metadata": None},
        {"id": 3, "content": "C", "attachment_id": 1, "extra_metadata": None},
    ]
    retrieve = mocker.patch(
        "app.services.chat.retrieval.queries.service.retrieve_context_chunks",
        new_callable=mocker.AsyncMock,
        side_effect=[first, second],
    )
    trace = {}
    settings = cast(Settings, SimpleNamespace())

    chunks = await retrieve_for_queries(
        mocker.MagicMock(),
        ["query one", "query two"],
        device_id=123,
        settings=settings,
        diagnostic_enabled=False,
        retrieval_trace=trace,
    )

    assert [chunk["id"] for chunk in chunks] == [2, 1, 3]
    assert retrieve.await_count == 2
    assert [query["query"] for query in trace["queries"]] == [
        "query one",
        "query two",
    ]


async def test_agent_queries_should_fuse_before_one_global_rerank(mocker):
    first = [
        {"id": 1, "content": "A", "attachment_id": 1, "extra_metadata": None},
        {"id": 2, "content": "B", "attachment_id": 1, "extra_metadata": None},
    ]
    second = [
        {"id": 2, "content": "B", "attachment_id": 1, "extra_metadata": None},
        {"id": 3, "content": "C", "attachment_id": 1, "extra_metadata": None},
    ]
    prefetched = [*first, second[1]]
    embeddings = [[0.1], [0.2]]
    fetch = mocker.patch(
        "app.services.chat.agent.retrieval.service.fetch_device_chunks",
        new_callable=mocker.AsyncMock,
        return_value=prefetched,
    )
    embed_batch = mocker.patch(
        "app.services.chat.agent.retrieval.embedding.embed_questions",
        new_callable=mocker.AsyncMock,
        return_value=embeddings,
    )
    retrieve = mocker.patch(
        "app.services.chat.agent.retrieval.service.retrieve_context_chunks",
        new_callable=mocker.AsyncMock,
        side_effect=[first, second],
    )
    rerank = mocker.patch(
        "app.services.chat.agent.retrieval.reranker.rerank_chunks",
        new_callable=mocker.AsyncMock,
        return_value=[first[0], second[1], first[1]],
    )
    settings = cast(Settings, SimpleNamespace(reranker_enabled=True))
    trace = {}

    chunks = await retrieve_for_agent_queries(
        mocker.MagicMock(),
        ["query one", "query two"],
        device_id=123,
        settings=settings,
        retrieval_trace=trace,
    )

    assert retrieve.await_count == 2
    fetch.assert_awaited_once_with(mocker.ANY, 123)
    embed_batch.assert_awaited_once_with(["query one", "query two"], settings)
    assert all(
        call.kwargs["reranking_enabled_override"] is False
        for call in retrieve.await_args_list
    )
    assert all(
        call.kwargs["translation_enabled"] is False for call in retrieve.await_args_list
    )
    assert all(
        call.kwargs["prefetched_chunks"] is prefetched
        for call in retrieve.await_args_list
    )
    assert [
        call.kwargs["precomputed_embedding"] for call in retrieve.await_args_list
    ] == embeddings
    assert all("retrieval_trace" in call.kwargs for call in retrieve.await_args_list)
    rerank.assert_awaited_once_with(
        "query one\nquery two",
        [first[1], first[0], second[1]],
        settings,
    )
    assert [chunk["id"] for chunk in chunks] == [1, 3, 2]
    assert trace["fusion_method"] == "reciprocal_rank_fusion"
    assert trace["reranker_status"] == "applied"
    assert [query["query"] for query in trace["queries"]] == [
        "query one",
        "query two",
    ]
    assert {item["key"] for item in trace["timeline"][:2]} == {
        "fetch_chunks",
        "embedding",
    }
    assert trace["timeline"][-3]["key"] == "fusion"
    assert trace["timeline"][-2]["key"] == "reranker"
    assert trace["timeline"][-2]["label"] == "Globalny reranker"
    assert trace["timeline"][-1]["key"] == "initial_evidence_gate"
    assert trace["initial_evidence_gate"]["decision"] == "uncertain"
    assert trace["after_evidence_gate"] == [first[0], second[1], first[1]]


def test_agent_retrieval_should_add_adjacent_manual_context():
    corpus: list[RetrievedChunk] = [
        {
            "id": 9,
            "content": "section two before",
            "attachment_id": 1,
            "extra_metadata": None,
        },
        {
            "id": 10,
            "content": "section before",
            "attachment_id": 1,
            "extra_metadata": None,
        },
        {
            "id": 11,
            "content": "retrieval hit",
            "attachment_id": 1,
            "extra_metadata": None,
        },
        {
            "id": 12,
            "content": "section after",
            "attachment_id": 1,
            "extra_metadata": None,
        },
        {
            "id": 13,
            "content": "section two after",
            "attachment_id": 1,
            "extra_metadata": None,
        },
        {
            "id": 20,
            "content": "different manual",
            "attachment_id": 2,
            "extra_metadata": None,
        },
    ]

    expanded = _with_adjacent_context([corpus[2]], corpus)

    assert [chunk["id"] for chunk in expanded] == [11, 9, 10, 12, 13]


async def test_agent_retrieval_should_skip_translation_but_keep_standard_default(
    mocker,
):
    translate = mocker.patch(
        "app.services.chat.retrieval.service.translate_query",
        new=mocker.AsyncMock(return_value="translated query"),
    )
    embed = mocker.patch(
        "app.services.chat.retrieval.service.embed_question",
        new=mocker.AsyncMock(return_value=[0.1, 0.2]),
    )
    fetch = mocker.patch(
        "app.services.chat.retrieval.service._fetch_device_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )
    mocker.patch(
        "app.services.chat.retrieval.service.get_semantic_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )
    mocker.patch(
        "app.services.chat.retrieval.service.get_bm25_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )
    settings = cast(Settings, SimpleNamespace(reranker_enabled=False))
    agent_trace = {}

    await retrieval_service.retrieve_context_chunks(
        mocker.AsyncMock(),
        "already English query",
        device_id=123,
        settings=settings,
        retrieval_trace=agent_trace,
        translation_enabled=False,
        prefetched_chunks=[],
        precomputed_embedding=[0.3, 0.4],
    )

    translate.assert_not_awaited()
    fetch.assert_not_awaited()
    embed.assert_not_awaited()
    assert agent_trace["translated_query"] == "already English query"
    agent_timing_keys = {item["key"] for item in agent_trace["timeline"]}
    assert "translation" not in agent_timing_keys
    assert "fetch_chunks" not in agent_timing_keys
    assert "embedding" not in agent_timing_keys

    await retrieval_service.retrieve_context_chunks(
        mocker.AsyncMock(),
        "polskie pytanie",
        device_id=123,
        settings=settings,
    )

    translate.assert_awaited_once()
    fetch.assert_awaited_once()
    embed.assert_awaited_once()
