import asyncio
import logging
import math
from typing import Final

import httpx

from ..config import Settings
from .embedding import RetrievedChunk

VOYAGE_RERANK_URL: Final[str] = "https://api.voyageai.com/v1/rerank"
MAX_RETRIES: Final[int] = 2
RETRY_BASE_DELAY_SECONDS: Final[float] = 0.25

logger = logging.getLogger(__name__)


class RerankerError(Exception):
    """Raised when the reranker cannot return a valid complete ranking."""


class RetryableRerankerError(RerankerError):
    """Raised for temporary provider failures that are safe to retry."""


def _parse_ranking(payload: object, candidate_count: int) -> list[tuple[int, float]]:
    if not isinstance(payload, dict):
        raise RerankerError("Voyage response must be a JSON object")

    results = payload.get("data")
    if not isinstance(results, list) or len(results) != candidate_count:
        raise RerankerError("Voyage response does not contain a complete ranking")

    ranking: list[tuple[int, float]] = []
    for result in results:
        if not isinstance(result, dict):
            raise RerankerError("Voyage ranking item must be an object")

        index = result.get("index")
        score = result.get("relevance_score")
        if (
            isinstance(index, bool)
            or not isinstance(index, int)
            or not 0 <= index < candidate_count
            or index in {item[0] for item in ranking}
        ):
            raise RerankerError("Voyage returned an invalid or duplicate index")
        if (
            isinstance(score, bool)
            or not isinstance(score, (int, float))
            or not math.isfinite(float(score))
        ):
            raise RerankerError("Voyage returned an invalid relevance score")
        ranking.append((index, float(score)))

    return ranking


async def rerank_chunks(
    query: str,
    chunks: list[RetrievedChunk],
    settings: Settings,
) -> list[RetrievedChunk]:
    """Return chunks in Voyage's ranking order.

    The provider boundary owns transport and response validation. Callers can
    treat ``RerankerError`` as an optional-feature failure and use retrieval
    fallback behavior.
    """
    if not chunks:
        return []
    if not settings.voyage_api_key:
        raise RerankerError("Voyage API key is not configured")

    payload = {
        "model": settings.reranker_model,
        "query": query,
        "documents": [chunk["content"] for chunk in chunks],
        "top_k": len(chunks),
    }
    headers = {
        "Authorization": f"Bearer {settings.voyage_api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=settings.reranker_timeout_seconds) as client:
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = await client.post(
                    VOYAGE_RERANK_URL,
                    headers=headers,
                    json=payload,
                )
                if response.status_code == 429 or response.status_code >= 500:
                    raise RetryableRerankerError(
                        f"Voyage returned HTTP {response.status_code}"
                    )
                if not 200 <= response.status_code < 300:
                    raise RerankerError(f"Voyage returned HTTP {response.status_code}")
                try:
                    ranking = _parse_ranking(response.json(), len(chunks))
                except RerankerError:
                    raise
                except Exception as exc:
                    raise RerankerError(
                        "Voyage returned an invalid JSON response"
                    ) from exc
                return [
                    {**chunks[index], "reranker_score": score}
                    for index, score in ranking
                ]
            except (httpx.TransportError, RetryableRerankerError) as exc:
                if attempt >= MAX_RETRIES:
                    raise RerankerError(
                        f"Voyage reranking failed after {attempt + 1} attempts"
                    ) from exc

                delay = RETRY_BASE_DELAY_SECONDS * (2**attempt)
                logger.warning(
                    "Temporary Voyage reranking failure; retrying in %.2fs "
                    "(attempt %d/%d): %s",
                    delay,
                    attempt + 1,
                    MAX_RETRIES + 1,
                    exc,
                )
                await asyncio.sleep(delay)

    raise RerankerError("Voyage reranking completed without a ranking")
