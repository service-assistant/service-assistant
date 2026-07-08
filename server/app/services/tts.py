import base64
import io
import json
import math
import re
import wave
from collections.abc import AsyncIterator, Iterator
from typing import Any, Final

import httpx

from app.config import Settings

GEMINI_API_BASE: Final[str] = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_INTERACTIONS_URL: Final[str] = f"{GEMINI_API_BASE}/interactions"
PCM_SAMPLE_RATE: Final[int] = 24000
PCM_CHANNELS: Final[int] = 1
PCM_SAMPLE_WIDTH: Final[int] = 2  # s16le
GEMINI_AUDIO_TOKENS_PER_SECOND: Final[int] = 25
DEFAULT_CHUNK_SIZE: Final[int] = 16_384
MAX_ERROR_DETAIL_CHARS: Final[int] = 500

_SENTENCE_END: Final = re.compile(r"(?<=[.!?…])\s+")
_MIN_SENTENCE_CHARS: Final[int] = 20


class TtsError(Exception):
    pass


def _truncate_error_detail(detail: str) -> str:
    if len(detail) <= MAX_ERROR_DETAIL_CHARS:
        return detail
    return f"{detail[:MAX_ERROR_DETAIL_CHARS]}..."


def _extract_b64_audio(data: dict[str, Any]) -> str:
    output_audio = data.get("output_audio")
    if isinstance(output_audio, dict) and isinstance(output_audio.get("data"), str):
        return output_audio["data"]

    for step in data.get("steps", []):
        if not isinstance(step, dict):
            continue
        for output in step.get("output", []):
            if (
                isinstance(output, dict)
                and output.get("type") == "audio"
                and isinstance(output.get("data"), str)
            ):
                return output["data"]

    keys = ", ".join(sorted(data.keys()))
    raise TtsError(f"Unexpected Gemini TTS response shape. Top-level keys: {keys}")


def _extract_stream_b64_audio(data: dict[str, Any]) -> str | None:
    delta = data.get("delta")
    if (
        isinstance(delta, dict)
        and delta.get("type") == "audio"
        and isinstance(delta.get("data"), str)
    ):
        return delta["data"]

    try:
        return _extract_b64_audio(data)
    except TtsError:
        return None


def extract_sentences(buffer: str) -> tuple[list[str], str]:
    """Return (complete_sentences, remaining_buffer) splitting on sentence boundaries."""
    sentences: list[str] = []
    pos = 0
    for m in _SENTENCE_END.finditer(buffer):
        s = buffer[pos : m.start()].strip()
        if len(s) >= _MIN_SENTENCE_CHARS:
            sentences.append(s)
            pos = m.end()
    return sentences, buffer[pos:]


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

    payload = {
        "model": settings.gemini_tts_model,
        "input": text,
        "response_format": {"type": "audio"},
        "generation_config": {
            "speech_config": [{"voice": settings.gemini_tts_voice}],
        },
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            GEMINI_INTERACTIONS_URL,
            headers={
                "x-goog-api-key": settings.gemini_api_key,
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code != 200:
        raise TtsError(
            f"Gemini TTS error {response.status_code}: "
            f"{_truncate_error_detail(response.text)}"
        )

    data = response.json()
    b64_audio = _extract_b64_audio(data)

    return base64.b64decode(b64_audio)


async def stream_synthesize_pcm_chunks(
    text: str, settings: Settings
) -> AsyncIterator[bytes]:
    if not settings.gemini_api_key:
        raise TtsError("GEMINI_API_KEY is not configured")

    text = _truncate_for_tts(text, settings.gemini_tts_max_chars)
    if not text:
        raise TtsError("Empty text for TTS")

    payload = {
        "model": settings.gemini_tts_model,
        "input": text,
        "response_format": {"type": "audio"},
        "generation_config": {
            "speech_config": [{"voice": settings.gemini_tts_voice}],
        },
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            GEMINI_INTERACTIONS_URL,
            headers={
                "x-goog-api-key": settings.gemini_api_key,
                "Content-Type": "application/json",
                "Api-Revision": "2026-05-20",
            },
            json=payload,
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                raise TtsError(
                    f"Gemini TTS error {response.status_code}: "
                    f"{_truncate_error_detail(body.decode('utf-8', errors='replace'))}"
                )

            async for line in response.aiter_lines():
                line = line.strip()
                if not line or line.startswith("event:"):
                    continue
                if line.startswith("data:"):
                    line = line.removeprefix("data:").strip()
                if not line or line == "[DONE]":
                    continue

                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue

                b64_audio = _extract_stream_b64_audio(data)
                if b64_audio:
                    yield base64.b64decode(b64_audio)


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


def encode_pcm_chunk(pcm: bytes) -> str:
    return base64.b64encode(pcm).decode("ascii")


def audio_done_payload(*, total_bytes: int) -> dict[str, Any]:
    return {
        "format": "pcm",
        "encoding": "s16le",
        "sampleRate": PCM_SAMPLE_RATE,
        "channels": PCM_CHANNELS,
        "totalBytes": total_bytes,
    }


def pcm_duration_seconds(pcm_bytes: int) -> float:
    bytes_per_second = PCM_SAMPLE_RATE * PCM_CHANNELS * PCM_SAMPLE_WIDTH
    return pcm_bytes / bytes_per_second if bytes_per_second else 0.0


def estimate_audio_tokens(pcm_bytes: int) -> int:
    return math.ceil(pcm_duration_seconds(pcm_bytes) * GEMINI_AUDIO_TOKENS_PER_SECOND)


def pcm_to_wav(pcm: bytes) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(PCM_CHANNELS)
        wav.setsampwidth(PCM_SAMPLE_WIDTH)
        wav.setframerate(PCM_SAMPLE_RATE)
        wav.writeframes(pcm)
    return output.getvalue()
