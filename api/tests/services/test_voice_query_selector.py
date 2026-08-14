import json
from types import SimpleNamespace

from app.services.voice_query_selector import (
    VoiceDecision,
    VoiceQuerySelection,
    select_technician_query,
    selected_text_or_full_transcript,
)


def _response(payload: dict):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))]
    )


async def test_selects_exact_technician_question_with_luna(mocker, settings):
    transcript = "Jak skasować błąd E-23? Podaj mi klucz ze stołu."
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "decision": "accept",
                "selected_text": "Jak skasować błąd E-23?",
                "confidence": 0.93,
            }
        )
    )
    mocker.patch(
        "app.services.voice_query_selector.AsyncOpenAI", return_value=mock_client
    )

    selection = await select_technician_query(transcript, settings)

    assert selection.decision == VoiceDecision.accept
    assert selection.selected_text == "Jak skasować błąd E-23?"
    call = mock_client.chat.completions.create.call_args.kwargs
    assert call["model"] == "gpt-5.6-luna"
    assert "reasoning_effort" not in call
    assert call["messages"][1]["content"] == transcript
    assert call["response_format"]["type"] == "json_schema"


async def test_rejects_text_modified_by_selector(mocker, settings):
    transcript = "Jak skasować błąd E-23?"
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "decision": "accept",
                "selected_text": "Jak skasować błąd E-24?",
                "confidence": 0.99,
            }
        )
    )
    mocker.patch(
        "app.services.voice_query_selector.AsyncOpenAI", return_value=mock_client
    )

    selection = await select_technician_query(transcript, settings)

    assert selection.decision == VoiceDecision.ignore
    assert selection.selected_text == ""


async def test_accepts_best_exact_fragment_even_with_low_confidence(mocker, settings):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(
        return_value=_response(
            {
                "decision": "accept",
                "selected_text": "...błąd dwa",
                "confidence": 0.4,
            }
        )
    )
    mocker.patch(
        "app.services.voice_query_selector.AsyncOpenAI", return_value=mock_client
    )

    selection = await select_technician_query("...błąd dwa", settings)

    assert selection.decision == VoiceDecision.accept
    assert selection.selected_text == "...błąd dwa"


async def test_ignores_empty_transcript(settings):
    selection = await select_technician_query("", settings)

    assert selection.decision == VoiceDecision.ignore
    assert selection.selected_text == ""


def test_uses_full_transcript_when_selector_cannot_choose():
    full_transcript = "Urwany fragment i rozmowa w tle."
    selection = VoiceQuerySelection(
        decision=VoiceDecision.ignore,
        selected_text="",
        confidence=0.2,
    )

    assert (
        selected_text_or_full_transcript(full_transcript, selection) == full_transcript
    )
    assert selected_text_or_full_transcript(full_transcript, None) == full_transcript
