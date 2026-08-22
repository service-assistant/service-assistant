import asyncio
import mimetypes
from pathlib import Path

import fitz
from app.dependencies.auth import CurrentOrganizationDependency, require_org_admin
from app.dependencies.database import DbSessionDependency
from app.dependencies.entities import AttachmentDependency, DeviceDependency
from app.dependencies.settings import SettingsDependency
from app.repositories import AttachmentRepository
from app.schemas import AttachmentRead, DeviceRead
from app.services.attachments import save_attachment
from app.services.ingestion_queue import cancel_ingestion, enqueue_ingestion, is_active
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse

router = APIRouter()


@router.get(
    "",
    response_model=list[AttachmentRead],
    summary="List attachments",
    description=(
        "Returns all attachments. Each row includes both the document's own "
        "metadata and its current background-ingestion state, in the `ingest_*` "
        "fields — there is no separate 'job' resource to join against.\n\n"
        "`ingest_status` is one of `ready | queued | running | succeeded | "
        "failed`. See `POST /{attachment_id}/ingest` and "
        "`POST /{attachment_id}/cancel` for how a job moves between these "
        "states."
    ),
    dependencies=[Depends(require_org_admin)],
)
async def list_attachments(
    session: DbSessionDependency, organization_id: CurrentOrganizationDependency
):
    return await AttachmentRepository(session, organization_id).list()


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=list[AttachmentRead],
    summary="Upload attachments",
    description=(
        "Uploads one or more PDF files and associates them with one or more devices. "
        "Files are only stored and linked here — nothing is ingested yet. This is a "
        "deliberate two-step design: upload is instant and never blocks on the PDF "
        "pipeline, ingestion happens separately as a background job. Each attachment "
        "lands with `ingest_status = ready`; queue it for indexing with "
        "`POST /{attachment_id}/ingest`."
    ),
    responses={404: {"description": "One or more device IDs not found"}},
    dependencies=[Depends(require_org_admin)],
)
async def create_attachment(
    settings: SettingsDependency,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
    files: list[UploadFile] = File(
        default=[], description="PDF file(s) to upload (repeatable form field)."
    ),
    device_ids: list[int] = Form(
        default=[], description="List of device IDs these attachments belong to."
    ),
):
    if not files:
        raise HTTPException(status_code=422, detail="No files provided")

    return [
        await save_attachment(
            settings=settings,
            session=session,
            file=upload,
            device_ids=device_ids,
            organization_id=organization_id,
        )
        for upload in files
    ]


@router.get(
    "/{attachment_id}",
    response_model=AttachmentRead,
    summary="Get an attachment",
    description=(
        "Returns attachment metadata by ID, including its current `ingest_*` job "
        "state (status, page/chunk progress, timestamps, last error). Does not "
        "return the file content — use the `/file` sub-resource for that. Poll "
        "this endpoint to watch a queued or running ingestion progress."
    ),
    responses={404: {"description": "Attachment not found"}},
)
async def get_attachment(attachment: AttachmentDependency):
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
async def get_attachment_file(attachment: AttachmentDependency):
    file_path = Path(attachment.file_global_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    media_type, _ = mimetypes.guess_type(str(file_path))
    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type=media_type or "application/octet-stream",
    )


def _render_pdf_page(file_path: Path, page_number: int, zoom: float):
    with fitz.open(file_path) as document:
        if page_number > document.page_count:
            return None, document.page_count

        page = document.load_page(page_number - 1)
        pixmap = page.get_pixmap(
            matrix=fitz.Matrix(1.2 * zoom, 1.2 * zoom), alpha=False
        )
        return pixmap.tobytes("png"), document.page_count


