from contextlib import asynccontextmanager
import json
from typing import Any, AsyncGenerator, Final

import httpx
import websockets

from app.config import Settings

OPENAI_TRANSCRIPTIONS_URL: Final[str] = "https://api.openai.com/v1/audio/transcriptions"
DEEPGRAM_STREAM_URL: Final[str] = (
    "wss://api.deepgram.com/v1/listen"
    "?model=nova-3&language=pl&smart_format=true&numerals=true&interim_results=true"
)


class SttError(Exception):
    pass


async def transcribe(
    audio_bytes: bytes,
    content_type: str,
    settings: Settings,
    filename: str = "recording.m4a",
) -> str:
    if not audio_bytes:
        raise SttError("Empty audio file")
    if not settings.openai_api_key.strip():
        raise SttError("OPENAI_API_KEY is not configured")

    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    files = {"file": (filename, audio_bytes, content_type)}
    data = {
        "model": settings.openai_stt_model,
        "language": "pl",
        "prompt": settings.openai_stt_prompt,
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                OPENAI_TRANSCRIPTIONS_URL,
                headers=headers,
                files=files,
                data=data,
            )
    except httpx.HTTPError as exc:
        raise SttError(f"STT request failed: {exc}") from exc

    if response.status_code != 200:
        raise SttError(f"STT provider returned {response.status_code}: {response.text}")

    try:
        transcript = response.json().get("text", "").strip()
    except (AttributeError, TypeError, ValueError) as exc:
        raise SttError("STT provider returned invalid data") from exc
    if not transcript:
        raise SttError("Empty transcript")
    return transcript


# The streaming Deepgram path remains available for older clients.
@asynccontextmanager
async def deepgram_websocket(
    settings: Settings,
    encoding: str = "linear16",
    sample_rate: int = 16000,
) -> AsyncGenerator[Any, None]:
    if not settings.deepgram_api_key:
        raise SttError("Deepgram API key not configured")

    url = f"{DEEPGRAM_STREAM_URL}&encoding={encoding}&sample_rate={sample_rate}"
    headers = {"Authorization": f"Token {settings.deepgram_api_key}"}
    async with websockets.connect(url, additional_headers=headers) as socket:
        yield socket


def parse_deepgram_stream_message(
    raw_message: str | bytes,
) -> dict[str, object] | None:
    payload = json.loads(raw_message)
    if payload.get("type") != "Results":
        return None
    transcript = (
        payload.get("channel", {}).get("alternatives", [{}])[0].get("transcript", "")
    )
    if not transcript:
        return None
    is_final = payload.get("is_final", False)
    return {"type": "final" if is_final else "partial", "transcript": transcript}
