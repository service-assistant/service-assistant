import asyncio

import pytest

from app.schemas import NameplateAttribute
from app.services import nameplate_ocr
from app.services.nameplate_ocr import (
    NameplateNotFoundError,
    NameplateOcrError,
    NameplateOcrTimeoutError,
)


def _settings(mocker):
    settings = mocker.MagicMock()
    settings.openai_api_key = "openai-secret"
    settings.openai_chat_model = "gpt-5.6-luna"
    return settings


def test_image_media_type_detects_supported_formats():
    assert nameplate_ocr._image_media_type(b"\x89PNG\r\n\x1a\nrest") == "image/png"
    assert nameplate_ocr._image_media_type(b"RIFF1234WEBPrest") == "image/webp"
    assert nameplate_ocr._image_media_type(b"\xff\xd8\xffrest") == "image/jpeg"


async def test_openai_vision_receives_image_and_returns_structured_data(mocker):
    settings = _settings(mocker)
    parsed = nameplate_ocr._ExtractedNameplate(
        model="FD25T-16",
        attributes=[
            NameplateAttribute(
                label="SERIAL",
                value="558123",
                confidence=0.96,
            )
        ],
        raw_text="MODEL FD25T-16\nSERIAL 558123",
        model_confidence=0.97,
    )
    message = mocker.MagicMock(parsed=parsed, refusal=None)
    response = mocker.MagicMock()
    response.choices = [mocker.MagicMock(message=message)]
    parse = mocker.AsyncMock(return_value=response)
    client = mocker.MagicMock()
    client.chat.completions.parse = parse
    openai_client = mocker.patch.object(
        nameplate_ocr,
        "AsyncOpenAI",
        return_value=client,
    )

    result = await nameplate_ocr.recognize_nameplate(b"\xff\xd8\xffimage", settings)

    assert result.model == "FD25T-16"
    assert result.raw_text == "MODEL FD25T-16\nSERIAL 558123"
    assert result.attributes[0].value == "558123"
    request = parse.await_args.kwargs
    assert request["model"] == "gpt-5.6-luna"
    assert "reasoning_effort" not in request
    assert request["response_format"] is nameplate_ocr._ExtractedNameplate
    assert openai_client.call_args.kwargs["timeout"] == 17
    assert openai_client.call_args.kwargs["max_retries"] == 0
    image_part = request["messages"][1]["content"][1]
    assert image_part["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert image_part["image_url"]["detail"] == "high"


async def test_recognition_builds_raw_text_when_model_omits_it(mocker):
    settings = _settings(mocker)
    mocker.patch.object(
        nameplate_ocr,
        "_recognize_with_openai",
        return_value=nameplate_ocr._ExtractedNameplate(
            model="1D1",
            attributes=[NameplateAttribute(label="Capacity", value="2500", unit="kg")],
            model_confidence=0.9,
        ),
    )

    result = await nameplate_ocr.recognize_nameplate(b"image", settings)

    assert result.raw_text == "MODEL: 1D1\nCapacity: 2500 kg"


async def test_recognition_requires_a_visible_model(mocker):
    settings = _settings(mocker)
    mocker.patch.object(
        nameplate_ocr,
        "_recognize_with_openai",
        return_value=nameplate_ocr._ExtractedNameplate(
            model="",
            raw_text="SERIAL 558123",
            model_confidence=0,
        ),
    )

    with pytest.raises(NameplateNotFoundError, match="No readable model/type field"):
        await nameplate_ocr.recognize_nameplate(b"image", settings)


async def test_recognition_stops_when_openai_times_out(mocker):
    settings = _settings(mocker)
    mocker.patch.object(nameplate_ocr, "_OPENAI_FULL_OCR_TIMEOUT_SECONDS", 0.01)
    mocker.patch.object(
        nameplate_ocr,
        "_OPENAI_MODEL_FALLBACK_TIMEOUT_SECONDS",
        0.01,
    )

    async def slow_openai(*_args):
        await asyncio.sleep(0.05)

    mocker.patch.object(
        nameplate_ocr,
        "_recognize_with_openai",
        side_effect=slow_openai,
    )
    mocker.patch.object(
        nameplate_ocr,
        "_recognize_model_only_with_openai",
        side_effect=slow_openai,
    )

    with pytest.raises(
        NameplateOcrTimeoutError,
        match="OpenAI image recognition timed out",
    ):
        await nameplate_ocr.recognize_nameplate(b"image", settings)


async def test_recognition_uses_model_only_fallback_after_full_ocr_timeout(mocker):
    settings = _settings(mocker)
    mocker.patch.object(nameplate_ocr, "_OPENAI_FULL_OCR_TIMEOUT_SECONDS", 0.01)

    async def slow_openai(*_args):
        await asyncio.sleep(0.05)

    mocker.patch.object(
        nameplate_ocr,
        "_recognize_with_openai",
        side_effect=slow_openai,
    )
    fallback = mocker.patch.object(
        nameplate_ocr,
        "_recognize_model_only_with_openai",
        return_value=nameplate_ocr._ExtractedModel(
            model="UNKNOWN-X7",
            model_confidence=0.91,
        ),
    )

    result = await nameplate_ocr.recognize_nameplate(b"image", settings)

    assert result.model == "UNKNOWN-X7"
    assert result.raw_text == "MODEL: UNKNOWN-X7"
    fallback.assert_awaited_once()


async def test_recognition_exposes_safe_openai_failure_detail(mocker):
    settings = _settings(mocker)
    mocker.patch.object(
        nameplate_ocr,
        "_recognize_with_openai",
        side_effect=RuntimeError("Request failed with openai-secret"),
    )

    with pytest.raises(
        NameplateOcrError,
        match=r"OpenAI image recognition failed \(RuntimeError\): "
        r"Request failed with \[redacted\]",
    ):
        await nameplate_ocr.recognize_nameplate(b"image", settings)
