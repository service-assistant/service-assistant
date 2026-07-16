import pytest

from app.services.llm import (
    _build_context,
    _messages,
    stream_query,
)
from app.services.next_best_step import DiagnosticPlan, DiagnosticPlanStatus


def test_should_show_only_first_next_best_step_to_technician():
    messages = _messages(
        "Mam błąd 2:002",
        "Dokumentacja",
        [],
        DiagnosticPlan(
            status=DiagnosticPlanStatus.actions,
            problem="2:002",
        ),
    )

    prompt = messages[-1].get("content")
    assert isinstance(prompt, str)
    assert "WYŁĄCZNIE pierwszą akcję" in prompt
    assert "Nie dodawaj sekcji ::next" in prompt
    assert "Nie pokazuj pełnej kolejności diagnostyki" in prompt
    assert "Nie nazywaj ani nie opisuj żadnej przyszłej akcji" in prompt
    assert "Nie dodawaj wstępu, nagłówka" in prompt
    assert "Zacznij odpowiedź bezpośrednio od sekcji ::checklist" in prompt
    assert "Nie proś o opis obserwacji, wartość, jednostkę" in prompt
    assert "expected_information" not in prompt
    assert '"status": "actions"' in prompt


@pytest.fixture
def mock_llm_session(mocker):
    session = mocker.AsyncMock()
    mock_result = mocker.MagicMock()
    mock_result.all.return_value = []
    session.scalars.return_value = mock_result
    return session


def test_should_build_context_with_numbered_fragments():
    result = _build_context(["First chunk content", "Second chunk content"])

    assert "[Fragment 1]" in result
    assert "First chunk content" in result
    assert "[Fragment 2]" in result
    assert "Second chunk content" in result


def test_should_return_no_context_message_when_chunks_empty():
    result = _build_context([])

    assert result == "No relevant context found."


def test_should_return_no_context_message_when_all_chunks_are_whitespace():
    result = _build_context(["   ", "\n", ""])

    assert result == "No relevant context found."


def test_should_skip_empty_and_whitespace_chunks():
    result = _build_context(["", "  ", "real content here"])

    assert result.count("[Fragment") == 1
    assert "real content here" in result


def test_should_stop_adding_chunks_when_max_chars_exceeded():
    long_chunk = "x" * 5000
    result = _build_context([long_chunk, long_chunk, long_chunk], max_chars=6000)

    assert result.count("[Fragment") == 1


def test_should_include_all_chunks_when_within_max_chars():
    result = _build_context(["short", "also short"], max_chars=500)

    assert result.count("[Fragment") == 2


def make_stream_mock(mocker, deltas: list[str | None]):
    async def _aiter():
        for content in deltas:
            event = mocker.MagicMock()
            event.choices[0].delta.content = content
            yield event

    mock_stream = _aiter()
    return mocker.AsyncMock(return_value=mock_stream)


async def test_should_return_llm_response_content(mock_llm_session, mocker, settings):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = make_stream_mock(
        mocker, ["Odpowiedź", " asystenta"]
    )

    mocker.patch("app.services.llm.AsyncOpenAI", return_value=mock_client)
    chunks = [
        chunk
        async for chunk in stream_query(
            mock_llm_session,
            1,
            "What is error E-23?",
            ["Fault E-23 means..."],
            settings,
        )
    ]

    assert "".join(chunks) == "Odpowiedź asystenta"
    mock_client.chat.completions.create.assert_called_once()


async def test_should_skip_none_delta_chunks(mock_llm_session, mocker, settings):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = make_stream_mock(
        mocker, [None, "real content", None]
    )

    mocker.patch("app.services.llm.AsyncOpenAI", return_value=mock_client)
    chunks = [
        chunk
        async for chunk in stream_query(
            mock_llm_session, 1, "test question", [], settings
        )
    ]

    assert chunks == ["real content"]


async def test_should_pass_question_and_context_to_llm(
    mock_llm_session, mocker, settings
):
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = make_stream_mock(mocker, ["Answer"])

    mocker.patch("app.services.llm.AsyncOpenAI", return_value=mock_client)
    async for _ in stream_query(
        mock_llm_session, 1, "My question", ["context chunk"], settings
    ):
        pass

    call_kwargs = mock_client.chat.completions.create.call_args.kwargs
    messages = call_kwargs["messages"]
    user_message = messages[-1]["content"]
    assert "My question" in user_message
    assert "context chunk" in user_message
