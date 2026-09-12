import asyncio
import logging
import time
from typing import Any

from app.config import Settings
from sqlalchemy.ext.asyncio import AsyncSession

from ..retrieval import embedding, reranker, service
from ..retrieval.embedding import RetrievedChunk
from .initial_evidence import evaluate_initial_evidence

# Agent diagnosis needs enough recall to preserve competing, lower-ranked causes.
# Seven chunks dropped the relevant Click-2-Creep procedure behind generic speed-
# reduction passages for an intentionally ambiguous symptom.
MULTI_QUERY_CHUNK_LIMIT = 12
RECIPROCAL_RANK_CONSTANT = 60
AGENT_GLOBAL_RERANK_CANDIDATE_LIMIT = 30
AGENT_CONTEXT_NEIGHBOR_RADIUS = 2
logger = logging.getLogger(__name__)


def _with_adjacent_context(
    selected: list[RetrievedChunk], corpus: list[RetrievedChunk]
) -> list[RetrievedChunk]:
    """Keep nearby manual sections when retrieval lands on either side of one."""
    expanded = list(selected)
    seen = {chunk["id"] for chunk in expanded}
    by_attachment: dict[int, list[RetrievedChunk]] = {}
    for chunk in corpus:
        by_attachment.setdefault(chunk["attachment_id"], []).append(chunk)
    for chunks in by_attachment.values():
        chunks.sort(key=lambda item: item["id"])

    positions = {
        chunk["id"]: (chunks, index)
        for chunks in by_attachment.values()
        for index, chunk in enumerate(chunks)
    }
    for chunk in selected:
        chunks, index = positions.get(chunk["id"], ([], -1))
        neighbor_indexes = [
            *(index - offset for offset in range(AGENT_CONTEXT_NEIGHBOR_RADIUS, 0, -1)),
            *(index + offset for offset in range(1, AGENT_CONTEXT_NEIGHBOR_RADIUS + 1)),
        ]
        for neighbor_index in neighbor_indexes:
            if not (0 <= neighbor_index < len(chunks)):
                continue
            neighbor = chunks[neighbor_index]
            if neighbor["id"] in seen:
                continue
            expanded.append(neighbor)
            seen.add(neighbor["id"])
    return expanded


