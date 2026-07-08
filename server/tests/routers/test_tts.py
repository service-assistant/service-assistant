from app.config import get_settings
from app.main import app


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


async def test_should_return_503_when_tts_is_not_configured(client):
    current_settings = get_settings()
    app.dependency_overrides[get_settings] = lambda: current_settings.model_copy(
        update={"gemini_api_key": None}
    )

    response = await client.post("/api/tts", json={"text": "Dzien dobry"})

    assert response.status_code == 503
    assert response.json() == {"detail": "GEMINI_API_KEY is not configured"}
