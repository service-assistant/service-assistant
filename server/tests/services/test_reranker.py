import httpx
import pytest

from app.services.embedding import RetrievedChunk
from app.services.reranker import RerankerError, rerank_chunks


def _chunk(chunk_id: int, content: str) -> RetrievedChunk:
    return {
        "id": chunk_id,
        "content": content,
        "attachment_id": 10,
        "extra_metadata": {"page": chunk_id},
    }


async def test_reranker_sends_translated_query_and_content_only_documents(
    settings, mocker
):
    chunks = [_chunk(1, "first"), _chunk(2, "second"), _chunk(3, "third")]
    settings = settings.model_copy(update={"voyage_api_key": "voyage-test-key"})
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "data": [
                    {"index": 2, "relevance_score": 0.9},
                    {"index": 0, "relevance_score": 0.8},
                    {"index": 1, "relevance_score": 0.7},
                ]
            }

    class FakeAsyncClient:
        def __init__(self, *, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, url, *, headers, json):
            captured.update(url=url, headers=headers, json=json)
            return FakeResponse()

    mocker.patch("app.services.reranker.httpx.AsyncClient", FakeAsyncClient)

    result = await rerank_chunks("przetłumaczone pytanie", chunks, settings)

    assert [chunk["id"] for chunk in result] == [3, 1, 2]
    assert captured == {
        "timeout": 1.5,
        "url": "https://api.voyageai.com/v1/rerank",
        "headers": {
            "Authorization": "Bearer voyage-test-key",
            "Content-Type": "application/json",
        },
        "json": {
            "model": "rerank-2.5",
            "query": "przetłumaczone pytanie",
            "documents": ["first", "second", "third"],
            "top_k": 3,
        },
    }


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"data": "not-a-list"},
        {"data": [{"index": 0, "relevance_score": 0.9}]},
        {
            "data": [
                {"index": 0, "relevance_score": 0.9},
                {"index": 0, "relevance_score": 0.8},
            ]
        },
        {
            "data": [
                {"index": 0, "relevance_score": 0.9},
                {"index": 2, "relevance_score": 0.8},
            ]
        },
        {
            "data": [
                {"index": 0, "relevance_score": 0.9},
                {"index": 1},
            ]
        },
    ],
)
async def test_reranker_rejects_invalid_or_incomplete_responses(
    settings, mocker, payload
):
    chunks = [_chunk(1, "first"), _chunk(2, "second")]
    settings = settings.model_copy(update={"voyage_api_key": "voyage-test-key"})

    class FakeResponse:
        status_code = 200

        def json(self):
            return payload

    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse()

    mocker.patch("app.services.reranker.httpx.AsyncClient", FakeAsyncClient)

    with pytest.raises(RerankerError):
        await rerank_chunks("query", chunks, settings)


async def test_reranker_converts_http_and_connection_failures_to_reranker_errors(
    settings, mocker
):
    settings = settings.model_copy(update={"voyage_api_key": "voyage-test-key"})

    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, *args, **kwargs):
            raise httpx.ReadTimeout("provider timeout")

    mocker.patch("app.services.reranker.httpx.AsyncClient", FakeAsyncClient)

    with pytest.raises(RerankerError):
        await rerank_chunks("query", [_chunk(1, "first")], settings)


async def test_reranker_rejects_non_success_http_status(settings, mocker):
    settings = settings.model_copy(update={"voyage_api_key": "voyage-test-key"})

    class FakeResponse:
        status_code = 503

    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse()

    mocker.patch("app.services.reranker.httpx.AsyncClient", FakeAsyncClient)

    with pytest.raises(RerankerError):
        await rerank_chunks("query", [_chunk(1, "first")], settings)
