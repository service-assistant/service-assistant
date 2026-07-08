import pytest

from app.config import Settings
from app.services.tts import (
    GEMINI_INTERACTIONS_URL,
    PCM_CHANNELS,
    PCM_SAMPLE_RATE,
    PCM_SAMPLE_WIDTH,
    extract_sentences,
    pcm_to_wav,
    stream_synthesize_pcm_chunks,
    synthesize_pcm,
)


@pytest.mark.parametrize(
    "buffer,expected_sentences,expected_remainder",
    [
        (
            "This is the first sentence. And this is the second one. Still streaming",
            ["This is the first sentence.", "And this is the second one."],
            "Still streaming",
        ),
        (
            "Only one long enough sentence. ",
            ["Only one long enough sentence."],
            "",
        ),
        (
            "No boundary here just keeps going",
            [],
            "No boundary here just keeps going",
        ),
        (
            # "Short." is < 20 chars so it merges with the next sentence
            "Short. This sentence is long enough to pass the minimum length check. Tail",
            ["Short. This sentence is long enough to pass the minimum length check."],
            "Tail",
        ),
        (
            # Both sentences are >= 20 chars so each is emitted independently
            "Question mark works? Yes it does work fine. Remainder",
            ["Question mark works?", "Yes it does work fine."],
            "Remainder",
        ),
    ],
)
def test_should_extract_sentences_correctly(
    buffer, expected_sentences, expected_remainder
):
    sentences, remainder = extract_sentences(buffer)
    assert sentences == expected_sentences
    assert remainder == expected_remainder


def test_should_wrap_pcm_audio_as_wav():
    wav = pcm_to_wav(b"\x01\x02\x03\x04")

    assert wav[:4] == b"RIFF"
    assert wav[8:12] == b"WAVE"
    assert wav[20:22] == (1).to_bytes(2, "little")
    assert wav[22:24] == PCM_CHANNELS.to_bytes(2, "little")
    assert wav[24:28] == PCM_SAMPLE_RATE.to_bytes(4, "little")
    assert wav[34:36] == (PCM_SAMPLE_WIDTH * 8).to_bytes(2, "little")
    assert wav[-4:] == b"\x01\x02\x03\x04"


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
                "model": "gemini-3.1-flash-tts-preview",
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
        attachments_dir="/tmp",
        gemini_api_key="gemini-key",
        gemini_tts_model="gemini-3.1-flash-tts-preview",
        gemini_tts_voice="Algenib",
    )

    pcm = await synthesize_pcm("Dzien dobry", settings)

    assert pcm == b"\x01\x02\x03\x04"
    assert captured["url"] == GEMINI_INTERACTIONS_URL
    assert captured["headers"]["x-goog-api-key"] == "gemini-key"
    assert captured["json"] == {
        "model": "gemini-3.1-flash-tts-preview",
        "input": "Dzien dobry",
        "response_format": {"type": "audio"},
        "generation_config": {
            "speech_config": [{"voice": "Algenib"}],
        },
    }


async def test_should_stream_gemini_tts_audio_chunks(mocker):
    captured: dict = {}

    class FakeStreamResponse:
        status_code = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def aiter_lines(self):
            yield 'data: {"delta":{"type":"audio","data":"AQI="}}'
            yield 'data: {"delta":{"type":"audio","data":"AwQ="}}'
            yield "data: [DONE]"

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        def stream(self, method, url, headers, json):
            captured["method"] = method
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeStreamResponse()

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
        attachments_dir="/tmp",
        gemini_api_key="gemini-key",
        gemini_tts_model="gemini-3.1-flash-tts-preview",
        gemini_tts_voice="Algenib",
    )

    chunks = [chunk async for chunk in stream_synthesize_pcm_chunks("Dzien dobry", settings)]

    assert chunks == [b"\x01\x02", b"\x03\x04"]
    assert captured["method"] == "POST"
    assert captured["url"] == GEMINI_INTERACTIONS_URL
    assert captured["headers"]["Api-Revision"] == "2026-05-20"
    assert captured["json"]["stream"] is True
