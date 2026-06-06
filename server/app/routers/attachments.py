import mimetypes
import shutil
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import get_session
from app.models import Attachment, AttachmentDevice, Device
from app.schemas import AttachmentRead
from app.services.ingest import ingest_pdf_to_attachment

router = APIRouter()


def get_unique_filepath(base_path: Path) -> Path:
    if not base_path.exists():
        return base_path
    stem = base_path.stem
    suffix = base_path.suffix
    parent = base_path.parent
    counter = 1
    while True:
        new_path = parent / f"{stem}__{counter}{suffix}"
        if not new_path.exists():
            return new_path
        counter += 1


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=AttachmentRead,
    summary="Upload an attachment",
    description=(
        "Uploads a PDF file and associates it with one or more devices. "
        "After saving the file, the PDF is automatically chunked and ingested "
        "into the vector store so it can be retrieved during RAG queries."
    ),
    responses={404: {"description": "One or more device IDs not found"}},
)
async def create_attachment(
    settings: Annotated[Settings, Depends(get_settings)],
    session: AsyncSession = Depends(get_session),
    file: UploadFile = File(..., description="PDF file to upload."),
    device_ids: list[int] = Form(
        ..., description="List of device IDs this attachment belongs to."
    ),
):
    for device_id in device_ids:
        if not await session.get(Device, device_id):
            raise HTTPException(status_code=404, detail=f"Device {device_id} not found")

    original_name = Path(str(file.filename)).name
    saved_path = get_unique_filepath(settings.attachments_dir / original_name)
    with open(saved_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    file.file.close()

    attachment = Attachment(
        file_global_path=str(saved_path), original_filename=original_name
    )
    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)

    attachment_id = attachment.id
    assert attachment_id is not None
    for device_id in device_ids:
        session.add(AttachmentDevice(device_id=device_id, attachment_id=attachment_id))
    await session.commit()

    await ingest_pdf_to_attachment(
        session=session,
        pdf_path=str(saved_path),
        attachment_id=attachment_id,
        settings=settings,
    )

    await session.refresh(attachment)

    return attachment


@router.get(
    "/{attachment_id}",
    response_model=AttachmentRead,
    summary="Get an attachment",
    description="Returns attachment metadata by ID. Does not return the file content — use the `/file` sub-resource for that.",
    responses={404: {"description": "Attachment not found"}},
)
async def get_attachment(
    attachment_id: int,
    session: AsyncSession = Depends(get_session),
):
    attachment = await session.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return attachment


@router.get(
    "/{attachment_id}/file",
    response_class=FileResponse,
    summary="Download attachment file",
    description=(
        "Streams the raw file associated with the attachment. "
        "The `Content-Type` header is inferred from the file extension."
    ),
    responses={
        200: {"description": "File stream returned successfully."},
        404: {"description": "Attachment record or file on disk not found."},
    },
)
async def get_attachment_file(
    attachment_id: int,
    session: AsyncSession = Depends(get_session),
):
    attachment = await session.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    file_path = Path(attachment.file_global_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    media_type, _ = mimetypes.guess_type(str(file_path))
    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type=media_type or "application/octet-stream",
    )
