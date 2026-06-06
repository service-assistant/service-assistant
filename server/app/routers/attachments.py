import mimetypes
import shutil
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import get_session
from app.models import Attachment, AttachmentDevice, Device
from app.schemas import AttachmentRead, DeviceRead
from app.services.ingest import delete_attachment_chunks, ingest_pdf_to_attachment

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


@router.get(
    "",
    response_model=list[AttachmentRead],
    summary="List attachments",
    description="Returns all attachments.",
)
async def list_attachments(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Attachment))
    return result.scalars().all()


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
        default=[], description="List of device IDs this attachment belongs to."
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


@router.delete(
    "/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an attachment",
    description="Deletes the attachment record, its chunks, and the file on disk.",
    responses={404: {"description": "Attachment not found"}},
)
async def delete_attachment(
    attachment_id: int,
    session: AsyncSession = Depends(get_session),
):
    attachment = await session.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    file_path = Path(attachment.file_global_path)
    await session.delete(attachment)
    await session.commit()
    if file_path.exists():
        file_path.unlink()


@router.post(
    "/{attachment_id}/reingest",
    response_model=AttachmentRead,
    summary="Re-ingest an attachment",
    description="Deletes existing chunks for the attachment and re-runs the PDF ingestion pipeline.",
    responses={404: {"description": "Attachment not found"}},
)
async def reingest_attachment(
    attachment_id: int,
    settings: Annotated[Settings, Depends(get_settings)],
    session: AsyncSession = Depends(get_session),
):
    attachment = await session.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    pdf_path = attachment.file_global_path
    await delete_attachment_chunks(session, attachment_id)
    await ingest_pdf_to_attachment(
        session=session,
        pdf_path=pdf_path,
        attachment_id=attachment_id,
        settings=settings,
    )
    await session.refresh(attachment)
    return attachment


@router.get(
    "/{attachment_id}/devices",
    response_model=list[DeviceRead],
    summary="List devices linked to an attachment",
    description="Returns all devices associated with the given attachment.",
    responses={404: {"description": "Attachment not found"}},
)
async def list_attachment_devices(
    attachment_id: int,
    session: AsyncSession = Depends(get_session),
):
    attachment = await session.get(
        Attachment, attachment_id, options=[selectinload(Attachment.devices)]
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return attachment.devices


@router.post(
    "/{attachment_id}/devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Link a device to an attachment",
    description="Associates a device with an attachment. Idempotent — no error if the link already exists.",
    responses={404: {"description": "Attachment or device not found"}},
)
async def link_device(
    attachment_id: int,
    device_id: int,
    session: AsyncSession = Depends(get_session),
):
    if not await session.get(Attachment, attachment_id):
        raise HTTPException(status_code=404, detail="Attachment not found")
    if not await session.get(Device, device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    existing = await session.execute(
        select(AttachmentDevice).where(
            AttachmentDevice.attachment_id == attachment_id,
            AttachmentDevice.device_id == device_id,
        )
    )
    if not existing.scalars().first():
        session.add(AttachmentDevice(attachment_id=attachment_id, device_id=device_id))
        await session.commit()


@router.delete(
    "/{attachment_id}/devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unlink a device from an attachment",
    description="Removes the association between a device and an attachment. Fails with 404 if the link does not exist.",
    responses={404: {"description": "Link not found"}},
)
async def unlink_device(
    attachment_id: int,
    device_id: int,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(AttachmentDevice).where(
            AttachmentDevice.attachment_id == attachment_id,
            AttachmentDevice.device_id == device_id,
        )
    )
    link = result.scalars().first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    await session.delete(link)
    await session.commit()
