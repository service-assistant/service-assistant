from typing import Final

import httpx

from app.config import Settings

DEEPGRAM_LISTEN_URL: Final[str] = (
    "https://api.deepgram.com/v1/listen"
    "?model=nova-3&numerals=true&language=pl&smart_format=true"
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
            DEEPGRAM_LISTEN_URL,
            headers=headers,
            content=audio_bytes,
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