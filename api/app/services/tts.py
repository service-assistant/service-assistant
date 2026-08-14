import asyncio
import base64
import binascii
import io
import logging
import math
import time
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
TTS_REQUEST_ATTEMPTS: Final[int] = 2
TTS_RETRY_DELAY_SECONDS: Final[float] = 0.5
TTS_ATTEMPT_TIMEOUT_SECONDS: Final[float] = 50.0
TTS_TOTAL_TIMEOUT_GRACE_SECONDS: Final[float] = 5.0
TTS_CHUNK_MAX_CHARS: Final[int] = 500
TTS_CHUNK_CONCURRENCY: Final[int] = 2
TTS_RETRYABLE_STATUS_CODES: Final[frozenset[int]] = frozenset({429, 500, 502, 503, 504})
TTS_STYLE_PROMPTS: Final[dict[str, str]] = {
    "warm": (
        "Synthesize speech in Polish. Use a warm, friendly adult voice with a "
        "calm, relaxed pace and natural intonation. Speak only the transcript; "
        "do not read these directions aloud.\n\nTranscript:\n"
    ),
    "sensual": (
        "Synthesize speech in Polish. Use a confident, warm adult voice with a "
        "slightly lower pitch. Speak at a relaxed pace with soft, natural "
        "breathiness and smooth expressive intonation, while remaining polished "
        "and never exaggerated. Speak only the transcript; do not read these "
        "directions aloud.\n\nTranscript:\n"
    ),
    "extra_sensual": (
        "Synthesize speech in Polish using a confident, playfully expressive "
        "adult voice recorded close to the microphone. Use a noticeably lower "
        "pitch, a very slow relaxed pace, pronounced soft breathiness and smooth, "
        "lingering intonation. Keep the delivery natural and immersive. Speak "
        "only the transcript; do not read these "
        "directions aloud.\n\nTranscript:\n"
    ),
    "extreme_sensual": (
        "Synthesize speech in Polish using an adult voice. Audio profile: an "
        "extremely confident, expressive and playfully captivating woman speaking "
        "very close to the microphone in a quiet studio. "
        "Director's notes: use the lowest natural pitch, an extremely slow pace, "
        "long deliberate pauses, pronounced breathiness, rich full-voice resonance "
        "and lingering, playful intonation. Never whisper; keep the voice full, "
        "clear, bold and magnetic. Speak only the transcript; never read "
        "these directions aloud.\n\nTranscript:\n"
        "[very slowly, breathily, close-mic, expressive, full voice] "
    ),
}
TTS_STYLE_FALLBACKS: Final[dict[str, tuple[str, ...]]] = {
    "extreme_sensual": ("extreme_sensual", "sensual", "warm", "neutral"),
    "extra_sensual": ("extra_sensual", "sensual", "warm", "neutral"),
    "sensual": ("sensual", "warm", "neutral"),
    "warm": ("warm", "neutral"),
    "neutral": ("neutral",),
}
logger = logging.getLogger(__name__)


class TtsError(Exception):
    pass


def _truncate_error_detail(detail: str) -> str:
    if len(detail) <= MAX_ERROR_DETAIL_CHARS:
        return detail
    return f"{detail[:MAX_ERROR_DETAIL_CHARS]}..."


def _is_content_blocked_response(response: httpx.Response) -> bool:
    if response.status_code != 400:
        return False
    try:
        data = response.json()
    except (ValueError, TypeError):
        return '"content_blocked"' in response.text
    if not isinstance(data, dict):
        return False
    error = data.get("error")
    return isinstance(error, dict) and error.get("code") == "content_blocked"


def _extract_b64_audio(data: Any) -> str:
    if not isinstance(data, dict):
        raise TtsError("Unexpected Gemini TTS response shape")

    output_audio = data.get("output_audio")
    if isinstance(output_audio, dict) and isinstance(output_audio.get("data"), str):
        if output_audio["data"]:
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


def _truncate_for_tts(text: str, max_chars: int) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"


def _split_tts_text(text: str, max_chars: int = TTS_CHUNK_MAX_CHARS) -> list[str]:
    remaining = text.strip()
    chunks: list[str] = []

    while len(remaining) > max_chars:
        window = remaining[: max_chars + 1]
        minimum_boundary = max_chars // 2
        boundary = -1

        for separator in (". ", "! ", "? ", "; ", ": ", "\n", " "):
            index = window.rfind(separator)
            if index >= minimum_boundary:
                boundary = index + (1 if separator != " " else 0)
                break

        if boundary <= 0:
            boundary = max_chars

        chunk = remaining[:boundary].strip()
        if chunk:
            chunks.append(chunk)
        remaining = remaining[boundary:].strip()

    if remaining:
        chunks.append(remaining)

    return chunks


def _tts_total_timeout_seconds(chunk_count: int) -> float:
    concurrent_batches = max(1, math.ceil(chunk_count / TTS_CHUNK_CONCURRENCY))
    per_batch_budget = (
        TTS_ATTEMPT_TIMEOUT_SECONDS * TTS_REQUEST_ATTEMPTS
        + TTS_RETRY_DELAY_SECONDS * (TTS_REQUEST_ATTEMPTS - 1)
    )
    return concurrent_batches * per_batch_budget + TTS_TOTAL_TIMEOUT_GRACE_SECONDS


