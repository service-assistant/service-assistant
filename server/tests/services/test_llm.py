import pytest

from app.services.llm import (
    _build_context,
    _messages,
    clean_completion_notice,
    continuation_target,
    ensure_continuation_intro,
    has_continuation_marker,
    is_completion_only_answer,
    limit_checklist_items,
    normalize_numbered_checklist,
    promote_bare_checklist,
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


def test_should_detect_continuation_marker():
    assert has_continuation_marker("Etap pierwszy.\n\n::next\nEtap drugi.") is True
    assert has_continuation_marker("Pełna odpowiedź bez dalszej części.") is False


def test_should_instruct_continuation_not_to_repeat_previous_answers():
    messages = _messages(
        "Co dalej?",
        "Dokumentacja",
        [{"role": "assistant", "content": "Wykonaj kroki 1-3."}],
        continuation_requested=True,
        continuation_hint="Dokręć zacisk węża.",
    )

    prompt = messages[-1].get("content")
    assert isinstance(prompt, str)
    assert "Podaj wyłącznie nowe kroki" in prompt
    assert "nie rozpoczynaj procedury od nowa" in prompt
    assert "Dokręć zacisk węża" in prompt
    assert "po prostu zakończ odpowiedź na ostatnim kroku" in prompt
    assert "Nie używaj wtedy checklisty" in prompt


def test_should_extract_continuation_target():
    answer = (
        "Wykonaj pierwszy etap.\n\n::next\n"
        "Dokręć zacisk węża i zamocuj pompę do podwozia."
    )

    assert continuation_target(answer) == (
        "Dokręć zacisk węża i zamocuj pompę do podwozia."
    )
    assert continuation_target("Odpowiedź bez dalszej części.") == ""


def test_should_remove_completion_notice_appended_to_last_checklist_item():
    answer = (
        "::checklist\n"
        "- Podłącz wąż hydrauliczny.\n"
        "- Napełnij zbiornik olejem. To już wszystko, co dokumentacja zawiera "
        "na ten temat."
    )

    assert clean_completion_notice(answer) == (
        "::checklist\n- Podłącz wąż hydrauliczny.\n- Napełnij zbiornik olejem."
    )


def test_should_keep_standalone_completion_notice():
    answer = "To już wszystko, co dokumentacja zawiera na ten temat."

    assert clean_completion_notice(answer) == answer


def test_should_recognize_only_standalone_completion_notice():
    assert (
        is_completion_only_answer(
            "To już wszystko, co dokumentacja zawiera na ten temat."
        )
        is True
    )
    assert is_completion_only_answer("To już wszystko!") is True
    assert (
        is_completion_only_answer(
            "Napełnij zbiornik olejem. To już wszystko, co dokumentacja zawiera na ten temat."
        )
        is False
    )


def test_should_limit_checklist_to_six_items_and_add_continuation():
    answer = "Wstęp.\n\n::checklist\n" + "\n".join(
        f"- Krok {index}" for index in range(1, 9)
    )

    limited = limit_checklist_items(answer)

    assert limited.count("\n- ") == 6
    assert "- Krok 6" in limited
    assert "- Krok 7" not in limited
    assert "::next\nNastępnie: Krok 7" in limited
    assert "Krok 8" not in limited


def test_should_enforce_limit_across_multiple_checklists():
    answer = (
        "::checklist\n- Krok 1\n- Krok 2\n- Krok 3\n- Krok 4\n"
        "::warning\nUwaga.\n"
        "::checklist\n- Krok 5\n- Krok 6\n- Krok 7"
    )

    limited = limit_checklist_items(answer)

    assert limited.count("\n- ") == 6
    assert "::warning\nUwaga." in limited
    assert "::next\nNastępnie: Krok 7" in limited


def test_should_replace_model_next_with_first_omitted_item():
    answer = (
        "::checklist\n"
        + "\n".join(f"- Krok {index}" for index in range(1, 8))
        + "\n::next\nEtap po wszystkich krokach."
    )

    limited = limit_checklist_items(answer)

    assert "::next\nNastępnie: Krok 7" in limited
    assert "Etap po wszystkich krokach" not in limited


def test_should_promote_bare_bullet_list_to_checklist():
    answer = (
        "Po zamontowaniu pompy wykonaj kolejne czynności:\n\n"
        "- Dokręć zacisk węża.\n"
        "- Zamontuj przewód hydrauliczny.\n"
        "- Napełnij zbiornik olejem."
    )

    promoted = promote_bare_checklist(answer)

    assert promoted.startswith("Po zamontowaniu pompy wykonaj kolejne czynności:")
    assert "\n\n::checklist\n- Dokręć zacisk węża." in promoted


def test_should_leave_single_bullet_without_directive_unchanged():
    answer = "Informacja:\n- Jeden punkt."

    assert promote_bare_checklist(answer) == answer


def test_should_normalize_numbered_procedure_with_embedded_checklist():
    answer = (
        "Follow these steps:\n\n"
        "1. Apply the parking brake.\n"
        "2. Remove the vent caps.\n"
        "3. Connect the cables in order:\n"
        "::checklist\n"
        "- Positive to positive on the charging vehicle.\n"
        "- Negative to the charging vehicle frame.\n"
        "- Positive to positive on the other vehicle. "
        "4. Start the charging vehicle. "
        "5. Start the other vehicle. "
        "6. Stop if the engine does not start."
    )

    normalized = normalize_numbered_checklist(answer)

    assert normalized.startswith("Follow these steps:\n\n::checklist")
    assert normalized.count("::checklist") == 1
    assert "\n- Apply the parking brake." in normalized
    assert "\n- Positive to positive on the charging vehicle." in normalized
    assert "\n- Start the charging vehicle." in normalized
    assert "\n- Stop if the engine does not start." in normalized


def test_should_leave_numbers_in_regular_text_unchanged():
    answer = "Voltage is 24. Check connector 2. before starting."

    assert normalize_numbered_checklist(answer) == answer


def test_should_preserve_warning_after_normalized_numbered_procedure():
    answer = (
        "Follow these steps:\n"
        "1. Disconnect power.\n"
        "2. Inspect the cables.\n"
        "::warning\nDo not touch exposed terminals."
    )

    normalized = normalize_numbered_checklist(answer)

    assert "\n\n::warning\nDo not touch exposed terminals." in normalized


def test_should_add_intro_to_bare_continuation_checklist():
    answer = "::checklist\n- Dokręć zacisk.\n- Zamontuj przewód."

    assert ensure_continuation_intro(answer) == (
        "Kolejny etap:\n\n::checklist\n- Dokręć zacisk.\n- Zamontuj przewód."
    )


def test_should_preserve_existing_continuation_intro():
    answer = "Teraz zamontuj przewody.\n\n::checklist\n- Dokręć zacisk."

    assert ensure_continuation_intro(answer) == answer
