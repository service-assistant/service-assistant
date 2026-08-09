from app.services.stt import OPENAI_TRANSCRIPTIONS_URL, transcribe


async def test_transcribes_audio_with_accuracy_model_and_prompt(mocker, settings):
    response = mocker.MagicMock(status_code=200)
    response.json.return_value = {"text": "Jak skasować błąd E-23? Podaj mi klucz."}
    http = mocker.AsyncMock()
    http.post = mocker.AsyncMock(return_value=response)
    http.__aenter__ = mocker.AsyncMock(return_value=http)
    http.__aexit__ = mocker.AsyncMock(return_value=False)
    mocker.patch("app.services.stt.httpx.AsyncClient", return_value=http)

    transcript = await transcribe(
        b"audio",
        "audio/wav",
        settings,
        filename="recording.wav",
    )

    assert transcript == "Jak skasować błąd E-23? Podaj mi klucz."
    http.post.assert_awaited_once_with(
        OPENAI_TRANSCRIPTIONS_URL,
        headers={"Authorization": "Bearer test-openai-key"},
        files={"file": ("recording.wav", b"audio", "audio/wav")},
        data={
            "model": "gpt-transcribe",
            "language": "pl",
            "prompt": settings.openai_stt_prompt,
        },
    )


async def test_strips_transcript_whitespace(mocker, settings):
    response = mocker.MagicMock(status_code=200)
    response.json.return_value = {"text": "  pytanie technika  "}
    http = mocker.AsyncMock()
    http.post = mocker.AsyncMock(return_value=response)
    http.__aenter__ = mocker.AsyncMock(return_value=http)
    http.__aexit__ = mocker.AsyncMock(return_value=False)
    mocker.patch("app.services.stt.httpx.AsyncClient", return_value=http)

    assert await transcribe(b"audio", "audio/wav", settings) == "pytanie technika"
