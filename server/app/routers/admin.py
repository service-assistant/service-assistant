import asyncio
import logging
import mimetypes
import shutil
import traceback
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import get_engine, get_session
from app.models import (
    Attachment,
    AttachmentDevice,
    Brand,
    ChatThread,
    Chunk,
    ChunkMessage,
    Device,
    DeviceType,
    Message,
)
from app.routers.attachments import list_attachments, save_and_ingest_attachment
from app.routers.brands import list_brands
from app.routers.device_types import list_device_types
from app.routers.devices import list_devices
from app.routers.threads import list_threads
from app.services.async_utils import run_blocking
from app.services.ingest import ImageOnlyPdfError, IngestReport

router = APIRouter()
logger = logging.getLogger(__name__)

UPLOAD_BATCH_TERMINAL_STATES = {"succeeded", "skipped", "failed"}


@dataclass
class UploadBatchItem:
    filename: str
    state: str = "queued"
    attachment_id: int | None = None
    error: str | None = None
    events: list[str] = field(default_factory=list)
    total_pages: int = 0
    native_text_pages: int = 0
    ocr_pages_attempted: int = 0
    ocr_pages_succeeded: int = 0
    ocr_pages_skipped: int = 0
    chunks_indexed: int = 0


@dataclass
class UploadBatch:
    id: str
    items: list[UploadBatchItem]
    created_at: str
    finished_at: str | None = None


_upload_batches: dict[str, UploadBatch] = {}
_upload_batch_lock = asyncio.Lock()

_templates_dir = Path(__file__).parent.parent / "templates"
templates = Jinja2Templates(directory=str(_templates_dir))


async def _require_auth(
    request: Request, settings: Settings = Depends(get_settings)
) -> None:
    if request.cookies.get("admin_token") != settings.auth_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


@router.get("/login", response_class=HTMLResponse)
async def get_login(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="admin/login.html",
        context={"request": request},
    )


@router.post("/login")
async def post_login(
    request: Request,
    settings: Settings = Depends(get_settings),
    token: str = Form(...),
):
    if token != settings.auth_token:
        return JSONResponse(
            {"error": "Invalid token."}, status_code=status.HTTP_401_UNAUTHORIZED
        )
    response = JSONResponse({"redirect": "/admin/documents"})
    response.set_cookie(
        "admin_token",
        token,
        httponly=True,
        samesite="lax",
        domain=settings.cookie_domain,
    )
    return response


@router.get("/session")
async def get_session_status(
    request: Request, settings: Settings = Depends(get_settings)
):
    return {"authenticated": request.cookies.get("admin_token") == settings.auth_token}


@router.post("/logout")
async def post_logout(settings: Settings = Depends(get_settings)):
    response = JSONResponse({"ok": True})
    response.delete_cookie("admin_token", domain=settings.cookie_domain)
    return response


@router.get("/logout")
async def logout(settings: Settings = Depends(get_settings)):
    response = RedirectResponse(url="/admin/login", status_code=303)
    response.delete_cookie("admin_token", domain=settings.cookie_domain)
    return response


@router.get(
    "/images/{image_path:path}",
    response_class=FileResponse,
    dependencies=[Depends(_require_auth)],
)
async def admin_image(image_path: str):
    file_path = Path("/") / image_path
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    media_type, _ = mimetypes.guess_type(str(file_path))
    return FileResponse(path=file_path, media_type=media_type or "image/png")


@router.get("", response_class=RedirectResponse)
async def admin_root(request: Request, settings: Settings = Depends(get_settings)):
    if request.cookies.get("admin_token") == settings.auth_token:
        return RedirectResponse("/admin/documents")
    return RedirectResponse("/admin/login")