async def synthesize_pcm(
    text: str,
    settings: Settings,
    *,
    voice: str | None = None,
    style: str = "neutral",
) -> bytes:
    gemini_api_key = settings.gemini_api_key
    if not gemini_api_key:
        raise TtsError("GEMINI_API_KEY is not configured")

    text = _truncate_for_tts(text, settings.gemini_tts_max_chars)
    if not text:
        raise TtsError("Empty text for TTS")

    text_chunks = _split_tts_text(text)
    chunk_semaphore = asyncio.Semaphore(TTS_CHUNK_CONCURRENCY)

    async def request_with_retry(
        payload: dict[str, Any], chunk_chars: int
    ) -> httpx.Response:
        last_request_error: httpx.RequestError | None = None
        for attempt in range(TTS_REQUEST_ATTEMPTS):
            try:
                async with httpx.AsyncClient(
                    timeout=TTS_ATTEMPT_TIMEOUT_SECONDS
                ) as client:
                    response = await client.post(
                        GEMINI_INTERACTIONS_URL,
                        headers={
                            "x-goog-api-key": gemini_api_key,
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
                if (
                    response.status_code in TTS_RETRYABLE_STATUS_CODES
                    and attempt < TTS_REQUEST_ATTEMPTS - 1
                ):
                    logger.warning(
                        "retrying Gemini TTS chunk after status=%s attempt=%s chunk_chars=%s",
                        response.status_code,
                        attempt + 1,
                        chunk_chars,
                    )
                    await asyncio.sleep(TTS_RETRY_DELAY_SECONDS)
                    continue
                return response
            except httpx.RequestError as exc:
                last_request_error = exc
                logger.warning(
                    "Gemini TTS chunk request failed error_type=%s attempt=%s chunk_chars=%s detail=%s",
                    type(exc).__name__,
                    attempt + 1,
                    chunk_chars,
                    str(exc).strip() or "no details",
                )
                if attempt < TTS_REQUEST_ATTEMPTS - 1:
                    await asyncio.sleep(TTS_RETRY_DELAY_SECONDS)

        assert last_request_error is not None
        error_type = type(last_request_error).__name__
        error_detail = str(last_request_error).strip() or "no details"
        raise TtsError(
            f"Gemini TTS request failed ({error_type}): {error_detail}"
        ) from last_request_error

    async def synthesize_chunk(chunk: str) -> bytes:
        started_at = time.monotonic()
        fallback_styles = TTS_STYLE_FALLBACKS.get(style, ("neutral",))
        response: httpx.Response | None = None

        for fallback_index, fallback_style in enumerate(fallback_styles):
            payload = {
                "model": settings.gemini_tts_model,
                "input": f"{TTS_STYLE_PROMPTS.get(fallback_style, '')}{chunk}",
                "response_format": {"type": "audio"},
                "generation_config": {
                    "speech_config": [{"voice": voice or settings.gemini_tts_voice}],
                },
            }

            async with chunk_semaphore:
                response = await request_with_retry(payload, len(chunk))

            if not _is_content_blocked_response(response):
                break

            if fallback_index < len(fallback_styles) - 1:
                logger.warning(
                    "Gemini TTS style blocked; retrying with safer style "
                    "requested_style=%s fallback_style=%s chunk_chars=%s",
                    style,
                    fallback_styles[fallback_index + 1],
                    len(chunk),
                )

        assert response is not None

        if response.status_code != 200:
            if _is_content_blocked_response(response):
                raise TtsError(
                    "Gemini blocked speech synthesis for this text even without "
                    "an expressive voice style"
                )
            raise TtsError(
                f"Gemini TTS error {response.status_code}: "
                f"{_truncate_error_detail(response.text)}"
            )

        try:
            data = response.json()
        except (ValueError, TypeError) as exc:
            raise TtsError("Invalid JSON in Gemini TTS response") from exc

        try:
            b64_audio = _extract_b64_audio(data)
            pcm = base64.b64decode(b64_audio, validate=True)
            logger.info(
                "Gemini TTS chunk completed chunk_chars=%s elapsed_seconds=%.1f",
                len(chunk),
                time.monotonic() - started_at,
            )
            return pcm
        except TtsError:
            raise
        except (binascii.Error, ValueError, TypeError) as exc:
            raise TtsError("Invalid Base64 audio in Gemini TTS response") from exc

    async def synthesize_all_chunks() -> list[bytes]:
        return await asyncio.gather(*(synthesize_chunk(chunk) for chunk in text_chunks))

    total_timeout_seconds = _tts_total_timeout_seconds(len(text_chunks))
    try:
        pcm_chunks = await asyncio.wait_for(
            synthesize_all_chunks(), timeout=total_timeout_seconds
        )
    except TimeoutError as exc:
        raise TtsError(
            f"Gemini TTS request timed out after {total_timeout_seconds:.0f} seconds"
        ) from exc

    return b"".join(pcm_chunks)


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
