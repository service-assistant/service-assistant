from app.services.chat.pipeline import _retrieve_for_queries


async def test_should_fuse_and_deduplicate_multi_query_results(mocker, settings):
    first = [
        {"id": 1, "content": "A", "attachment_id": 1, "extra_metadata": None},
        {"id": 2, "content": "B", "attachment_id": 1, "extra_metadata": None},
    ]
    second = [
        {"id": 2, "content": "B", "attachment_id": 1, "extra_metadata": None},
        {"id": 3, "content": "C", "attachment_id": 1, "extra_metadata": None},
    ]
    retrieve = mocker.patch(
        "app.services.chat.pipeline.retrieval.retrieve_context_chunks",
        new_callable=mocker.AsyncMock,
        side_effect=[first, second],
    )
    trace = {}

    chunks = await _retrieve_for_queries(
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
