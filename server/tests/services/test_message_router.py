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
        diagnostic_mode_enabled=True,
    )

    assert decision.route == MessageRoute.start_diagnostic
    assert decision.recognized_problem == "2:004"
    assert decision.diagnostic_message_id is None
    openai.assert_not_called()


async def test_should_not_clarify_explicit_error_code_in_standard_mode(
    mocker, settings
):
    openai = mocker.patch("app.services.message_router.AsyncOpenAI")

    decision = await classify_message(
        "Mam błąd 2:002",
        settings,
        recent_messages=[],
        diagnostic_mode_enabled=False,
    )

    assert decision.route == MessageRoute.standard_query
    assert decision.confidence == 1
    assert decision.missing_information == []
    assert decision.clarification_question is None
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
                "clarification_question": None,
                "missing_information": [],
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
        diagnostic_mode_enabled=True,
    )

    assert decision.route == MessageRoute.standard_query
    call = mock_client.chat.completions.create.call_args.kwargs
    assert call["model"] == settings.openai_router_model
    assert call["reasoning_effort"] == "none"
    assert "temperature" not in call
    assert call["response_format"]["type"] == "json_schema"
    assert "Nie działa podnoszenie wideł" in call["messages"][0]["content"]
    assert "nie pytaj ponownie, czego dotyczy problem" in call["messages"][0]["content"]


async def test_should_reconstruct_followup_from_message_history(mocker, settings):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "route": "diagnostic_followup",
                "confidence": 0.95,
                "recognized_problem": "E-23",
                "diagnostic_message_id": 42,
                "clarification_question": None,
                "missing_information": [],
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
        diagnostic_mode_enabled=True,
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
                "clarification_question": None,
                "missing_information": [],
            }
        )
    )
    mocker.patch("app.services.message_router.AsyncOpenAI", return_value=mock_client)

    decision = await classify_message(
        "Ciśnienie jest za niskie",
        settings,
        recent_messages=[],
        diagnostic_mode_enabled=True,
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
                "clarification_question": None,
                "missing_information": [],
            }
        )
    )
    mocker.patch("app.services.message_router.AsyncOpenAI", return_value=mock_client)

    decision = await classify_message(
        "Widły nie chcą się podnieść",
        settings,
        recent_messages=[],
        diagnostic_mode_enabled=True,
    )

    assert decision.route == MessageRoute.start_diagnostic
    assert decision.recognized_problem == "Widły nie podnoszą się"


async def test_standard_mode_schema_does_not_expose_diagnostic_routes(mocker, settings):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "route": "standard_query",
                "confidence": 0.98,
                "clarification_question": None,
                "missing_information": [],
            }
        )
    )
    mocker.patch("app.services.message_router.AsyncOpenAI", return_value=mock_client)

    decision = await classify_message(
        "Jak wymienić filtr?",
        settings,
        recent_messages=[],
        diagnostic_mode_enabled=False,
    )

    assert decision.route == MessageRoute.standard_query
    schema = mock_client.chat.completions.create.call_args.kwargs["response_format"][
        "json_schema"
    ]["schema"]
    assert set(schema["properties"]) == {
        "route",
        "confidence",
        "clarification_question",
        "missing_information",
    }
    route_ref = schema["properties"]["route"]["$ref"].split("/")[-1]
    assert schema["$defs"][route_ref]["enum"] == [
        "standard_query",
        "needs_clarification",
    ]
    prompt = mock_client.chat.completions.create.call_args.kwargs["messages"][0][
        "content"
    ]
    assert "Nie działa podnoszenie wideł" in prompt
    assert "nie pytaj ponownie, czego dotyczy problem" in prompt


async def test_standard_mode_should_return_clarification_question(mocker, settings):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "route": "needs_clarification",
                "confidence": 0.96,
                "clarification_question": (
                    "Co dokładnie nie działa: jazda, podnoszenie czy uruchomienie?"
                ),
                "missing_information": ["subject"],
            }
        )
    )
    mocker.patch("app.services.message_router.AsyncOpenAI", return_value=mock_client)

    decision = await classify_message(
        "Nie działa",
        settings,
        recent_messages=[],
        diagnostic_mode_enabled=False,
    )

    assert decision.route == MessageRoute.needs_clarification
    assert decision.clarification_question == (
        "Co dokładnie nie działa: jazda, podnoszenie czy uruchomienie?"
    )


async def test_should_reject_clarification_when_model_reports_no_missing_information(
    mocker, settings
):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "route": "needs_clarification",
                "confidence": 0.97,
                "clarification_question": (
                    "Czy po uruchomieniu pojawiają się jakiekolwiek oznaki zasilania?"
                ),
                "missing_information": [],
            }
        )
    )
    mocker.patch("app.services.message_router.AsyncOpenAI", return_value=mock_client)

    decision = await classify_message(
        "Wózek nie odpala, nie ma jakiejkolwiek reakcji",
        settings,
        recent_messages=[],
        diagnostic_mode_enabled=False,
    )

    assert decision.route == MessageRoute.standard_query
    assert decision.clarification_question is None


async def test_should_not_clarify_an_explicit_abnormal_noise(mocker, settings):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "route": "needs_clarification",
                "confidence": 0.95,
                "clarification_question": (
                    "Czy wycie pojawia się od razu, czy narasta podczas pracy?"
                ),
                "missing_information": ["manifestation"],
            }
        )
    )
    mocker.patch("app.services.message_router.AsyncOpenAI", return_value=mock_client)

    decision = await classify_message(
        "Pompa hydrauliczna mocno wyje podczas pracy",
        settings,
        recent_messages=[],
        diagnostic_mode_enabled=False,
    )

    assert decision.route == MessageRoute.standard_query
    assert decision.clarification_question is None


async def test_should_start_diagnostic_for_explicit_noise_instead_of_clarifying(
    mocker, settings
):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "route": "needs_clarification",
                "confidence": 0.95,
                "recognized_problem": None,
                "diagnostic_message_id": None,
                "clarification_question": (
                    "Czy wycie pojawia się od razu, czy narasta podczas pracy?"
                ),
                "missing_information": ["manifestation"],
            }
        )
    )
    mocker.patch("app.services.message_router.AsyncOpenAI", return_value=mock_client)

    decision = await classify_message(
        "Pompa hydrauliczna mocno wyje podczas pracy",
        settings,
        recent_messages=[],
        diagnostic_mode_enabled=True,
    )

    assert decision.route == MessageRoute.start_diagnostic
    assert decision.recognized_problem == (
        "Pompa hydrauliczna mocno wyje podczas pracy"
    )


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
