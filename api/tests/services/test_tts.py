import re

import httpx
import pytest

from app.config import get_settings
from app.services.tts import (
    GEMINI_INTERACTIONS_URL,
    PCM_CHANNELS,
    PCM_SAMPLE_RATE,
    PCM_SAMPLE_WIDTH,
    TTS_CHUNK_MAX_CHARS,
    TTS_STYLE_PROMPTS,
    TtsError,
    _extract_b64_audio,
    _split_tts_text,
    _tts_total_timeout_seconds,
    pcm_to_wav,
    synthesize_pcm,
)


def test_should_scale_total_timeout_with_concurrent_chunk_batches():
    assert _tts_total_timeout_seconds(1) == pytest.approx(105.5)
    assert _tts_total_timeout_seconds(2) == pytest.approx(105.5)
    assert _tts_total_timeout_seconds(3) == pytest.approx(206.0)
    assert _tts_total_timeout_seconds(4) == pytest.approx(206.0)


def test_should_split_long_tts_text_at_sentence_boundaries():
    text = "Zdanie testowe do syntezy. " * 50

    chunks = _split_tts_text(text)

    assert len(chunks) > 1
    assert all(0 < len(chunk) <= TTS_CHUNK_MAX_CHARS for chunk in chunks)
    assert " ".join(chunks) == text.strip()


async def test_should_synthesize_long_text_in_chunks_and_join_pcm(mocker):
    captured_inputs: list[str] = []

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"output_audio": {"data": "AQIDBA=="}}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, headers, json):
            captured_inputs.append(json["input"])
            return FakeResponse()

    mocker.patch("app.services.tts.httpx.AsyncClient", FakeAsyncClient)
    text = "Zdanie testowe do syntezy. " * 50
    expected_chunks = _split_tts_text(text)

    pcm = await synthesize_pcm(text, get_settings())

    assert len(captured_inputs) == len(expected_chunks)
    assert set(captured_inputs) == set(expected_chunks)
    assert pcm == b"\x01\x02\x03\x04" * len(expected_chunks)


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

    pcm = await synthesize_pcm(
        "Dzien dobry", get_settings(), voice="Leda", style="extreme_sensual"
    )

    assert pcm == b"\x01\x02\x03\x04"
    assert captured["url"] == GEMINI_INTERACTIONS_URL
    assert captured["headers"]["x-goog-api-key"] == "gemini-key"
    assert captured["json"] == {
        "model": "gemini-2.5-flash-preview-tts",
        "input": f"{TTS_STYLE_PROMPTS['extreme_sensual']}Dzien dobry",
        "response_format": {"type": "audio"},
        "generation_config": {
            "speech_config": [{"voice": "Leda"}],
        },
    }


async def test_should_fall_back_to_safer_style_when_gemini_blocks_prompt(mocker):
    captured_inputs: list[str] = []

    class FakeResponse:
        def __init__(self, *, blocked: bool):
            self.status_code = 400 if blocked else 200
            self.text = '{"error":{"code":"content_blocked"}}' if blocked else ""

        def json(self):
            if self.status_code == 400:
                return {"error": {"code": "content_blocked"}}
            return {"output_audio": {"data": "AQIDBA=="}}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, headers, json):
            captured_inputs.append(json["input"])
            return FakeResponse(blocked=len(captured_inputs) == 1)

    mocker.patch("app.services.tts.httpx.AsyncClient", FakeAsyncClient)

    pcm = await synthesize_pcm(
        "Dzien dobry", get_settings(), voice="Leda", style="extreme_sensual"
    )

    assert pcm == b"\x01\x02\x03\x04"
    assert captured_inputs == [
        f"{TTS_STYLE_PROMPTS['extreme_sensual']}Dzien dobry",
        f"{TTS_STYLE_PROMPTS['sensual']}Dzien dobry",
    ]


@pytest.mark.parametrize(
    "failure,expected_message",
    [
        (
            httpx.ReadTimeout("Gemini timed out"),
            "Gemini TTS request failed (ReadTimeout): Gemini timed out",
        ),
        (
            httpx.ReadError(""),
            "Gemini TTS request failed (ReadError): no details",
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

    with pytest.raises(TtsError, match=re.escape(expected_message)):
        await synthesize_pcm("Dzien dobry", get_settings())
