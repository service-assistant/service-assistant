from typing import AsyncGenerator, Final
from app.config import Settings
import httpx
from contextlib import asynccontextmanager
import json
import websockets


DEEPGRAM_LISTEN_URL: Final[str] = (
    "https://api.deepgram.com/v1/listen"
    "?model=nova-3&numerals=true&language=pl&smart_format=true"
)

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
) -> str:
    if not audio_bytes:
        raise SttError("Empty audio file")

    headers = {
        "Authorization": f"Token {settings.deepgram_api_key}",
        "Content-Type": content_type or "audio/m4a",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            DEEPGRAM_LISTEN_URL, headers=headers, content=audio_bytes
        )

    if response.status_code != 200:
        raise SttError(f"Deepgram error {response.status_code}: {response.text}")

    data = response.json()
    transcript = (
        data.get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])[0]
        .get("transcript", "")
        .strip()
    )

    if not transcript:
        raise SttError("Empty transcript")

    return transcript


@asynccontextmanager
async def deepgram_websocket(
    settings: Settings,
    encoding: str = "linear16",
    sample_rate: int = 16000,
) -> AsyncGenerator:
    if not settings.deepgram_api_key:
        raise SttError("Deepgram API key not configured")

    url = f"{DEEPGRAM_STREAM_URL}&encoding={encoding}&sample_rate={sample_rate}"
    headers = {"Authorization": f"Token {settings.deepgram_api_key}"}
    async with websockets.connect(url, additional_headers=headers) as ws:
        yield ws


def parse_deepgram_stream_message(raw: str) -> dict | None:
    data = json.loads(raw)
    if data.get("type") != "Results":
        return None
    transcript = (
        data.get("channel", {}).get("alternatives", [{}])[0].get("transcript", "")
    )
    if not transcript:
        return None
    is_final = data.get("is_final", False)
    return {"type": "final" if is_final else "partial", "transcript": transcript}
