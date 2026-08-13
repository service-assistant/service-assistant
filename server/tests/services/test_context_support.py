import json
from types import SimpleNamespace

from app.services.context_support import (
    ContextSupport,
    classify_context_support,
    decide_from_reranker_scores,
    evaluate_context_support,
)


def _response(payload: dict):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))]
    )


def _chunk(chunk_id: int, content: str):
    return {
        "id": chunk_id,
        "content": content,
        "attachment_id": 1,
        "extra_metadata": {"section": "Test operation"},
    }


async def test_should_classify_pump_noise_context_as_related_only(mocker, settings):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "support": "related_only",
                "direct_chunk_ids": [],
            }
        )
    )
    mocker.patch("app.services.context_support.AsyncOpenAI", return_value=mock_client)
    chunks = [
        _chunk(1, "Contaminated hydraulic fluid may cause pump malfunctions."),
        _chunk(2, "Perform test operation after installing the pump."),
    ]

    decision = await classify_context_support(
        "Pompa hydrauliczna mocno wyje podczas pracy.", chunks, settings
    )

    assert decision.support == ContextSupport.related_only
    assert decision.direct_chunk_ids == []
    request = mock_client.chat.completions.create.call_args.kwargs
    assert request["model"] == settings.openai_context_support_model
    assert request["reasoning_effort"] == "none"
    prompt = request["messages"][0]["content"]
    assert "testu pompy po" in prompt
    assert "głośne wycie pompy" in prompt


async def test_should_keep_only_valid_direct_chunk_ids(mocker, settings):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "support": "direct_support",
                "direct_chunk_ids": [2, 2],
            }
        )
    )
    mocker.patch("app.services.context_support.AsyncOpenAI", return_value=mock_client)

    decision = await classify_context_support(
        "Pompa wydaje metaliczny hałas.",
        [
            _chunk(1, "General pump installation."),
            _chunk(2, "Metallic pump noise indicates bearing damage."),
        ],
        settings,
    )

    assert decision.support == ContextSupport.direct_support
    assert decision.direct_chunk_ids == [2]


async def test_should_fail_closed_when_support_provider_fails(mocker, settings):
    mocker.patch(
        "app.services.context_support.classify_context_support",
        new=mocker.AsyncMock(side_effect=RuntimeError("provider unavailable")),
    )

    decision = await evaluate_context_support(
        "Pytanie",
        [_chunk(1, "Potentially related text")],
        settings,
    )

    assert decision.support == ContextSupport.no_support
    assert decision.direct_chunk_ids == []


def test_should_accept_high_reranker_score_without_support_llm(settings):
    chunks = [
        {**_chunk(1, "Direct procedure"), "reranker_score": 0.91},
        {**_chunk(2, "Weak candidate"), "reranker_score": 0.42},
    ]

    decision = decide_from_reranker_scores(chunks, settings)

    assert decision is not None
    assert decision.support == ContextSupport.direct_support
    assert decision.direct_chunk_ids == [1]


def test_should_reject_low_reranker_scores_without_support_llm(settings):
    chunks = [
        {**_chunk(1, "Weak candidate"), "reranker_score": 0.21},
        {**_chunk(2, "Unrelated candidate"), "reranker_score": 0.08},
    ]

    decision = decide_from_reranker_scores(chunks, settings)

    assert decision is not None
    assert decision.support == ContextSupport.no_support
    assert decision.direct_chunk_ids == []


def test_should_defer_medium_or_unscored_results_to_support_llm(settings):
    medium = [{**_chunk(1, "Uncertain candidate"), "reranker_score": 0.55}]

    assert decide_from_reranker_scores(medium, settings) is None
    assert decide_from_reranker_scores([_chunk(2, "Fallback candidate")], settings) is None
