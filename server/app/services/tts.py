import base64
import io
import math
import re
import wave
from typing import Any, Final

import httpx

from app.config import Settings

GEMINI_API_BASE: Final[str] = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_INTERACTIONS_URL: Final[str] = f"{GEMINI_API_BASE}/interactions"
PCM_SAMPLE_RATE: Final[int] = 24000
PCM_CHANNELS: Final[int] = 1
PCM_SAMPLE_WIDTH: Final[int] = 2  # s16le
GEMINI_AUDIO_TOKENS_PER_SECOND: Final[int] = 25
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

    b64_audio = _find_b64_audio(data)
    if b64_audio:
        return b64_audio

    keys = ", ".join(sorted(data.keys()))
    raise TtsError(f"Unexpected Gemini TTS response shape. Top-level keys: {keys}")


def _find_b64_audio(value: Any, *, in_audio_context: bool = False) -> str | None:
    if isinstance(value, list):
        for item in value:
            b64_audio = _find_b64_audio(item, in_audio_context=in_audio_context)
            if b64_audio:
                return b64_audio
        return None

    if not isinstance(value, dict):
        return None

    mime_type = value.get("mime_type") or value.get("mimeType")
    is_audio = (
        in_audio_context
        or value.get("type") == "audio"
        or value.get("modality") == "AUDIO"
        or (isinstance(mime_type, str) and mime_type.startswith("audio/"))
    )
    if is_audio and isinstance(value.get("data"), str):
        return value["data"]

    for key in ("output_audio", "inline_data", "inlineData", "blob"):
        child = value.get(key)
        if isinstance(child, dict):
            b64_audio = _find_b64_audio(child, in_audio_context=True)
            if b64_audio:
                return b64_audio

    for child in value.values():
        b64_audio = _find_b64_audio(child, in_audio_context=is_audio)
        if b64_audio:
            return b64_audio

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
