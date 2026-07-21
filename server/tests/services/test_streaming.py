from app.services.streaming import ChecklistStreamLimiter


def test_should_limit_checklist_before_chunks_are_streamed_to_client():
    answer = (
        "Wstęp.\n\n::checklist\n"
        + "\n".join(f"- Krok {index}" for index in range(1, 9))
        + "\n::next\nEtap po wszystkich krokach."
    )
    limiter = ChecklistStreamLimiter()
    streamed_chunks: list[str] = []

    for chunk in [answer[:19], answer[19:47], answer[47:73], answer[73:]]:
        streamed_chunks.extend(limiter.feed(chunk))
    streamed_chunks.extend(limiter.finish())
    streamed_answer = "".join(streamed_chunks)

    assert streamed_answer.count("\n- ") == 6
    assert "- Krok 6" in streamed_answer
    assert "- Krok 7" not in streamed_answer
    assert "Krok 8" not in streamed_answer
    assert "::next\nNastępnie: Krok 7" in streamed_answer
    assert "Etap po wszystkich krokach" not in streamed_answer


def test_should_stream_regular_text_without_waiting_for_a_newline():
    limiter = ChecklistStreamLimiter()

    first_chunks = limiter.feed("Zwykła odpowiedź ")
    next_chunks = limiter.feed("jest nadal streamowana.")

    assert first_chunks == ["Zwykła odpowiedź "]
    assert next_chunks == ["jest nadal streamowana."]
    assert limiter.finish() == []


def test_should_stream_allowed_checklist_item_as_soon_as_marker_arrives():
    limiter = ChecklistStreamLimiter()

    marker_chunks = limiter.feed("::checklist\n- ")
    content_chunks = limiter.feed("Krok 1")

    assert marker_chunks == ["::checklist\n", "- "]
    assert content_chunks == ["Krok 1"]
