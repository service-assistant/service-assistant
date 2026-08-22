from typing import Annotated

from app.config import Settings, get_settings
from app.dependencies.auth import CurrentOrganizationDependency
from app.dependencies.database import DbSessionDependency
from app.repositories import DeviceRepository
from app.schemas import NameplateRecognitionResponse
from app.services.nameplate_matching import (
    rank_device_candidates,
    select_automatic_family_match,
)
from app.services.nameplate_ocr import (
    NameplateNotFoundError,
    NameplateOcrError,
    NameplateOcrTimeoutError,
    recognize_nameplate,
)
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

router = APIRouter()

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024


@router.post(
    "/recognize",
    response_model=NameplateRecognitionResponse,
    summary="Recognize a forklift nameplate",
    description=(
        "Reads a forklift nameplate, extracts its model and arbitrary attributes, "
        "then ranks matching devices from the catalog."
    ),
)
async def recognize(
    settings: Annotated[Settings, Depends(get_settings)],
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
    photo: UploadFile = File(...),
):
    if photo.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Photo must be a JPEG, PNG, or WebP image",
        )

    image_bytes = await photo.read(_MAX_IMAGE_BYTES + 1)
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Photo is empty")
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Photo is too large")

    try:
        nameplate_data = await recognize_nameplate(image_bytes, settings)
    except NameplateNotFoundError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except NameplateOcrTimeoutError as error:
        raise HTTPException(status_code=504, detail=str(error)) from error
    except NameplateOcrError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    devices = await DeviceRepository(session, organization_id).list()
    candidates = rank_device_candidates(
        devices,
        model=nameplate_data.model,
        raw_text=nameplate_data.raw_text,
    )
    matched_device = select_automatic_family_match(
        candidates,
        model=nameplate_data.model,
    )
    if matched_device:
        nameplate_data = nameplate_data.model_copy(
            update={"match_confidence": matched_device.score}
        )

    return NameplateRecognitionResponse(
        nameplate_data=nameplate_data,
        matched_device=matched_device,
        candidates=candidates,
        requires_confirmation=matched_device is None,
    )
