import asyncio
import logging
import time
import re
from functools import partial
from typing import Any

from rank_bm25 import BM25Okapi
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import AttachmentDevice, Chunk

from .document_language import get_device_document_language
from .embedding import RetrievedChunk, embed_question
from .reranker import rerank_chunks
from .translation import translate_query

TOKEN_RE = re.compile(r"[^\W_]+(?:[-:.][^\W_]+)*")
TECHNICAL_CODE_RE = re.compile(r"[A-Za-z0-9]+(?:[-:._/][A-Za-z0-9]+)*")

SEMANTIC_LIMIT = 7
BM25_LIMIT = 3
EXACT_LIMIT = 3
RERANKED_SEMANTIC_LIMIT = 15
RERANKED_BM25_LIMIT = 15

logger = logging.getLogger(__name__)


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in TOKEN_RE.findall(text)]


def _identifier_variants(code: str) -> list[str]:
    m = re.match(r"^(\d+)[:.](\d+)$", code)
    if m:
        a, b = m.group(1), m.group(2)
        return list({code, f"{a}:{b}", f"{a}.{b}", a + b})
    if re.match(r"^\d{2,}$", code):
        variants = {code}
        for i in range(1, len(code)):
            a, b = code[:i], code[i:]
            variants.add(f"{a}:{b}")
            variants.add(f"{a}.{b}")
        return list(variants)
    return [code]


async def _fetch_device_chunks(
    session: AsyncSession, device_id: int
) -> list[RetrievedChunk]:
    result = await session.scalars(
        select(Chunk)
        .join(
            AttachmentDevice,
            AttachmentDevice.attachment_id == Chunk.attachment_id,
        )
        .where(AttachmentDevice.device_id == device_id)
    )
    return [
        {
            "id": c.id,
            "content": c.content,
            "attachment_id": c.attachment_id,
            "extra_metadata": c.extra_metadata,
        }
        for c in result.all()
        if c.id is not None
    ]


async def fetch_device_chunks(
    session: AsyncSession, device_id: int
) -> list[RetrievedChunk]:
    """Fetch the reusable lexical-search corpus for one device."""
    return await _fetch_device_chunks(session, device_id)


async def get_semantic_chunks(
    session: AsyncSession,
    embedded_vector: list[float],
    device_id: int,
    *,
    limit: int = SEMANTIC_LIMIT,
) -> list[RetrievedChunk]:
    result = await session.scalars(
        select(Chunk)
        .join(
            AttachmentDevice,
            AttachmentDevice.attachment_id == Chunk.attachment_id,
        )
        .where(AttachmentDevice.device_id == device_id)
        .order_by(Chunk.embedding.op("<->")(embedded_vector))
        .limit(limit)
    )
    return [
        {
            "id": c.id,
            "content": c.content,
            "attachment_id": c.attachment_id,
            "extra_metadata": c.extra_metadata,
        }
        for c in result.all()
        if c.id is not None
    ]


def _content_matches_token(content_lower: str, token: str) -> bool:
    if token.lower() in content_lower:
        return True
    return any(
        variant.lower() in content_lower for variant in _identifier_variants(token)
    )


def get_exact_match_chunks(
    rows: list[RetrievedChunk],
    question: str,
    *,
    limit: int = EXACT_LIMIT,
) -> list[RetrievedChunk]:
    """Return chunks that contain query tokens (or code variants).

    Rows are ranked by the number of matched tokens and returned up to
    ``limit``. This keeps the stage useful even when only a subset of the
    query (e.g. a technical code) matches the English documentation.
    """
    query_tokens = tokenize(question)
    if not query_tokens:
        return []

    scored: list[tuple[int, RetrievedChunk]] = []
    for row in rows:
        content_lower = row["content"].lower()
        score = sum(
            1 for token in query_tokens if _content_matches_token(content_lower, token)
        )
        if score:
            scored.append((score, row))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [row for _, row in scored[:limit]]


def _score_bm25(corpus_tokens: list[list[str]], query_tokens: list[str]) -> list[float]:
    if not corpus_tokens or not query_tokens:
        return [0.0] * len(corpus_tokens)
    bm25 = BM25Okapi(corpus_tokens)
    return bm25.get_scores(query_tokens).tolist()


