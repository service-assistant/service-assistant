from app.services.chat.agent.initial_evidence import evaluate_initial_evidence
from app.services.chat.retrieval.embedding import RetrievedChunk


def _chunk(chunk_id: int, score: float | None, content: str = "manual text"):
    chunk: RetrievedChunk = {
        "id": chunk_id,
        "content": content,
        "attachment_id": 1,
        "extra_metadata": None,
    }
    if score is not None:
        chunk["reranker_score"] = score
    return chunk


def _traces(chunks: list[RetrievedChunk], count: int = 3):
    return [{"query": f"query {index}", "chunks": chunks} for index in range(count)]


def test_should_accept_strong_supported_evidence():
    chunks = [_chunk(1, 0.92), _chunk(2, 0.74), _chunk(3, 0.61)]

    result = evaluate_initial_evidence(
        chunks,
        queries=["hydraulic pressure fault"],
        query_traces=_traces(chunks),
    )

    assert result["decision"] == "accept"
    assert result["passed"] is True
    assert result["score"] == 0.8155
    assert result["signals"]["relevant_chunk_count"] == 3


def test_should_reject_weak_evidence_without_identifier_match():
    chunks = [_chunk(1, 0.24), _chunk(2, 0.18)]

    result = evaluate_initial_evidence(
        chunks,
        queries=["hydraulic pressure fault"],
        query_traces=[],
    )

    assert result["decision"] == "reject"
    assert result["passed"] is False


def test_should_keep_identifier_match_in_uncertain_zone():
    chunks = [_chunk(1, 0.20, "Procedure for fault E-23")]

    result = evaluate_initial_evidence(
        chunks,
        queries=["truck reports E-23"],
        query_traces=[],
    )

    assert result["decision"] == "uncertain"
    assert result["passed"] is True
    assert result["signals"]["identifier_match"] is True


def test_should_pass_unscored_evidence_to_downstream_evaluation():
    chunks = [_chunk(1, None)]

    result = evaluate_initial_evidence(
        chunks,
        queries=["fault"],
        query_traces=_traces(chunks, count=1),
    )

    assert result["decision"] == "uncertain"
    assert result["passed"] is True
    assert result["score"] is None


def test_should_reject_empty_evidence():
    result = evaluate_initial_evidence([], queries=["fault"], query_traces=[])

    assert result["decision"] == "reject"
    assert result["passed"] is False
