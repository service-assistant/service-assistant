import re
from typing import Any, Literal, TypedDict

from ..retrieval.embedding import RetrievedChunk

EvidenceDecision = Literal["accept", "reject", "uncertain"]

ACCEPT_THRESHOLD = 0.70
REJECT_TOP_SCORE_THRESHOLD = 0.35
RELEVANT_CHUNK_THRESHOLD = 0.50
STRONG_TOP_SCORE_THRESHOLD = 0.85

TOP_SCORE_WEIGHT = 0.60
TOP_THREE_MEAN_WEIGHT = 0.15
QUERY_SUPPORT_WEIGHT = 0.15
IDENTIFIER_MATCH_WEIGHT = 0.10

TECHNICAL_IDENTIFIER_RE = re.compile(
    r"(?<!\w)(?=[A-Za-z0-9:._/-]*\d)[A-Za-z0-9]+(?:[-:._/][A-Za-z0-9]+)+(?!\w)"
)


class EvidenceGateResult(TypedDict):
    decision: EvidenceDecision
    score: float | None
    reason: str
    passed: bool
    thresholds: dict[str, float]
    weights: dict[str, float]
    signals: dict[str, Any]


def _query_support(
    chunks: list[RetrievedChunk], query_traces: list[dict[str, Any]]
) -> float:
    if not chunks or not query_traces:
        return 0.0
    top_chunk_ids = {chunk["id"] for chunk in chunks[:3]}
    supporting_queries = sum(
        1
        for trace in query_traces
        if any(chunk["id"] in top_chunk_ids for chunk in trace.get("chunks", []))
    )
    return supporting_queries / len(query_traces)


def _has_identifier_match(queries: list[str], chunks: list[RetrievedChunk]) -> bool:
    identifiers = {
        match.group(0).casefold()
        for query in queries
        for match in TECHNICAL_IDENTIFIER_RE.finditer(query)
    }
    return bool(identifiers) and any(
        identifier in chunk["content"].casefold()
        for identifier in identifiers
        for chunk in chunks
    )


def evaluate_initial_evidence(
    chunks: list[RetrievedChunk],
    *,
    queries: list[str],
    query_traces: list[dict[str, Any]],
) -> EvidenceGateResult:
    """Evaluate reranked evidence without another model or network call."""
    thresholds = {
        "accept": ACCEPT_THRESHOLD,
        "reject_top_score": REJECT_TOP_SCORE_THRESHOLD,
        "relevant_chunk": RELEVANT_CHUNK_THRESHOLD,
        "strong_top_score": STRONG_TOP_SCORE_THRESHOLD,
    }
    weights = {
        "top_score": TOP_SCORE_WEIGHT,
        "top_three_mean": TOP_THREE_MEAN_WEIGHT,
        "query_support": QUERY_SUPPORT_WEIGHT,
        "identifier_match": IDENTIFIER_MATCH_WEIGHT,
    }
    if not chunks:
        return {
            "decision": "reject",
            "score": 0.0,
            "reason": "Retrieval nie zwrócił żadnych fragmentów.",
            "passed": False,
            "thresholds": thresholds,
            "weights": weights,
            "signals": {
                "top_score": None,
                "top_three_mean": None,
                "query_support": 0.0,
                "identifier_match": False,
                "relevant_chunk_count": 0,
                "scored_chunk_count": 0,
            },
        }

    scored = [
        float(chunk["reranker_score"]) for chunk in chunks if "reranker_score" in chunk
    ]
    support = _query_support(chunks, query_traces)
    identifier_match = _has_identifier_match(queries, chunks)
    if not scored:
        return {
            "decision": "uncertain",
            "score": None,
            "reason": (
                "Brak score'ów rerankera; evidence przepuszczono do dalszej oceny."
            ),
            "passed": True,
            "thresholds": thresholds,
            "weights": weights,
            "signals": {
                "top_score": None,
                "top_three_mean": None,
                "query_support": round(support, 4),
                "identifier_match": identifier_match,
                "relevant_chunk_count": 0,
                "scored_chunk_count": 0,
            },
        }

    top_score = scored[0]
    top_three_mean = sum(scored[:3]) / len(scored[:3])
    relevant_chunk_count = sum(score >= RELEVANT_CHUNK_THRESHOLD for score in scored)
    score = (
        TOP_SCORE_WEIGHT * top_score
        + TOP_THREE_MEAN_WEIGHT * top_three_mean
        + QUERY_SUPPORT_WEIGHT * support
        + IDENTIFIER_MATCH_WEIGHT * float(identifier_match)
    )

    enough_support = (
        relevant_chunk_count >= 2
        or identifier_match
        or top_score >= STRONG_TOP_SCORE_THRESHOLD
    )
    if score >= ACCEPT_THRESHOLD and enough_support:
        decision: EvidenceDecision = "accept"
        reason = "Silna trafność rerankera i wystarczające wsparcie evidence."
        passed = True
    elif top_score < REJECT_TOP_SCORE_THRESHOLD and not identifier_match:
        decision = "reject"
        reason = (
            "Najlepszy fragment ma niską trafność i brak exact match identyfikatora."
        )
        passed = False
    else:
        decision = "uncertain"
        reason = "Wynik jest w szarej strefie; evidence wymaga dalszej oceny."
        passed = True

    return {
        "decision": decision,
        "score": round(score, 4),
        "reason": reason,
        "passed": passed,
        "thresholds": thresholds,
        "weights": weights,
        "signals": {
            "top_score": round(top_score, 4),
            "top_three_mean": round(top_three_mean, 4),
            "query_support": round(support, 4),
            "identifier_match": identifier_match,
            "relevant_chunk_count": relevant_chunk_count,
            "scored_chunk_count": len(scored),
        },
    }