@router.get(
    "/{attachment_id}/preview/{page_number}",
    response_class=Response,
    summary="Render an attachment PDF page",
    description="Renders one PDF page as PNG for the admin document preview.",
    responses={
        200: {"content": {"image/png": {}}},
        404: {"description": "Attachment, file, or page not found"},
        422: {"description": "Invalid page number or zoom"},
    },
    dependencies=[Depends(require_org_admin)],
)
async def preview_attachment_page(
    attachment: AttachmentDependency,
    page_number: int,
    zoom: float = Query(default=1.0, ge=0.75, le=2.0),
):
    if page_number < 1:
        raise HTTPException(status_code=422, detail="Page number must be at least 1")

    file_path = Path(attachment.file_global_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    try:
        image, page_count = await asyncio.to_thread(
            _render_pdf_page, file_path, page_number, zoom
        )
    except (fitz.FileDataError, RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=422, detail="File is not a valid PDF"
        ) from error

    if image is None:
        raise HTTPException(status_code=404, detail="PDF page not found")

    return Response(
        content=image,
        media_type="image/png",
        headers={
            "Cache-Control": "private, max-age=300",
            "X-File-Size": str(file_path.stat().st_size),
            "X-PDF-Page-Count": str(page_count),
        },
    )


@router.delete(
    "/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an attachment",
    description=(
        "Deletes the attachment record and the file on disk. Chunks are not "
        "deleted by this endpoint's code — `chunks.attachment_id` has "
        "`ON DELETE CASCADE`, so Postgres removes them automatically when the "
        "attachment row goes away. If a job is currently queued or running for "
        "this attachment, it is cancelled/aborted first (same mechanics as "
        "`POST /{attachment_id}/cancel`) so the worker never operates on a "
        "vanished attachment."
    ),
    responses={404: {"description": "Attachment not found"}},
    dependencies=[Depends(require_org_admin)],
)
async def delete_attachment(
    attachment: AttachmentDependency,
    session: DbSessionDependency,
):
    # Stop any in-flight ingestion first, so the worker is not left operating on
    # an attachment that no longer exists.
    if is_active(attachment):
        await cancel_ingestion(session, attachment)
    file_path = Path(attachment.file_global_path)
    await session.delete(attachment)
    await session.commit()
    if file_path.exists():
        file_path.unlink()


@router.post(
    "/{attachment_id}/ingest",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=AttachmentRead,
    summary="Queue an attachment for ingestion",
    description=(
        "Queues a background job (via [Procrastinate]"
        "(https://procrastinate.readthedocs.io/), Postgres-backed) that runs the "
        "PDF pipeline for this attachment: extracts native text page by page, "
        "falls back to Azure Document Intelligence OCR for image-only pages, "
        "embeds the resulting chunks (Azure OpenAI), and writes them as `Chunk` "
        "rows. The actual task lives in `app/tasks/ingest.py`; this endpoint only "
        "sets `ingest_status = queued`, records `ingest_queued_at`, and defers "
        "the job — it returns immediately, well before the job itself starts.\n\n"
        "**One job runs at a time**, globally, across all attachments — the "
        'Procrastinate task is deferred with `lock="ingest"`, so jobs execute '
        "strictly in the order they were queued rather than in parallel. "
        "Queueing several attachments in a row is expected and safe; they simply "
        "wait their turn.\n\n"
        "**Valid from** `ready`, `succeeded`, or `failed` — this one endpoint "
        "covers the first run, a manual reprocess of an already-succeeded "
        "document, and a retry after failure alike. Whichever the case, any "
        "chunks from a previous attempt are deleted by the worker before it "
        "re-runs the pipeline, and the response's progress/error fields are "
        "reset to zero/null. Returns 409 if already `queued` or `running` — "
        "cancel it first (`POST /{attachment_id}/cancel`) if you want to "
        "restart immediately.\n\n"
        "**To watch progress**: poll `GET /{attachment_id}` (or the list "
        "endpoint). While `running`, the worker flushes `ingest_pages_done`, "
        "`ingest_chunks_indexed`, and `ingest_last_event` roughly every 2 "
        "seconds. `ingest_native_text_pages` / `ingest_ocr_pages_*` give a "
        "breakdown of native-text vs. OCR pages, useful for diagnosing a scan "
        "that came out mostly blank."
    ),
    responses={
        404: {"description": "Attachment not found"},
        409: {"description": "Already queued or running"},
    },
    dependencies=[Depends(require_org_admin)],
)
async def ingest_attachment(
    attachment: AttachmentDependency,
    session: DbSessionDependency,
):
    if is_active(attachment):
        raise HTTPException(
            status_code=409,
            detail="An ingestion for this attachment is already queued or running",
        )

    return await enqueue_ingestion(session, attachment)


@router.post(
    "/{attachment_id}/cancel",
    response_model=AttachmentRead,
    summary="Cancel an ingestion",
    description=(
        "Stops a job and returns the attachment to `ready` — there is no "
        "terminal 'cancelled' status in this system; cancelling always resets "
        "the attachment to look like a fresh upload (progress counters and "
        "timestamps cleared), ready to be queued again.\n\n"
        "Behavior differs by the current state, because a `queued` job hasn't "
        "started running Python code yet while a `running` one has:\n"
        "- **`queued`**: the Procrastinate job is cancelled outright "
        "(`cancel_job_by_id_async(abort=True)`) and this request resets the row "
        "to `ready` immediately — the job never runs at all.\n"
        "- **`running`**: this request only *asks* the job to stop, by setting "
        "Procrastinate's `abort_requested` flag. The worker task polls "
        "`context.should_abort()` between pages and honors it at the next page "
        "boundary — so the response you get back from this call may still show "
        "`ingest_status: running`. Poll `GET /{attachment_id}` afterwards; once "
        "the worker notices the abort, it resets the row to `ready` itself "
        "(same field-clearing as the `queued` case). A page mid-OCR-call can "
        "take a few seconds to actually stop.\n\n"
        "Returns 409 if the attachment isn't currently `queued` or `running` "
        "(nothing to cancel)."
    ),
    responses={
        404: {"description": "Attachment not found"},
        409: {"description": "Not currently queued or running"},
    },
    dependencies=[Depends(require_org_admin)],
)
async def cancel_attachment_ingestion(
    attachment: AttachmentDependency,
    session: DbSessionDependency,
):
    if not is_active(attachment):
        raise HTTPException(
            status_code=409,
            detail=f"Not currently queued or running ({attachment.ingest_status.value})",
        )

    return await cancel_ingestion(session, attachment)


@router.get(
    "/{attachment_id}/devices",
    response_model=list[DeviceRead],
    summary="List devices linked to an attachment",
    description="Returns all devices associated with the given attachment.",
    responses={404: {"description": "Attachment not found"}},
    dependencies=[Depends(require_org_admin)],
)
async def list_attachment_devices(
    attachment: AttachmentDependency,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    return await AttachmentRepository(session, organization_id).list_devices(
        attachment.id
    )


@router.post(
    "/{attachment_id}/devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Link a device to an attachment",
    description="Associates a device with an attachment. Idempotent — no error if the link already exists.",
    responses={404: {"description": "Attachment or device not found"}},
    dependencies=[Depends(require_org_admin)],
)
async def link_device(
    attachment: AttachmentDependency,
    device: DeviceDependency,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    await AttachmentRepository(session, organization_id).link_device(
        attachment.id, device.id
    )


@router.delete(
    "/{attachment_id}/devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unlink a device from an attachment",
    description="Removes the association between a device and an attachment. Idempotent — no error if the link doesn't exist.",
    responses={404: {"description": "Attachment or device not found"}},
    dependencies=[Depends(require_org_admin)],
)
async def unlink_device(
    attachment: AttachmentDependency,
    device: DeviceDependency,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    await AttachmentRepository(session, organization_id).unlink_device(
        attachment.id, device.id
    )
