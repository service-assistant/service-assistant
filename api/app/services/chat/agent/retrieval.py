import logging
from typing import Any

from app.config import Settings
from sqlalchemy.ext.asyncio import AsyncSession

from ..retrieval import reranker, service
from ..retrieval.embedding import RetrievedChunk

MULTI_QUERY_CHUNK_LIMIT = 7
RECIPROCAL_RANK_CONSTANT = 60
AGENT_GLOBAL_RERANK_CANDIDATE_LIMIT = 30
logger = logging.getLogger(__name__)


async def retrieve_for_agent_queries(
    session: AsyncSession,
    queries: list[str],
    *,
    device_id: int,
    settings: Settings,
    retrieval_trace: dict[str, Any],
) -> list[RetrievedChunk]:
    """Fuse agent query retrieval with RRF, then rerank the shared pool once."""
    chunks_by_id: dict[int, RetrievedChunk] = {}
    scores: dict[int, float] = {}
    query_traces: list[dict[str, Any]] = []

    for query in queries:
        query_chunks = await service.retrieve_context_chunks(
            session,
            query,
            device_id=device_id,
            settings=settings,
            diagnostic_mode_enabled=False,
            reranking_enabled_override=False,
        )
        query_traces.append({"query": query, "chunks": query_chunks})
        for rank, chunk in enumerate(query_chunks, start=1):
            chunk_id = chunk["id"]
            chunks_by_id[chunk_id] = chunk
            scores[chunk_id] = scores.get(chunk_id, 0) + 1 / (
                RECIPROCAL_RANK_CONSTANT + rank
            )

    ranked_ids = sorted(scores, key=scores.__getitem__, reverse=True)
    fused_candidates = [
        chunks_by_id[chunk_id]
        for chunk_id in ranked_ids[:AGENT_GLOBAL_RERANK_CANDIDATE_LIMIT]
    ]
    selected = fused_candidates[:MULTI_QUERY_CHUNK_LIMIT]
    global_query = "\n".join(queries)
    reranker_status = "disabled"

    if settings.reranker_enabled and fused_candidates:
        try:
            ranked = await reranker.rerank_chunks(
                global_query, fused_candidates, settings
            )
            candidate_ids = {chunk["id"] for chunk in fused_candidates}
            result_ids = {chunk["id"] for chunk in ranked}
            if len(ranked) != len(fused_candidates) or result_ids != candidate_ids:
                raise ValueError(
                    "Global agent reranker returned an incomplete or duplicate ranking"
                )
            selected = ranked[:MULTI_QUERY_CHUNK_LIMIT]
            reranker_status = "applied"
        except Exception:
            logger.exception(
                "Global agent reranking failed for %d fused candidates; using RRF order",
                len(fused_candidates),
            )
            reranker_status = "fallback"

    retrieval_trace.update(
        {
            "queries": query_traces,
            "fusion_method": "reciprocal_rank_fusion",
            "global_reranker_query": global_query,
            "reranker_enabled": settings.reranker_enabled,
            "reranker_status": reranker_status,
            "before_reranker": fused_candidates,
            "after_reranker": selected,
        }
    )
    return selected
