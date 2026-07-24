import asyncio
import base64
import logging

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import Settings
from app.schemas import NameplateAttribute, NameplateData


logger = logging.getLogger(__name__)

_OPENAI_VISION_TIMEOUT_SECONDS = 50


class NameplateOcrError(RuntimeError):
    pass


class _ExtractedNameplate(BaseModel):
    model: str = Field(default="", max_length=200)
    attributes: list[NameplateAttribute] = Field(default_factory=list)
    raw_text: str = Field(default="", max_length=20_000)
    model_confidence: float | None = Field(default=None, ge=0, le=1)


def _image_media_type(image_bytes: bytes) -> str:
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


def _safe_openai_error_detail(error: Exception, settings: Settings) -> str:
    detail = str(error).strip() or error.__class__.__name__
    if settings.openai_api_key:
        detail = detail.replace(settings.openai_api_key, "[redacted]")
    return detail[:600]


def _fallback_raw_text(extracted: _ExtractedNameplate) -> str:
    rows = [f"MODEL: {extracted.model}"]
    rows.extend(
        f"{attribute.label}: {attribute.value}"
        + (f" {attribute.unit}" if attribute.unit else "")
        for attribute in extracted.attributes
    )
    return "\n".join(rows)


async def _recognize_with_openai(
    image_bytes: bytes,
    settings: Settings,
) -> _ExtractedNameplate:
    media_type = _image_media_type(image_bytes)
    image_base64 = base64.b64encode(image_bytes).decode("ascii")
    image_url = f"data:{media_type};base64,{image_base64}"
    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        timeout=_OPENAI_VISION_TIMEOUT_SECONDS,
    )
    response = await client.chat.completions.parse(
        model=settings.openai_chat_model,
        temperature=0,
        response_format=_ExtractedNameplate,
        messages=[
            {
                "role": "system",
                "content": (
                    "Read a forklift manufacturer nameplate directly from the image. "
                    "Copy visible text exactly; do not infer or invent missing values. "
                    "Return the exact model/type identifier printed on the plate in model. "
                    "If it is unreadable, return an empty model and confidence 0. "
                    "Return every other useful label-value pair in attributes, excluding "
                    "the model. Separate a unit only when it is clearly printed. "
                    "raw_text must contain a newline-separated transcription of all useful "
                    "visible text. Confidence values must reflect image readability."
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Extract the model and all readable fields from this nameplate. "
                            "Preserve serial numbers, punctuation, and letter casing."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_url,
                            "detail": "high",
                        },
                    },
                ],
            },
        ],
    )
    message = response.choices[0].message
    if message.refusal:
        raise NameplateOcrError(f"OpenAI refused image recognition: {message.refusal}")
    if not message.parsed:
        raise NameplateOcrError("OpenAI returned no structured nameplate data")
    return message.parsed


async def recognize_nameplate(
    image_bytes: bytes,
    settings: Settings,
) -> NameplateData:
    try:
        extracted = await asyncio.wait_for(
            _recognize_with_openai(image_bytes, settings),
            timeout=_OPENAI_VISION_TIMEOUT_SECONDS,
        )
    except TimeoutError as error:
        logger.warning(
            "OpenAI nameplate recognition timed out after %s seconds",
            _OPENAI_VISION_TIMEOUT_SECONDS,
        )
        raise NameplateOcrError(
            f"OpenAI image recognition timed out after "
            f"{_OPENAI_VISION_TIMEOUT_SECONDS} seconds"
        ) from error
    except NameplateOcrError:
        raise
    except Exception as error:
        detail = _safe_openai_error_detail(error, settings)
        logger.exception(
            "OpenAI nameplate recognition failed (%s): %s",
            error.__class__.__name__,
            detail,
        )
        raise NameplateOcrError(
            f"OpenAI image recognition failed ({error.__class__.__name__}): {detail}"
        ) from error

    model = extracted.model.strip()
    if not model:
        raise NameplateOcrError("Model was not found on the nameplate image")

    raw_text = extracted.raw_text.strip() or _fallback_raw_text(extracted)
    return NameplateData(
        model=model,
        attributes=extracted.attributes,
        raw_text=raw_text,
        model_confidence=extracted.model_confidence,
    )