async def retrieve_for_agent_queries(
    session: AsyncSession,
    queries: list[str],
    *,
    device_id: int,
    settings: Settings,
    retrieval_trace: dict[str, Any],
) -> list[RetrievedChunk]:
    """Fuse agent query retrieval with RRF, then rerank the shared pool once."""
    retrieval_started_at = time.perf_counter()
    chunks_by_id: dict[int, RetrievedChunk] = {}
    scores: dict[int, float] = {}
    query_traces: list[dict[str, Any]] = []
    timeline: list[dict[str, Any]] = []

    async def fetch_chunks() -> list[RetrievedChunk]:
        started_at = time.perf_counter()
        try:
            return await service.fetch_device_chunks(session, device_id)
        finally:
            finished_at = time.perf_counter()
            timeline.append(
                {
                    "key": "fetch_chunks",
                    "label": "Pobranie chunków (wspólne)",
                    "start_ms": round((started_at - retrieval_started_at) * 1000),
                    "end_ms": round((finished_at - retrieval_started_at) * 1000),
                    "duration_ms": round((finished_at - started_at) * 1000),
                }
            )

    async def embed_query_batch() -> list[list[float]]:
        started_at = time.perf_counter()
        try:
            return await embedding.embed_questions(queries, settings)
        finally:
            finished_at = time.perf_counter()
            timeline.append(
                {
                    "key": "embedding",
                    "label": f"Embedding zapytań (batch ×{len(queries)})",
                    "start_ms": round((started_at - retrieval_started_at) * 1000),
                    "end_ms": round((finished_at - retrieval_started_at) * 1000),
                    "duration_ms": round((finished_at - started_at) * 1000),
                }
            )

    prefetched_chunks, query_embeddings = await asyncio.gather(
        fetch_chunks(), embed_query_batch()
    )

    for query_index, query in enumerate(queries, start=1):
        query_started_at = time.perf_counter()
        query_trace: dict[str, Any] = {}
        query_chunks = await service.retrieve_context_chunks(
            session,
            query,
            device_id=device_id,
            settings=settings,
            diagnostic_mode_enabled=False,
            reranking_enabled_override=False,
            translation_enabled=False,
            prefetched_chunks=prefetched_chunks,
            precomputed_embedding=query_embeddings[query_index - 1],
            retrieval_trace=query_trace,
        )
        query_finished_at = time.perf_counter()
        query_offset_ms = round((query_started_at - retrieval_started_at) * 1000)
        query_timeline = [
            {
                **item,
                "label": f"Q{query_index} · {item.get('label', item.get('key', ''))}",
                "start_ms": query_offset_ms + int(item.get("start_ms", 0)),
                "end_ms": query_offset_ms + int(item.get("end_ms", 0)),
            }
            for item in query_trace.get("timeline", [])
        ]
        timeline.extend(query_timeline)
        query_traces.append(
            {
                "query": query,
                "chunks": query_chunks,
                "duration_ms": round((query_finished_at - query_started_at) * 1000),
                "timeline": query_timeline,
            }
        )
        for rank, chunk in enumerate(query_chunks, start=1):
            chunk_id = chunk["id"]
            chunks_by_id[chunk_id] = chunk
            scores[chunk_id] = scores.get(chunk_id, 0) + 1 / (
                RECIPROCAL_RANK_CONSTANT + rank
            )

    fusion_started_at = time.perf_counter()
    ranked_ids = sorted(scores, key=scores.__getitem__, reverse=True)
    fused_candidates = [
        chunks_by_id[chunk_id]
        for chunk_id in ranked_ids[:AGENT_GLOBAL_RERANK_CANDIDATE_LIMIT]
    ]
    selected = fused_candidates[:MULTI_QUERY_CHUNK_LIMIT]
    global_query = "\n".join(queries)
    reranker_status = "disabled"
    fusion_finished_at = time.perf_counter()
    timeline.append(
        {
            "key": "fusion",
            "label": "Reciprocal Rank Fusion",
            "start_ms": round((fusion_started_at - retrieval_started_at) * 1000),
            "end_ms": round((fusion_finished_at - retrieval_started_at) * 1000),
            "duration_ms": round((fusion_finished_at - fusion_started_at) * 1000),
        }
    )

    if settings.reranker_enabled and fused_candidates:
        reranker_started_at = time.perf_counter()
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
        finally:
            reranker_finished_at = time.perf_counter()
            timeline.append(
                {
                    "key": "reranker",
                    "label": "Globalny reranker",
                    "start_ms": round(
                        (reranker_started_at - retrieval_started_at) * 1000
                    ),
                    "end_ms": round(
                        (reranker_finished_at - retrieval_started_at) * 1000
                    ),
                    "duration_ms": round(
                        (reranker_finished_at - reranker_started_at) * 1000
                    ),
                }
            )

    selected = _with_adjacent_context(selected, prefetched_chunks)

    evidence_gate_started_at = time.perf_counter()
    evidence_gate = evaluate_initial_evidence(
        selected,
        queries=queries,
        query_traces=query_traces,
    )
    gated_chunks = selected if evidence_gate["passed"] else []
    evidence_gate_finished_at = time.perf_counter()
    evidence_gate_duration_ms = round(
        (evidence_gate_finished_at - evidence_gate_started_at) * 1000
    )
    timeline.append(
        {
            "key": "initial_evidence_gate",
            "label": "Initial Evidence Gate",
            "start_ms": round((evidence_gate_started_at - retrieval_started_at) * 1000),
            "end_ms": round((evidence_gate_finished_at - retrieval_started_at) * 1000),
            "duration_ms": evidence_gate_duration_ms,
        }
    )

    retrieval_finished_at = time.perf_counter()

    retrieval_trace.update(
        {
            "queries": query_traces,
            "fusion_method": "reciprocal_rank_fusion",
            "global_reranker_query": global_query,
            "reranker_enabled": settings.reranker_enabled,
            "reranker_status": reranker_status,
            "before_reranker": fused_candidates,
            "after_reranker": selected,
            "initial_evidence_gate": evidence_gate,
            "after_evidence_gate": gated_chunks,
            "initial_evidence_gate_duration_ms": evidence_gate_duration_ms,
            "timeline": timeline,
            "duration_ms": round((retrieval_finished_at - retrieval_started_at) * 1000),
        }
    )
    return gated_chunks
