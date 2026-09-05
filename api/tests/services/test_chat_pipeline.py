from types import SimpleNamespace
from typing import cast

from app.config import Settings
from app.services.chat.agent.retrieval import retrieve_for_agent_queries
from app.services.chat.retrieval import retrieve_for_queries


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
    assert all(
        call.kwargs["reranking_enabled_override"] is False
        for call in retrieve.await_args_list
    )
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
