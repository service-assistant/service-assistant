from app.config import get_settings
from app.main import app
from app.services.tts import TtsError


async def test_should_synthesize_speech_as_wav(client, mocker):
    mock_synthesize = mocker.patch(
        "app.services.tts.synthesize_pcm",
        mocker.AsyncMock(return_value=b"\x01\x02\x03\x04"),
    )

    response = await client.post("/api/tts", json={"text": "Dzien dobry"})

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content[:4] == b"RIFF"
    assert response.content[8:12] == b"WAVE"
    assert response.content[-4:] == b"\x01\x02\x03\x04"
    mock_synthesize.assert_awaited_once()
    call_args, call_kwargs = mock_synthesize.await_args
    assert call_args[0] == "Dzien dobry"
    assert call_kwargs == {"voice": None, "style": "neutral"}


async def test_should_use_requested_tts_voice(client, mocker):
    mock_synthesize = mocker.patch(
        "app.services.tts.synthesize_pcm",
        mocker.AsyncMock(return_value=b"\x01\x02\x03\x04"),
    )

    response = await client.post(
        "/api/tts",
        json={
            "text": "Dzien dobry",
            "voice": "Leda",
            "style": "extreme_sensual",
        },
    )

    assert response.status_code == 200
    mock_synthesize.assert_awaited_once()
    call_args, call_kwargs = mock_synthesize.await_args
    assert call_args[0] == "Dzien dobry"
    assert call_kwargs == {"voice": "Leda", "style": "extreme_sensual"}


async def test_should_reject_unsupported_tts_style(client, mocker):
    mock_synthesize = mocker.patch("app.services.tts.synthesize_pcm")

    response = await client.post(
        "/api/tts", json={"text": "Dzien dobry", "style": "unknown"}
    )

    assert response.status_code == 422
    mock_synthesize.assert_not_called()


async def test_should_reject_unsupported_tts_voice(client, mocker):
    mock_synthesize = mocker.patch("app.services.tts.synthesize_pcm")

    response = await client.post(
        "/api/tts", json={"text": "Dzien dobry", "voice": "Unknown"}
    )

    assert response.status_code == 422
    mock_synthesize.assert_not_called()


async def test_should_return_503_when_tts_is_not_configured(client):
    current_settings = get_settings()
    app.dependency_overrides[get_settings] = lambda: current_settings.model_copy(
        update={"gemini_api_key": None}
    )

    response = await client.post("/api/tts", json={"text": "Dzien dobry"})

    assert response.status_code == 503
    assert response.json() == {"detail": "GEMINI_API_KEY is not configured"}


async def test_should_return_502_when_tts_provider_fails(client, mocker):
    mocker.patch(
        "app.services.tts.synthesize_pcm",
        mocker.AsyncMock(side_effect=TtsError("Invalid JSON in Gemini TTS response")),
    )

    response = await client.post("/api/tts", json={"text": "Dzien dobry"})

    assert response.status_code == 502
    assert response.json() == {"detail": "Invalid JSON in Gemini TTS response"}


async def test_should_return_422_for_whitespace_only_text(client, mocker):
    mock_synthesize = mocker.patch("app.services.tts.synthesize_pcm")

    response = await client.post("/api/tts", json={"text": " \t\n"})

    assert response.status_code == 422
    mock_synthesize.assert_not_called()
