import json
from types import SimpleNamespace

from app.services.message_router import (
    MessageRoute,
    RoutingHistoryMessage,
    classify_message,
    route_message,
)


def _response(payload: dict):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))]
    )


async def test_should_route_any_explicit_error_code_without_llm_call(mocker, settings):
    openai = mocker.patch("app.services.message_router.AsyncOpenAI")

    decision = await classify_message(
        "Mam błąd 2:004",
        settings,
        recent_messages=[],
    )

    assert decision.route == MessageRoute.start_diagnostic
    assert decision.recognized_problem == "2:004"
    assert decision.diagnostic_message_id is None
    openai.assert_not_called()


async def test_should_route_safety_question_to_standard_chat(mocker, settings):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "route": "standard_query",
                "confidence": 0.98,
                "recognized_problem": None,
                "diagnostic_message_id": None,
            }
        )
    )
    mocker.patch("app.services.message_router.AsyncOpenAI", return_value=mock_client)

    decision = await classify_message(
        "Jak bezpiecznie podnosić urządzenie?",
        settings,
        recent_messages=[
            {
                "id": 10,
                "sender": "assistant",
                "content": "Sprawdź parametry fabryczne.",
                "has_chunks": True,
            }
        ],
    )

    assert decision.route == MessageRoute.standard_query
    call = mock_client.chat.completions.create.call_args.kwargs
    assert "reasoning_effort" not in call
    assert "temperature" not in call
    assert call["response_format"]["type"] == "json_schema"


async def test_should_reconstruct_followup_from_message_history(mocker, settings):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "route": "diagnostic_followup",
                "confidence": 0.95,
                "recognized_problem": "E-23",
                "diagnostic_message_id": 42,
            }
        )
    )
    mocker.patch("app.services.message_router.AsyncOpenAI", return_value=mock_client)
    history: list[RoutingHistoryMessage] = [
        {
            "id": 42,
            "sender": "assistant",
            "content": "Sprawdź ciśnienie.",
            "has_chunks": True,
        }
    ]

    decision = await classify_message(
        "Ciśnienie jest za niskie",
        settings,
        recent_messages=history,
    )

    assert decision.route == MessageRoute.diagnostic_followup
    assert decision.recognized_problem == "E-23"
    assert decision.diagnostic_message_id == 42


async def test_should_reject_followup_with_unknown_message_id(mocker, settings):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "route": "diagnostic_followup",
                "confidence": 0.95,
                "recognized_problem": "E-23",
                "diagnostic_message_id": 999,
            }
        )
    )
    mocker.patch("app.services.message_router.AsyncOpenAI", return_value=mock_client)

    decision = await classify_message(
        "Ciśnienie jest za niskie",
        settings,
        recent_messages=[],
    )

    assert decision.route == MessageRoute.standard_query


async def test_should_start_diagnostic_for_symptom_classified_by_llm(mocker, settings):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "route": "start_diagnostic",
                "confidence": 0.95,
                "recognized_problem": "Widły nie podnoszą się",
                "diagnostic_message_id": None,
            }
        )
    )
    mocker.patch("app.services.message_router.AsyncOpenAI", return_value=mock_client)

    decision = await classify_message(
        "Widły nie chcą się podnieść",
        settings,
        recent_messages=[],
    )

    assert decision.route == MessageRoute.start_diagnostic
    assert decision.recognized_problem == "Widły nie podnoszą się"


async def test_should_fall_back_to_standard_chat_on_provider_error(mocker, settings):
    mocker.patch(
        "app.services.message_router.classify_message",
        new=mocker.AsyncMock(side_effect=RuntimeError("provider unavailable")),
    )

    decision = await route_message(
        "Niejasna wiadomość",
        settings,
        recent_messages=[],
    )

    assert decision.route == MessageRoute.standard_query
    assert decision.confidence == 0