@router.get(
    "/next-best-step",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_next_best_step_visualization(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    devices = await list_devices(session=session)
    return templates.TemplateResponse(
        request=request,
        name="admin/next_best_step.html",
        context={
            "request": request,
            "active": "next_best_step",
            "devices": devices,
        },
    )


@dataclass
class AttachmentRow:
    attachment: Attachment
    device_names: list[str]


@router.get(
    "/documents",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_documents(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    attachments = await list_attachments(session=session)
    all_devices = await list_devices(session=session)
    device_map = {d.id: d.name for d in all_devices}

    rows: list[AttachmentRow] = []
    for att in attachments:
        links_result = await session.execute(
            select(AttachmentDevice).where(AttachmentDevice.attachment_id == att.id)
        )
        links = links_result.scalars().all()
        names = [
            device_map[lnk.device_id] for lnk in links if lnk.device_id in device_map
        ]
        rows.append(AttachmentRow(attachment=att, device_names=names))

    return templates.TemplateResponse(
        request=request,
        name="admin/documents.html",
        context={
            "request": request,
            "active": "documents",
            "attachments": rows,
            "devices": all_devices,
        },
    )


@router.post(
    "/documents/upload",
    dependencies=[Depends(_require_auth)],
)
async def upload_document(
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
    file: UploadFile = File(...),
    device_ids: list[int] = Form(default=[]),
):
    try:
        attachment = await save_and_ingest_attachment(
            settings=settings,
            session=session,
            file=file,
            device_ids=device_ids,
        )
        return {
            "id": attachment.id,
            "original_filename": attachment.original_filename,
        }
    except HTTPException:
        raise
    except Exception:
        error = traceback.format_exc()
        logger.exception("Admin upload failed for %s", file.filename)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": error},
        )


def _serialize_upload_batch(batch: UploadBatch) -> dict:
    succeeded = sum(item.state == "succeeded" for item in batch.items)
    skipped = sum(item.state == "skipped" for item in batch.items)
    failed = sum(item.state == "failed" for item in batch.items)
    completed = succeeded + skipped + failed

    return {
        "id": batch.id,
        "state": "completed" if completed == len(batch.items) else "processing",
        "total": len(batch.items),
        "completed": completed,
        "succeeded": succeeded,
        "skipped": skipped,
        "failed": failed,
        "created_at": batch.created_at,
        "finished_at": batch.finished_at,
        "items": [asdict(item) for item in batch.items],
    }


def _copy_staged_upload(source: BinaryIO, destination_path: Path) -> None:
    with destination_path.open("wb") as destination:
        shutil.copyfileobj(source, destination)


async def _run_upload_batch(
    batch_id: str,
    staged_files: list[Path | None],
    device_ids: list[int],
    settings: Settings,
) -> None:
    batch = _upload_batches[batch_id]
    staging_dir = settings.attachments_dir / ".upload_batches" / batch_id

    try:
        for item, staged_path in zip(batch.items, staged_files, strict=True):
            if staged_path is None:
                continue

            item.state = "processing"
            worker_started_event = "Server worker started processing the file."
            item.events.append(worker_started_event)

            def update_progress(report: IngestReport) -> None:
                item.events = [worker_started_event, *report.events]
                item.total_pages = report.total_pages
                item.native_text_pages = report.native_text_pages
                item.ocr_pages_attempted = report.ocr_pages_attempted
                item.ocr_pages_succeeded = report.ocr_pages_succeeded
                item.ocr_pages_skipped = report.ocr_pages_skipped
                item.chunks_indexed = report.chunks_indexed

            try:
                with staged_path.open("rb") as source:
                    upload = UploadFile(file=source, filename=item.filename)
                    async with AsyncSession(
                        get_engine(settings.database_url),
                        expire_on_commit=False,
                    ) as session:
                        try:
                            attachment = await save_and_ingest_attachment(
                                settings=settings,
                                session=session,
                                file=upload,
                                device_ids=device_ids,
                                progress_callback=update_progress,
                            )
                        except TimeoutError:
                            item.events.append(
                                "File processing exceeded the total timeout and was aborted."
                            )
                            raise
                item.attachment_id = attachment.id
                item.state = "succeeded"
                item.events.append("File saved and ingestion finished successfully.")
            except ImageOnlyPdfError as exc:
                update_progress(exc.report)
                item.state = "skipped"
                item.error = str(exc)
                item.events.append(
                    "Image-only file was deleted because OCR recovered no text."
                )
            except Exception:
                item.state = "failed"
                item.error = traceback.format_exc()
                item.events.append(
                    "File ingestion failed; its database record and uploaded file were deleted."
                )
                logger.exception("Admin batch upload failed for %s", item.filename)
            finally:
                staged_path.unlink(missing_ok=True)
    finally:
        for item in batch.items:
            if item.state not in UPLOAD_BATCH_TERMINAL_STATES:
                item.state = "failed"
                item.error = (
                    item.error or "Batch worker stopped before processing finished."
                )
        batch.finished_at = datetime.now(timezone.utc).isoformat()
        shutil.rmtree(staging_dir, ignore_errors=True)


async def _process_upload_batch(
    batch_id: str,
    staged_files: list[Path | None],
    device_ids: list[int],
    settings: Settings,
) -> None:
    async with _upload_batch_lock:
        await _run_upload_batch(batch_id, staged_files, device_ids, settings)


@router.post(
    "/documents/upload-batches",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(_require_auth)],
)
async def create_upload_batch(
    background_tasks: BackgroundTasks,
    settings: Settings = Depends(get_settings),
    files: list[UploadFile] = File(...),
    device_ids: list[int] = Form(default=[]),
):
    batch_id = str(uuid4())
    staging_dir = settings.attachments_dir / ".upload_batches" / batch_id
    staging_dir.mkdir(parents=True, exist_ok=False)

    items: list[UploadBatchItem] = []
    staged_files: list[Path | None] = []

    for index, file in enumerate(files):
        filename = Path(str(file.filename)).name
        item = UploadBatchItem(filename=filename)
        staged_path = staging_dir / f"{index:04d}.upload"
        try:
            await run_blocking(_copy_staged_upload, file.file, staged_path)
            staged_files.append(staged_path)
        except Exception:
            item.state = "failed"
            item.error = traceback.format_exc()
            staged_files.append(None)
            staged_path.unlink(missing_ok=True)
            logger.exception("Could not stage admin upload %s", filename)
        finally:
            file.file.close()
        items.append(item)

    batch = UploadBatch(
        id=batch_id,
        items=items,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    _upload_batches[batch_id] = batch
    background_tasks.add_task(
        _process_upload_batch,
        batch_id,
        staged_files,
        list(device_ids),
        settings,
    )
    return _serialize_upload_batch(batch)


@router.get(
    "/documents/upload-batches/{batch_id}",
    dependencies=[Depends(_require_auth)],
)
async def get_upload_batch(batch_id: str):
    batch = _upload_batches.get(batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Upload batch not found")
    return _serialize_upload_batch(batch)


@router.get(
    "/documents/{attachment_id}",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_document_detail(
    attachment_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    attachment = await session.get(Attachment, attachment_id)
    if not attachment:
        return JSONResponse({"error": "Document not found."}, status_code=404)

    links_result = await session.execute(
        select(AttachmentDevice).where(AttachmentDevice.attachment_id == attachment_id)
    )
    linked_device_ids = {lnk.device_id for lnk in links_result.scalars().all()}

    all_devices = await list_devices(session=session)
    linked_devices = [d for d in all_devices if d.id in linked_device_ids]
    available_devices = [d for d in all_devices if d.id not in linked_device_ids]

    chunk_count_result = await session.execute(
        select(func.count()).select_from(
            select(Chunk).where(Chunk.attachment_id == attachment_id).subquery()
        )
    )
    chunk_count = chunk_count_result.scalar_one()

    return templates.TemplateResponse(
        request=request,
        name="admin/document_detail.html",
        context={
            "request": request,
            "active": "documents",
            "attachment": attachment,
            "linked_devices": linked_devices,
            "available_devices": available_devices,
            "chunk_count": chunk_count,
        },
    )


@dataclass
class DeviceRow:
    device: Device
    brand_name: str
    device_type_name: str


@router.get(
    "/devices",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_devices(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    all_devices = await list_devices(session=session)
    all_brands = await list_brands(session=session)
    all_device_types = await list_device_types(session=session)

    brand_map = {b.id: b.name for b in all_brands}
    dt_map = {dt.id: dt.name for dt in all_device_types}

    rows = [
        DeviceRow(
            device=d,
            brand_name=brand_map.get(d.brand_id, "?"),
            device_type_name=dt_map.get(d.device_type_id, "?"),
        )
        for d in all_devices
    ]

    return templates.TemplateResponse(
        request=request,
        name="admin/devices.html",
        context={
            "request": request,
            "active": "devices",
            "devices": rows,
            "brands": all_brands,
            "device_types": all_device_types,
        },
    )


@router.get(
    "/devices/{device_id}/edit",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_edit_device(
    device_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    device = await session.get(Device, device_id)
    if not device:
        return JSONResponse({"error": "Device not found."}, status_code=404)

    return templates.TemplateResponse(
        request=request,
        name="admin/device_edit.html",
        context={
            "request": request,
            "active": "devices",
            "device": device,
            "brands": await list_brands(session=session),
            "device_types": await list_device_types(session=session),
        },
    )


@router.get(
    "/brands",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_brands(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    return templates.TemplateResponse(
        request=request,
        name="admin/brands.html",
        context={
            "request": request,
            "active": "brands",
            "brands": await list_brands(session=session),
        },
    )


@router.get(
    "/brands/{brand_id}/edit",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_edit_brand(
    brand_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    brand = await session.get(Brand, brand_id)
    if not brand:
        return JSONResponse({"error": "Brand not found."}, status_code=404)
    return templates.TemplateResponse(
        request=request,
        name="admin/brand_edit.html",
        context={"request": request, "active": "brands", "brand": brand},
    )


@router.get(
    "/device_types",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_device_types(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    return templates.TemplateResponse(
        request=request,
        name="admin/device_types.html",
        context={
            "request": request,
            "active": "device_types",
            "device_types": await list_device_types(session=session),
        },
    )


@router.get(
    "/device_types/{device_type_id}/edit",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_edit_device_type(
    device_type_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    dt = await session.get(DeviceType, device_type_id)
    if not dt:
        return JSONResponse({"error": "Device type not found."}, status_code=404)
    return templates.TemplateResponse(
        request=request,
        name="admin/device_type_edit.html",
        context={"request": request, "active": "device_types", "device_type": dt},
    )


@dataclass
class ThreadRow:
    thread: ChatThread
    device_name: str
    message_count: int


@router.get(
    "/threads",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_threads(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    all_threads = await list_threads(session=session)
    all_devices = await list_devices(session=session)
    device_map = {d.id: d.name for d in all_devices}

    rows: list[ThreadRow] = []
    for thread in all_threads:
        count_result = await session.execute(
            select(Message).where(Message.thread_id == thread.id)
        )
        count = len(count_result.scalars().all())
        rows.append(
            ThreadRow(
                thread=thread,
                device_name=device_map.get(thread.device_id, "?"),
                message_count=count,
            )
        )

    return templates.TemplateResponse(
        request=request,
        name="admin/threads.html",
        context={
            "request": request,
            "active": "threads",
            "threads": rows,
            "devices": all_devices,
        },
    )


@dataclass
class ChunkInfo:
    id: int
    attachment_id: int
    attachment_filename: str
    content: str
    page: int | None
    images: list[str]


@dataclass
class MessageRow:
    message: Message
    chunks: list[ChunkInfo]


@router.get(
    "/threads/{thread_id}",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_thread_detail(
    thread_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    thread = await session.get(ChatThread, thread_id)
    if not thread:
        return JSONResponse({"error": "Thread not found."}, status_code=404)

    all_devices = await list_devices(session=session)
    device_map = {d.id: d.name for d in all_devices}

    messages_result = await session.execute(
        select(Message)
        .where(Message.thread_id == thread_id)
        .order_by(Message.created_at)
    )
    messages = messages_result.scalars().all()

    attachments = await list_attachments(session=session)
    attachment_map = {a.id: a.original_filename for a in attachments}

    message_rows: list[MessageRow] = []
    for msg in messages:
        chunks_result = await session.execute(
            select(Chunk)
            .join(ChunkMessage, Chunk.id == ChunkMessage.chunk_id)
            .where(ChunkMessage.message_id == msg.id)
        )
        chunks = chunks_result.scalars().all()
        chunk_infos = [
            ChunkInfo(
                id=c.id,
                attachment_id=c.attachment_id,
                attachment_filename=attachment_map.get(
                    c.attachment_id, f"#{c.attachment_id}"
                ),
                content=c.content,
                page=c.extra_metadata.get("page") if c.extra_metadata else None,
                images=c.extra_metadata.get("images", []) if c.extra_metadata else [],
            )
            for c in chunks
        ]
        message_rows.append(MessageRow(message=msg, chunks=chunk_infos))

    return templates.TemplateResponse(
        request=request,
        name="admin/thread_detail.html",
        context={
            "request": request,
            "active": "threads",
            "thread": thread,
            "device_name": device_map.get(thread.device_id, "?"),
            "message_rows": message_rows,
        },
    )


@dataclass
class ChunkRow:
    chunk: Chunk
    attachment_filename: str


_CHUNKS_PAGE_SIZE = 20


@router.get(
    "/chunks",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_chunks(
    request: Request,
    session: AsyncSession = Depends(get_session),
    attachment_id: int | None = None,
    page: int = 1,
):
    page = max(page, 1)

    attachments = await list_attachments(session=session)
    attachment_map = {a.id: a.original_filename for a in attachments}

    base_query = select(Chunk).order_by(Chunk.attachment_id, Chunk.id)
    if attachment_id is not None:
        base_query = base_query.where(Chunk.attachment_id == attachment_id)

    count_result = await session.execute(
        select(func.count()).select_from(base_query.subquery())
    )
    total = count_result.scalar_one()
    total_pages = max((total + _CHUNKS_PAGE_SIZE - 1) // _CHUNKS_PAGE_SIZE, 1)
    page = min(page, total_pages)

    chunks_result = await session.execute(
        base_query.offset((page - 1) * _CHUNKS_PAGE_SIZE).limit(_CHUNKS_PAGE_SIZE)
    )
    chunks = chunks_result.scalars().all()

    rows = [
        ChunkRow(
            chunk=c,
            attachment_filename=attachment_map.get(c.attachment_id, "?"),
        )
        for c in chunks
    ]

    return templates.TemplateResponse(
        request=request,
        name="admin/chunks.html",
        context={
            "request": request,
            "active": "chunks",
            "rows": rows,
            "attachments": attachments,
            "selected_attachment_id": attachment_id,
            "page": page,
            "total_pages": total_pages,
            "total": total,
        },
    )
