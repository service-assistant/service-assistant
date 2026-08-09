import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.config import Settings, get_settings
from app.schemas import TtsRequest
from app.services import tts

router = APIRouter()
logger = logging.getLogger(__name__)
MAX_TTS_ERROR_DETAIL_CHARS = 500


def _safe_error_detail(detail: str) -> str:
    if len(detail) <= MAX_TTS_ERROR_DETAIL_CHARS:
        return detail
    return f"{detail[:MAX_TTS_ERROR_DETAIL_CHARS]}..."


@router.post(
    "",
    response_class=Response,
    summary="Synthesize assistant speech",
    description="Synthesizes text to speech with the configured Gemini TTS model.",
    responses={
        200: {"content": {"audio/wav": {}}},
        502: {"description": "TTS provider error"},
        503: {"description": "TTS is not configured"},
    },
)
async def synthesize_speech(
    body: TtsRequest,
    settings: Annotated[Settings, Depends(get_settings)],
):
    input_chars = len(body.text)
    try:
        pcm = await tts.synthesize_pcm(
            body.text, settings, voice=body.voice, style=body.style
        )
    except tts.TtsError as exc:
        detail = _safe_error_detail(str(exc))
        status_code = 503 if "not configured" in detail else 502
        raise HTTPException(status_code=status_code, detail=detail) from exc

    logger.info(
        "tts request model=%s mode=wav input_chars=%s output_bytes=%s "
        "output_seconds=%.2f estimated_audio_tokens=%s",
        settings.gemini_tts_model,
        input_chars,
        len(pcm),
        tts.pcm_duration_seconds(len(pcm)),
        tts.estimate_audio_tokens(len(pcm)),
    )

    return Response(
        content=tts.pcm_to_wav(pcm),
        media_type="audio/wav",
        headers={"Content-Disposition": 'inline; filename="assistant-response.wav"'},
    )
