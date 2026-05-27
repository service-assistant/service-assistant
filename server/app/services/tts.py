import base64
from collections.abc import Iterator
from typing import Any, Final

import httpx

from app.config import Settings

GEMINI_API_BASE: Final[str] = "https://generativelanguage.googleapis.com/v1beta"
PCM_SAMPLE_RATE: Final[int] = 24000
PCM_CHANNELS: Final[int] = 1
PCM_SAMPLE_WIDTH: Final[int] = 2  # s16le
DEFAULT_CHUNK_SIZE: Final[int] = 16_384


class TtsError(Exception):
    pass


def _truncate_for_tts(text: str, max_chars: int) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"


async def synthesize_pcm(text: str, settings: Settings) -> bytes:
    if not settings.gemini_api_key:
        raise TtsError("GEMINI_API_KEY is not configured")

    text = _truncate_for_tts(text, settings.gemini_tts_max_chars)
    if not text:
        raise TtsError("Empty text for TTS")

    url = f"{GEMINI_API_BASE}/models/{settings.gemini_tts_model}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": settings.gemini_tts_voice}
                }
            },
        },
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            url,
            headers={
                "x-goog-api-key": settings.gemini_api_key,
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code != 200:
        raise TtsError(
            f"Gemini TTS error {response.status_code}: {response.text[:500]}"
        )

    data = response.json()
    try:
        b64_audio = data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
    except (KeyError, IndexError, TypeError) as exc:
        raise TtsError(f"Unexpected Gemini TTS response: {data}") from exc

    return base64.b64decode(b64_audio)


def iter_audio_chunk_payloads(
    pcm: bytes,
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> Iterator[dict[str, Any]]:
    for index, offset in enumerate(range(0, len(pcm), chunk_size)):
        chunk = pcm[offset : offset + chunk_size]
        yield {
            "index": index,
            "b64": base64.b64encode(chunk).decode("ascii"),
        }


def audio_done_payload(*, total_bytes: int) -> dict[str, Any]:
    return {
        "format": "pcm",
        "encoding": "s16le",
        "sampleRate": PCM_SAMPLE_RATE,
        "channels": PCM_CHANNELS,
        "totalBytes": total_bytes,
    }
