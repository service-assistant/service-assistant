import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse

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


def _sse(event: str, payload: str) -> str:
    return f"event: {event}\ndata: {payload}\n\n"


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
        pcm = await tts.synthesize_pcm(body.text, settings)
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


@router.post(
    "/stream",
    response_class=StreamingResponse,
    summary="Stream assistant speech",
    description="Streams PCM audio chunks with one Gemini TTS streaming request.",
)
async def stream_speech(
    body: TtsRequest,
    settings: Annotated[Settings, Depends(get_settings)],
):
    input_chars = len(body.text)

    async def event_stream():
        total_bytes = 0
        try:
            async for chunk in tts.stream_synthesize_pcm_chunks(body.text, settings):
                total_bytes += len(chunk)
                yield _sse("audio_chunk", tts.encode_pcm_chunk(chunk))
        except tts.TtsError as exc:
            yield _sse("tts_error", _safe_error_detail(str(exc)))
            return

        logger.info(
            "tts request model=%s mode=stream input_chars=%s output_bytes=%s "
            "output_seconds=%.2f estimated_audio_tokens=%s",
            settings.gemini_tts_model,
            input_chars,
            total_bytes,
            tts.pcm_duration_seconds(total_bytes),
            tts.estimate_audio_tokens(total_bytes),
        )

        yield _sse("audio_done", str(total_bytes))

    return StreamingResponse(event_stream(), media_type="text/event-stream")
