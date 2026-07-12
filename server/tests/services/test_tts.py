from pathlib import Path

import httpx
import pytest

from app.config import Settings
from app.services.tts import (
    GEMINI_INTERACTIONS_URL,
    PCM_CHANNELS,
    PCM_SAMPLE_RATE,
    PCM_SAMPLE_WIDTH,
    TtsError,
    _extract_b64_audio,
    pcm_to_wav,
    synthesize_pcm,
)


def test_should_wrap_pcm_audio_as_wav():
    wav = pcm_to_wav(b"\x01\x02\x03\x04")

    assert wav[:4] == b"RIFF"
    assert wav[8:12] == b"WAVE"
    assert wav[20:22] == (1).to_bytes(2, "little")
    assert wav[22:24] == PCM_CHANNELS.to_bytes(2, "little")
    assert wav[24:28] == PCM_SAMPLE_RATE.to_bytes(4, "little")
    assert wav[34:36] == (PCM_SAMPLE_WIDTH * 8).to_bytes(2, "little")
    assert wav[-4:] == b"\x01\x02\x03\x04"


def test_should_extract_audio_from_current_interactions_step_shape():
    b64_audio = _extract_b64_audio(
        {
            "created": 123,
            "id": "interaction-id",
            "model": "gemini-2.5-flash-preview-tts",
            "object": "interaction",
            "service_tier": "default",
            "status": "completed",
            "steps": [
                {
                    "id": "step-id",
                    "status": "completed",
                    "output_audio": {
                        "data": "AQIDBA==",
                        "mime_type": "audio/pcm",
                    },
                }
            ],
            "updated": 124,
            "usage": {},
        }
    )

    assert b64_audio == "AQIDBA=="


async def test_should_call_gemini_interactions_api_for_tts(mocker):
    captured: dict = {}

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "steps": [
                    {
                        "output": [
                            {
                                "type": "audio",
                                "data": "AQIDBA==",
                                "channels": 1,
                                "sample_rate": 24000,
                            }
                        ],
                        "type": "model_output",
                    }
                ],
                "object": "interaction",
                "model": "gemini-2.5-flash-preview-tts",
            }

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    mocker.patch("app.services.tts.httpx.AsyncClient", FakeAsyncClient)
    settings = Settings(
        env="test",
        database_url="postgresql+psycopg://postgres:postgres@localhost/test",
        auth_token="token",
        azure_openai_endpoint="https://azure.example.test",
        azure_openai_api_key="azure-key",
        azure_openai_embeddings_deployment="embedding",
        openai_api_key="openai-key",
        openai_chat_model="gpt-4o-mini",
        azure_openai_api_version="2024-01-01",
        attachments_dir=Path("/tmp"),
        gemini_api_key="gemini-key",
        gemini_tts_model="gemini-2.5-flash-preview-tts",
        gemini_tts_voice="Algenib",
    )

    pcm = await synthesize_pcm("Dzien dobry", settings)

    assert pcm == b"\x01\x02\x03\x04"
    assert captured["url"] == GEMINI_INTERACTIONS_URL
    assert captured["headers"]["x-goog-api-key"] == "gemini-key"
    assert captured["json"] == {
        "model": "gemini-2.5-flash-preview-tts",
        "input": "Dzien dobry",
        "response_format": {"type": "audio"},
        "generation_config": {
            "speech_config": [{"voice": "Algenib"}],
        },
    }


@pytest.mark.parametrize(
    "failure,expected_message",
    [
        (
            httpx.ReadTimeout("Gemini timed out"),
            "Gemini TTS request failed: Gemini timed out",
        ),
        (
            ValueError("response is not JSON"),
            "Invalid JSON in Gemini TTS response",
        ),
        (
            {"steps": [{"output_audio": {"data": "not-base64"}}]},
            "Invalid Base64 audio in Gemini TTS response",
        ),
    ],
)
async def test_should_wrap_gemini_failures_as_tts_error(
    mocker, failure, expected_message
):
    class FakeResponse:
        status_code = 200

        def json(self):
            if isinstance(failure, Exception):
                raise failure
            return failure

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, *args, **kwargs):
            if isinstance(failure, httpx.HTTPError):
                raise failure
            return FakeResponse()

    mocker.patch("app.services.tts.httpx.AsyncClient", FakeAsyncClient)
    settings = Settings(
        env="test",
        database_url="postgresql+psycopg://postgres:postgres@localhost/test",
        auth_token="token",
        azure_openai_endpoint="https://azure.example.test",
        azure_openai_api_key="azure-key",
        azure_openai_embeddings_deployment="embedding",
        openai_api_key="openai-key",
        openai_chat_model="gpt-4o-mini",
        azure_openai_api_version="2024-01-01",
        attachments_dir=Path("/tmp"),
        gemini_api_key="gemini-key",
        gemini_tts_model="gemini-2.5-flash-preview-tts",
        gemini_tts_voice="Algenib",
    )

    with pytest.raises(TtsError, match=expected_message):
        await synthesize_pcm("Dzien dobry", settings)
