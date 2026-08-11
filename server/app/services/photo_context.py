import asyncio
import base64
import logging
from dataclasses import dataclass
from typing import Any, cast

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import Settings
from app.schemas import PhotoObservation


logger = logging.getLogger(__name__)

MAX_CHAT_PHOTOS = 5
PHOTO_ANALYSIS_TIMEOUT_SECONDS = 20


class PhotoContextError(RuntimeError):
    pass


class PhotoContextTimeoutError(PhotoContextError):
    pass


@dataclass(frozen=True)
class PhotoInput:
    content: bytes
    media_type: str


class _ExtractedPhotoContext(BaseModel):
    observations: list[PhotoObservation] = Field(default_factory=list, max_length=5)


_SYSTEM_PROMPT = """
You analyze photos attached by a service technician to a question about an already
known industrial machine. Do not identify the whole machine and do not solve the
problem. Extract only minimal information useful for searching its service manuals.

For each image, in the same order:
- component: a short, concrete name of the visible component or detail,
- main_identifier: at most one most useful identifier visibly printed in the image,
  such as a component model, part number, fault code, connector label, or type code,
- confidence: confidence in this observation.

Prefer a model/type/part number over a serial number. Do not select generic electrical
values such as voltage, power, current, frequency, or RPM when a model, type, part
number, error code, or connector label is visible. If no useful identifier is clearly
readable, return null. Copy identifiers exactly, including punctuation and letter case.
Never infer, correct, or invent missing characters. Keep component names concise and
write them in Polish. Return no raw OCR text and no additional observations.
""".strip()


def _data_url(photo: PhotoInput) -> str:
    encoded = base64.b64encode(photo.content).decode("ascii")
    return f"data:{photo.media_type};base64,{encoded}"


async def _analyze_with_openai(
    photos: list[PhotoInput],
    question: str,
    settings: Settings,
) -> _ExtractedPhotoContext:
    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        timeout=PHOTO_ANALYSIS_TIMEOUT_SECONDS + 5,
        max_retries=0,
    )
    content: list[dict[str, object]] = [
        {
            "type": "text",
            "text": (
                f"Technician question:\n{question.strip() or '(no text question)'}\n\n"
                f"Analyze the following {len(photos)} image(s). Return at most one "
                "component and one main identifier per image."
            ),
        }
    ]
    content.extend(
        {
            "type": "image_url",
            "image_url": {"url": _data_url(photo), "detail": "high"},
        }
        for photo in photos
    )

    response = await client.chat.completions.parse(
        model=settings.openai_chat_model,
        temperature=0,
        response_format=_ExtractedPhotoContext,
        messages=cast(
            Any,
            [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": content},
            ],
        ),
    )
    message = response.choices[0].message
    if message.refusal:
        raise PhotoContextError(f"OpenAI refused photo analysis: {message.refusal}")
    if not message.parsed:
        raise PhotoContextError("OpenAI returned no structured photo context")
    return message.parsed


async def analyze_photos(
    photos: list[PhotoInput],
    question: str,
    settings: Settings,
) -> list[PhotoObservation]:
    if not photos:
        return []
    if len(photos) > MAX_CHAT_PHOTOS:
        raise ValueError(f"A maximum of {MAX_CHAT_PHOTOS} photos is allowed")

    try:
        extracted = await asyncio.wait_for(
            _analyze_with_openai(photos, question, settings),
            timeout=PHOTO_ANALYSIS_TIMEOUT_SECONDS,
        )
    except TimeoutError as error:
        raise PhotoContextTimeoutError("Photo analysis timed out") from error
    except PhotoContextError:
        raise
    except Exception as error:
        logger.exception("OpenAI photo analysis failed")
        raise PhotoContextError("Photo analysis failed") from error

    observations: list[PhotoObservation] = []
    for observation in extracted.observations[: len(photos)]:
        component = observation.component.strip()
        if not component:
            continue
        identifier = (
            observation.main_identifier.strip()
            if observation.main_identifier and observation.main_identifier.strip()
            else None
        )
        observations.append(
            observation.model_copy(
                update={"component": component, "main_identifier": identifier}
            )
        )
    return observations


def build_rag_photo_context(observations: list[PhotoObservation]) -> str:
    entries: list[str] = []
    seen: set[tuple[str, str | None]] = set()
    for observation in observations:
        key = (observation.component.casefold(), observation.main_identifier)
        if key in seen:
            continue
        seen.add(key)
        entry = observation.component
        if observation.main_identifier:
            entry += f"; główne oznaczenie: {observation.main_identifier}"
        entries.append(entry)
    return "\n".join(f"- {entry}" for entry in entries)


def build_augmented_rag_query(
    question: str, observations: list[PhotoObservation]
) -> str:
    photo_context = build_rag_photo_context(observations)
    if not photo_context:
        return question
    return f"{question}\n\nNajważniejsze informacje ze zdjęć:\n{photo_context}"
