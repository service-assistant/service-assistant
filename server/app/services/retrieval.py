import asyncio
import re
from functools import partial

from rank_bm25 import BM25Okapi
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings
from ..models import AttachmentDevice, Chunk
from .embedding import RetrievedChunk, embed_question

TOKEN_RE = re.compile(r"[A-Za-z0-9]+(?:[:.-][A-Za-z0-9]+)*")
ERROR_CODE_RE = re.compile(r"\b\d+[:.]\d+\b|\b\d{3,}\b")

SEMANTIC_LIMIT = 7
BM25_LIMIT = 3


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

    code_match = ERROR_CODE_RE.search(question)
    if code_match:
        code = code_match.group(0)
        variants = _identifier_variants(code)
        exact = [
            r for r in rows if any(v.lower() in r["content"].lower() for v in variants)
        ]
        if exact:
            return exact[:limit]

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
    semantic: list[RetrievedChunk],
    bm25: list[RetrievedChunk],
) -> list[RetrievedChunk]:
    seen: set[int] = set()
    merged: list[RetrievedChunk] = []
    for chunk in semantic:
        cid = chunk["id"]
        if cid not in seen:
            merged.append(chunk)
            seen.add(cid)
    for chunk in bm25:
        cid = chunk["id"]
        if cid not in seen:
            merged.append(chunk)
            seen.add(cid)
    return merged


async def retrieve_context_chunks(
    session: AsyncSession,
    question: str,
    device_id: int,
    settings: Settings,
) -> list[RetrievedChunk]:
    vector = await embed_question(question, settings)

    device_rows = await _fetch_device_chunks(session, device_id)

    semantic, bm25 = await asyncio.gather(
        get_semantic_chunks(session, vector, device_id),
        get_bm25_chunks(session, question, device_id, rows=device_rows),
    )
    return merge_hybrid_chunks(semantic, bm25)