async def get_bm25_chunks(
    session: AsyncSession,
    question: str,
    device_id: int,
    *,
    limit: int = BM25_LIMIT,
    rows: list[RetrievedChunk] | None = None,
) -> list[RetrievedChunk]:
    if rows is None:
        rows = await _fetch_device_chunks(session, device_id)
    if not rows:
        return []

    corpus_tokens = [tokenize(r["content"]) for r in rows]
    query_tokens = tokenize(question)

    loop = asyncio.get_running_loop()
    scores = await loop.run_in_executor(
        None,
        partial(_score_bm25, corpus_tokens, query_tokens),
    )

    ranked = sorted(
        range(len(scores)),
        key=lambda i: scores[i],
        reverse=True,
    )
    out: list[RetrievedChunk] = []
    for i in ranked:
        if scores[i] <= 0:
            break
        out.append(rows[i])
        if len(out) >= limit:
            break
    return out


def merge_hybrid_chunks(
    *lists: list[RetrievedChunk],
) -> list[RetrievedChunk]:
    seen: set[int] = set()
    merged: list[RetrievedChunk] = []
    for chunk_list in lists:
        for chunk in chunk_list:
            cid = chunk["id"]
            if cid not in seen:
                merged.append(chunk)
                seen.add(cid)
    return merged


def _matching_technical_code_chunks(
    question: str, chunks: list[RetrievedChunk]
) -> list[RetrievedChunk]:
    codes = [
        token
        for token in TECHNICAL_CODE_RE.findall(question)
        if any(character.isdigit() for character in token)
        and "/" not in token
        and "_" not in token
    ]
    if not codes:
        return []
    return [
        chunk
        for chunk in chunks
        if any(_content_matches_token(chunk["content"].lower(), code) for code in codes)
    ]


def _select_reranked_chunks(
    question: str,
    ranked_chunks: list[RetrievedChunk],
    candidate_chunks: list[RetrievedChunk],
) -> list[RetrievedChunk]:
    selected = ranked_chunks[:5]
    if len(selected) < 5:
        return selected

    matching_chunks = _matching_technical_code_chunks(question, candidate_chunks)
    if not matching_chunks:
        return selected
    if any(
        chunk["id"] in {selected_chunk["id"] for selected_chunk in selected}
        for chunk in matching_chunks
    ):
        return selected

    highest_ranked_match = next(
        chunk
        for chunk in ranked_chunks
        if chunk["id"] in {matching_chunk["id"] for matching_chunk in matching_chunks}
    )
    selected[-1] = highest_ranked_match
    return selected


