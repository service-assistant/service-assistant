from typing import Any

from app.config import Settings
from sqlalchemy.ext.asyncio import AsyncSession

from . import service
from .embedding import RetrievedChunk

MULTI_QUERY_CHUNK_LIMIT = 7
RECIPROCAL_RANK_CONSTANT = 60


async def retrieve_for_queries(
    session: AsyncSession,
    queries: list[str],
    *,
    device_id: int,
    settings: Settings,
    diagnostic_enabled: bool,
    retrieval_trace: dict[str, Any],
) -> list[RetrievedChunk]:
    if len(queries) == 1:
        query_trace: dict[str, Any] = {}
        selected = await service.retrieve_context_chunks(
            session,
            queries[0],
            device_id=device_id,
            settings=settings,
            diagnostic_mode_enabled=diagnostic_enabled,
            retrieval_trace=query_trace,
        )
        retrieval_trace.update(query_trace)
        retrieval_trace["queries"] = [{"query": queries[0], **query_trace}]
        return selected

    chunks_by_id: dict[int, RetrievedChunk] = {}
    scores: dict[int, float] = {}
    query_traces: list[dict[str, Any]] = []
    reranker_enabled = False
    reranker_statuses: set[str] = set()

    # AsyncSession is not safe for concurrent task use, so expanded queries are
    # intentionally retrieved sequentially until retrieval owns its own sessions.
    for query in queries:
        query_trace = {}
        query_chunks = await service.retrieve_context_chunks(
            session,
            query,
            device_id=device_id,
            settings=settings,
            diagnostic_mode_enabled=diagnostic_enabled,
            retrieval_trace=query_trace,
        )
        query_traces.append({"query": query, **query_trace})
        reranker_enabled = reranker_enabled or bool(
            query_trace.get("reranker_enabled", False)
        )
        reranker_statuses.add(str(query_trace.get("reranker_status", "not_run")))
        for rank, chunk in enumerate(query_chunks, start=1):
            chunk_id = chunk["id"]
            chunks_by_id[chunk_id] = chunk
            scores[chunk_id] = scores.get(chunk_id, 0) + 1 / (
                RECIPROCAL_RANK_CONSTANT + rank
            )

    ranked_ids = sorted(scores, key=scores.__getitem__, reverse=True)
    selected = [
        chunks_by_id[chunk_id] for chunk_id in ranked_ids[:MULTI_QUERY_CHUNK_LIMIT]
    ]
    all_candidates = list(chunks_by_id.values())
    retrieval_trace.update(
        {
            "queries": query_traces,
            "reranker_enabled": reranker_enabled,
            "reranker_status": (
                next(iter(reranker_statuses))
                if len(reranker_statuses) == 1
                else "mixed"
            ),
            "before_reranker": all_candidates,
            "after_reranker": selected,
        }
    )
    return selected
