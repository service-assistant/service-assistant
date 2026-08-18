import logging
import shutil
from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings
from ..models import Attachment, AttachmentDevice, Device
from .async_utils import run_blocking

logger = logging.getLogger(__name__)


def _copy_upload_to_unique_path(source: BinaryIO, base_path: Path) -> Path:
    stem = base_path.stem
    suffix = base_path.suffix
    parent = base_path.parent
    counter = 0

    while True:
        destination_path = (
            base_path if counter == 0 else parent / f"{stem}__{counter}{suffix}"
        )
        try:
            with destination_path.open("xb") as destination:
                shutil.copyfileobj(source, destination)
            return destination_path
        except FileExistsError:
            counter += 1
        except Exception:
            destination_path.unlink(missing_ok=True)
            raise


def _unlink_quietly(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.exception(
            "Could not remove uploaded file %s after the upload failed", path
        )


async def save_attachment(
    settings: Settings,
    session: AsyncSession,
    file: UploadFile,
    device_ids: list[int],
) -> Attachment:
    """Stores an uploaded PDF on disk and links it to the given devices.

    Does not ingest — the attachment lands with `ingest_status = ready` and
    waits for an explicit `POST /{attachment_id}/ingest` call.
    """
    for device_id in device_ids:
        if not await session.get(Device, device_id):
            raise HTTPException(status_code=404, detail=f"Device {device_id} not found")

    original_name = Path(str(file.filename)).name
    base_path = settings.attachments_dir / original_name
    saved_path: Path | None = None

    try:
        saved_path = await run_blocking(
            _copy_upload_to_unique_path, file.file, base_path
        )

        attachment = Attachment(
            file_global_path=str(saved_path), original_filename=original_name
        )
        session.add(attachment)
        await session.flush()

        for device_id in device_ids:
            session.add(
                AttachmentDevice(device_id=device_id, attachment_id=attachment.id)
            )
        await session.commit()
        await session.refresh(attachment)
    except IntegrityError:
        # A device was deleted between the check above and this commit.
        await session.rollback()
        if saved_path is not None:
            _unlink_quietly(saved_path)
        raise HTTPException(
            status_code=404, detail="One or more devices no longer exist"
        )
    except Exception:
        await session.rollback()
        if saved_path is not None:
            _unlink_quietly(saved_path)
        raise
    finally:
        file.file.close()

    return attachment