async def retrieve_context_chunks(
    session: AsyncSession,
    question: str,
    device_id: int,
    settings: Settings,
    *,
    diagnostic_mode_enabled: bool = False,
    retrieval_trace: dict[str, Any] | None = None,
    reranking_enabled_override: bool | None = None,
    translation_enabled: bool = True,
    prefetched_chunks: list[RetrievedChunk] | None = None,
    precomputed_embedding: list[float] | None = None,
) -> list[RetrievedChunk]:
    retrieval_started_at = time.perf_counter()
    timeline: list[dict[str, Any]] = []

    def record_timing(key: str, label: str, started_at: float) -> int:
        finished_at = time.perf_counter()
        duration_ms = round((finished_at - started_at) * 1000)
        timeline.append(
            {
                "key": key,
                "label": label,
                "start_ms": round((started_at - retrieval_started_at) * 1000),
                "end_ms": round((finished_at - retrieval_started_at) * 1000),
                "duration_ms": duration_ms,
            }
        )
        return duration_ms

    if retrieval_trace is not None:
        retrieval_trace["timeline"] = timeline

    target_language = get_device_document_language(device_id)
    reranking_enabled = (
        reranking_enabled_override
        if reranking_enabled_override is not None
        else settings.reranker_enabled and not diagnostic_mode_enabled
    )
    semantic_limit = RERANKED_SEMANTIC_LIMIT if reranking_enabled else SEMANTIC_LIMIT
    bm25_limit = RERANKED_BM25_LIMIT if reranking_enabled else BM25_LIMIT

    async def embed_with_timing() -> list[float]:
        if precomputed_embedding is not None:
            return precomputed_embedding

        started_at = time.perf_counter()
        try:
            return await embed_question(question, settings)
        finally:
            record_timing("embedding", "Embedding zapytania", started_at)

    async def translate_with_timing() -> tuple[str, int]:
        if not translation_enabled:
            return question, 0

        started_at = time.perf_counter()
        try:
            translated = await translate_query(
                question,
                settings,
                target_language=target_language,
            )
            return translated, record_timing(
                "translation", "Tłumaczenie zapytania", started_at
            )
        except BaseException:
            record_timing("translation", "Tłumaczenie zapytania", started_at)
            raise

    async def fetch_with_timing() -> list[RetrievedChunk]:
        if prefetched_chunks is not None:
            return prefetched_chunks

        started_at = time.perf_counter()
        try:
            return await _fetch_device_chunks(session, device_id)
        finally:
            record_timing("fetch_chunks", "Pobranie chunków", started_at)

    (vector, (translated_query, translation_duration_ms)), rows = await asyncio.gather(
        asyncio.gather(
            embed_with_timing(),
            translate_with_timing(),
        ),
        fetch_with_timing(),
    )
    if retrieval_trace is not None:
        retrieval_trace.update(
            {
                "translation_duration_ms": translation_duration_ms,
                "translated_query": translated_query,
            }
        )

    exact_started_at = time.perf_counter()
    exact = get_exact_match_chunks(rows, question, limit=EXACT_LIMIT)
    record_timing("exact_match", "Exact match", exact_started_at)

    async def semantic_with_timing() -> list[RetrievedChunk]:
        started_at = time.perf_counter()
        try:
            return await get_semantic_chunks(
                session, vector, device_id, limit=semantic_limit
            )
        finally:
            record_timing("semantic_search", "Semantic search", started_at)

    async def bm25_with_timing() -> list[RetrievedChunk]:
        started_at = time.perf_counter()
        try:
            return await get_bm25_chunks(
                session,
                translated_query,
                device_id,
                rows=rows,
                limit=bm25_limit,
            )
        finally:
            record_timing("bm25", "BM25", started_at)

    semantic, bm25 = await asyncio.gather(
        semantic_with_timing(),
        bm25_with_timing(),
    )

    if not reranking_enabled:
        selected = merge_hybrid_chunks(exact, semantic, bm25)
        if retrieval_trace is not None:
            retrieval_trace.update(
                {
                    "reranker_enabled": False,
                    "reranker_status": "disabled",
                    "before_reranker": selected,
                    "after_reranker": selected,
                }
            )
        return selected

    candidates = merge_hybrid_chunks(exact, semantic, bm25)
    if retrieval_trace is not None:
        retrieval_trace.update(
            {
                "reranker_enabled": True,
                "reranker_status": "running",
                "before_reranker": candidates,
            }
        )
    try:
        reranker_started_at = time.perf_counter()
        try:
            ranked = await rerank_chunks(translated_query, candidates, settings)
        finally:
            record_timing("reranker", "Reranker", reranker_started_at)
        candidate_ids = {chunk["id"] for chunk in candidates}
        ranked_ids = {chunk["id"] for chunk in ranked}
        if len(ranked) != len(candidates) or ranked_ids != candidate_ids:
            raise ValueError("Reranker returned an incomplete or duplicate ranking")
    except Exception:
        logger.exception(
            "Voyage reranking failed for %d candidates; using hybrid fallback",
            len(candidates),
        )
        selected = merge_hybrid_chunks(
            exact,
            semantic[:SEMANTIC_LIMIT],
            bm25[:BM25_LIMIT],
        )
        if retrieval_trace is not None:
            retrieval_trace.update(
                {
                    "reranker_status": "fallback",
                    "after_reranker": selected,
                }
            )
        return selected

    selected = _select_reranked_chunks(question, ranked, candidates)
    if retrieval_trace is not None:
        retrieval_trace.update(
            {
                "reranker_status": "applied",
                "after_reranker": selected,
            }
        )
    return selected
