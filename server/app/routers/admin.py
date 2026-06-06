import mimetypes
import shutil
from dataclasses import dataclass
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import Settings, get_settings
from app.database import get_session
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
from app.routers.attachments import get_unique_filepath
from app.services.ingest import delete_attachment_chunks, ingest_pdf_to_attachment

router = APIRouter()

_templates_dir = Path(__file__).parent.parent / "templates"
templates = Jinja2Templates(directory=str(_templates_dir))


async def _require_auth(
    request: Request, settings: Settings = Depends(get_settings)
) -> None:
    if request.cookies.get("admin_token") != settings.auth_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@router.get("/login", response_class=HTMLResponse)
async def get_login(request: Request):
    return templates.TemplateResponse(
        "admin/login.html", {"request": request, "error": None}
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
    response = JSONResponse({"success": "Logged in.", "redirect": "/admin/documents"})
    response.set_cookie("admin_token", token, httponly=True, samesite="lax")
    return response


@router.get("/logout")
async def logout():
    response = JSONResponse({"success": "Logged out.", "redirect": "/admin/login"})
    response.delete_cookie("admin_token")
    return response


# ---------------------------------------------------------------------------
# Images proxy (cookie-auth so browser <img> tags work)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Root redirect
# ---------------------------------------------------------------------------


@router.get("")
async def admin_root():
    return JSONResponse({"redirect": "/admin/documents"})


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


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
    attachments_result = await session.execute(select(Attachment))
    attachments = attachments_result.scalars().all()

    devices_result = await session.execute(select(Device))
    all_devices = devices_result.scalars().all()
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
        "admin/documents.html",
        {
            "request": request,
            "active": "documents",
            "attachments": rows,
            "devices": all_devices,
        },
    )


@router.post("/documents", dependencies=[Depends(_require_auth)])
async def post_documents(
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
    file: UploadFile = File(...),
    device_ids: list[int] = Form(default=[]),
):
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

    return JSONResponse(
        {
            "success": f"'{original_name}' uploaded and indexed.",
            "redirect": "/admin/documents",
        }
    )


@router.post("/documents/{attachment_id}/delete", dependencies=[Depends(_require_auth)])
async def delete_document(
    attachment_id: int,
    session: AsyncSession = Depends(get_session),
):
    attachment = await session.get(Attachment, attachment_id)
    if not attachment:
        return JSONResponse({"error": "Document not found."}, status_code=422)

    file_path = Path(attachment.file_global_path)
    await session.delete(attachment)
    await session.commit()

    if file_path.exists():
        file_path.unlink()

    return JSONResponse(
        {"success": "Document deleted.", "redirect": "/admin/documents"}
    )


@router.post(
    "/documents/{attachment_id}/reingest", dependencies=[Depends(_require_auth)]
)
async def reingest_document(
    attachment_id: int,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
):
    attachment = await session.get(Attachment, attachment_id)
    if not attachment:
        return JSONResponse({"error": "Document not found."}, status_code=422)

    await delete_attachment_chunks(session, attachment_id)
    await ingest_pdf_to_attachment(
        session=session,
        pdf_path=attachment.file_global_path,
        attachment_id=attachment_id,
        settings=settings,
    )
    return JSONResponse(
        {
            "success": f"'{attachment.original_filename}' re-ingested successfully.",
            "redirect": "/admin/documents",
        }
    )


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

    devices_result = await session.execute(select(Device))
    all_devices = devices_result.scalars().all()
    linked_devices = [d for d in all_devices if d.id in linked_device_ids]
    available_devices = [d for d in all_devices if d.id not in linked_device_ids]

    chunk_count_result = await session.execute(
        select(func.count()).select_from(
            select(Chunk).where(Chunk.attachment_id == attachment_id).subquery()
        )
    )
    chunk_count = chunk_count_result.scalar_one()

    return templates.TemplateResponse(
        "admin/document_detail.html",
        {
            "request": request,
            "active": "documents",
            "attachment": attachment,
            "linked_devices": linked_devices,
            "available_devices": available_devices,
            "chunk_count": chunk_count,
        },
    )


@router.post("/documents/{attachment_id}/link", dependencies=[Depends(_require_auth)])
async def link_document_device(
    attachment_id: int,
    session: AsyncSession = Depends(get_session),
    device_id: int = Form(...),
):
    attachment = await session.get(Attachment, attachment_id)
    if not attachment:
        return JSONResponse({"error": "Document not found."}, status_code=422)

    existing = await session.execute(
        select(AttachmentDevice).where(
            AttachmentDevice.attachment_id == attachment_id,
            AttachmentDevice.device_id == device_id,
        )
    )
    if not existing.scalars().first():
        session.add(AttachmentDevice(attachment_id=attachment_id, device_id=device_id))
        await session.commit()

    return JSONResponse(
        {"success": "Device linked.", "redirect": f"/admin/documents/{attachment_id}"}
    )


@router.post(
    "/documents/{attachment_id}/unlink/{device_id}",
    dependencies=[Depends(_require_auth)],
)
async def unlink_document_device(
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
    if link:
        await session.delete(link)
        await session.commit()

    return JSONResponse(
        {"success": "Device unlinked.", "redirect": f"/admin/documents/{attachment_id}"}
    )


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------


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
    devices_result = await session.execute(select(Device))
    brands_result = await session.execute(select(Brand))
    device_types_result = await session.execute(select(DeviceType))

    all_brands = brands_result.scalars().all()
    all_device_types = device_types_result.scalars().all()
    brand_map = {b.id: b.name for b in all_brands}
    dt_map = {dt.id: dt.name for dt in all_device_types}

    rows = [
        DeviceRow(
            device=d,
            brand_name=brand_map.get(d.brand_id, "?"),
            device_type_name=dt_map.get(d.device_type_id, "?"),
        )
        for d in devices_result.scalars().all()
    ]

    return templates.TemplateResponse(
        "admin/devices.html",
        {
            "request": request,
            "active": "devices",
            "devices": rows,
            "brands": all_brands,
            "device_types": all_device_types,
        },
    )


@router.post("/devices", dependencies=[Depends(_require_auth)])
async def post_devices(
    session: AsyncSession = Depends(get_session),
    name: str = Form(...),
    brand_id: int = Form(...),
    device_type_id: int = Form(...),
    model_serial_code: str = Form(default=""),
    image_url: str = Form(default=""),
):
    device = Device(
        name=name,
        brand_id=brand_id,
        device_type_id=device_type_id,
        model_serial_code=model_serial_code or None,
        image_url=image_url or None,
    )
    session.add(device)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return JSONResponse(
            {"error": "Invalid brand or device type ID."}, status_code=422
        )
    return JSONResponse(
        {"success": f"Device '{name}' created.", "redirect": "/admin/devices"}
    )


@router.post("/devices/{device_id}/delete", dependencies=[Depends(_require_auth)])
async def delete_device(
    device_id: int,
    session: AsyncSession = Depends(get_session),
):
    device = await session.get(Device, device_id)
    if not device:
        return JSONResponse({"error": "Device not found."}, status_code=422)
    try:
        await session.delete(device)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return JSONResponse(
            {"error": "Cannot delete device: one or more chat threads reference it."},
            status_code=422,
        )
    return JSONResponse({"success": "Device deleted.", "redirect": "/admin/devices"})


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

    brands_result = await session.execute(select(Brand))
    device_types_result = await session.execute(select(DeviceType))
    return templates.TemplateResponse(
        "admin/device_edit.html",
        {
            "request": request,
            "active": "devices",
            "device": device,
            "brands": brands_result.scalars().all(),
            "device_types": device_types_result.scalars().all(),
        },
    )


@router.post("/devices/{device_id}/edit", dependencies=[Depends(_require_auth)])
async def post_edit_device(
    device_id: int,
    session: AsyncSession = Depends(get_session),
    name: str = Form(...),
    brand_id: int = Form(...),
    device_type_id: int = Form(...),
    model_serial_code: str = Form(default=""),
    image_url: str = Form(default=""),
):
    device = await session.get(Device, device_id)
    if not device:
        return JSONResponse({"error": "Device not found."}, status_code=422)
    device.name = name
    device.brand_id = brand_id
    device.device_type_id = device_type_id
    device.model_serial_code = model_serial_code or None
    device.image_url = image_url or None
    await session.commit()
    return JSONResponse(
        {"success": f"Device '{name}' updated.", "redirect": "/admin/devices"}
    )


# ---------------------------------------------------------------------------
# Brands
# ---------------------------------------------------------------------------


@router.get(
    "/brands",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_brands(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Brand))
    return templates.TemplateResponse(
        "admin/brands.html",
        {"request": request, "active": "brands", "brands": result.scalars().all()},
    )


@router.post("/brands", dependencies=[Depends(_require_auth)])
async def post_brands(
    session: AsyncSession = Depends(get_session),
    name: str = Form(...),
    logo_url: str = Form(default=""),
):
    brand = Brand(name=name, logo_url=logo_url or None)
    session.add(brand)
    await session.commit()
    return JSONResponse(
        {"success": f"Brand '{name}' created.", "redirect": "/admin/brands"}
    )


@router.post("/brands/{brand_id}/delete", dependencies=[Depends(_require_auth)])
async def delete_brand(
    brand_id: int,
    session: AsyncSession = Depends(get_session),
):
    brand = await session.get(Brand, brand_id)
    if not brand:
        return JSONResponse({"error": "Brand not found."}, status_code=422)
    try:
        await session.delete(brand)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return JSONResponse(
            {"error": "Cannot delete brand: one or more devices reference it."},
            status_code=422,
        )
    return JSONResponse({"success": "Brand deleted.", "redirect": "/admin/brands"})


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
        "admin/brand_edit.html",
        {"request": request, "active": "brands", "brand": brand},
    )


@router.post("/brands/{brand_id}/edit", dependencies=[Depends(_require_auth)])
async def post_edit_brand(
    brand_id: int,
    session: AsyncSession = Depends(get_session),
    name: str = Form(...),
    logo_url: str = Form(default=""),
):
    brand = await session.get(Brand, brand_id)
    if not brand:
        return JSONResponse({"error": "Brand not found."}, status_code=422)
    brand.name = name
    brand.logo_url = logo_url or None
    await session.commit()
    return JSONResponse(
        {"success": f"Brand '{name}' updated.", "redirect": "/admin/brands"}
    )


# ---------------------------------------------------------------------------
# Device Types
# ---------------------------------------------------------------------------


@router.get(
    "/device_types",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_auth)],
)
async def get_device_types(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(DeviceType))
    return templates.TemplateResponse(
        "admin/device_types.html",
        {
            "request": request,
            "active": "device_types",
            "device_types": result.scalars().all(),
        },
    )


@router.post("/device_types", dependencies=[Depends(_require_auth)])
async def post_device_types(
    session: AsyncSession = Depends(get_session),
    name: str = Form(...),
):
    dt = DeviceType(name=name)
    session.add(dt)
    await session.commit()
    return JSONResponse(
        {"success": f"Device type '{name}' created.", "redirect": "/admin/device_types"}
    )


@router.post(
    "/device_types/{device_type_id}/delete", dependencies=[Depends(_require_auth)]
)
async def delete_device_type(
    device_type_id: int,
    session: AsyncSession = Depends(get_session),
):
    dt = await session.get(DeviceType, device_type_id)
    if not dt:
        return JSONResponse({"error": "Device type not found."}, status_code=422)
    try:
        await session.delete(dt)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return JSONResponse(
            {"error": "Cannot delete device type: one or more devices reference it."},
            status_code=422,
        )
    return JSONResponse({"success": "Device type deleted."})


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
        "admin/device_type_edit.html",
        {"request": request, "active": "device_types", "device_type": dt},
    )


@router.post(
    "/device_types/{device_type_id}/edit", dependencies=[Depends(_require_auth)]
)
async def post_edit_device_type(
    device_type_id: int,
    session: AsyncSession = Depends(get_session),
    name: str = Form(...),
):
    dt = await session.get(DeviceType, device_type_id)
    if not dt:
        return JSONResponse({"error": "Device type not found."}, status_code=422)
    dt.name = name
    await session.commit()
    return JSONResponse(
        {"success": f"Device type '{name}' updated.", "redirect": "/admin/device_types"}
    )


# ---------------------------------------------------------------------------
# Threads
# ---------------------------------------------------------------------------


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
    threads_result = await session.execute(select(ChatThread))
    all_threads = threads_result.scalars().all()

    devices_result = await session.execute(select(Device))
    all_devices = devices_result.scalars().all()
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
        "admin/threads.html",
        {
            "request": request,
            "active": "threads",
            "threads": rows,
            "devices": all_devices,
        },
    )


@router.post("/threads", dependencies=[Depends(_require_auth)])
async def post_threads(
    session: AsyncSession = Depends(get_session),
    title: str = Form(...),
    device_id: int = Form(...),
):
    thread = ChatThread(title=title, device_id=device_id)
    session.add(thread)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return JSONResponse({"error": "Invalid device ID."}, status_code=422)
    return JSONResponse(
        {"success": f"Thread '{title}' created.", "redirect": "/admin/threads"}
    )


@router.post("/threads/{thread_id}/delete", dependencies=[Depends(_require_auth)])
async def delete_thread(
    thread_id: int,
    session: AsyncSession = Depends(get_session),
):
    thread = await session.get(ChatThread, thread_id)
    if not thread:
        return JSONResponse({"error": "Thread not found."}, status_code=422)
    await session.delete(thread)
    await session.commit()
    return JSONResponse({"success": "Thread deleted."})


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
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
):
    thread = await session.get(ChatThread, thread_id)
    if not thread:
        return JSONResponse({"error": "Thread not found."}, status_code=404)

    devices_result = await session.execute(select(Device))
    device_map = {d.id: d.name for d in devices_result.scalars().all()}

    messages_result = await session.execute(
        select(Message)
        .where(Message.thread_id == thread_id)
        .order_by(Message.created_at)
    )
    messages = messages_result.scalars().all()

    attachments_result = await session.execute(select(Attachment))
    attachment_map = {
        a.id: a.original_filename for a in attachments_result.scalars().all()
    }

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
        "admin/thread_detail.html",
        {
            "request": request,
            "active": "threads",
            "thread": thread,
            "device_name": device_map.get(thread.device_id, "?"),
            "message_rows": message_rows,
            "auth_token": settings.auth_token,
        },
    )


# ---------------------------------------------------------------------------
# Chunks
# ---------------------------------------------------------------------------


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

    attachments_result = await session.execute(select(Attachment))
    all_attachments = attachments_result.scalars().all()
    attachment_map = {a.id: a.original_filename for a in all_attachments}

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
        "admin/chunks.html",
        {
            "request": request,
            "active": "chunks",
            "rows": rows,
            "attachments": all_attachments,
            "selected_attachment_id": attachment_id,
            "page": page,
            "total_pages": total_pages,
            "total": total,
        },
    )


@router.post("/chunks/{chunk_id}/delete", dependencies=[Depends(_require_auth)])
async def delete_chunk(
    chunk_id: int,
    session: AsyncSession = Depends(get_session),
    attachment_id: int | None = Form(default=None),
    page: int = Form(default=1),
):
    chunk = await session.get(Chunk, chunk_id)
    if not chunk:
        return JSONResponse({"error": "Chunk not found."}, status_code=422)
    await session.delete(chunk)
    await session.commit()

    qs_parts = []
    if attachment_id:
        qs_parts.append(f"attachment_id={attachment_id}")
    if page > 1:
        qs_parts.append(f"page={page}")
    qs = ("?" + "&".join(qs_parts)) if qs_parts else ""
    return JSONResponse({"success": "Chunk deleted.", "redirect": f"/admin/chunks{qs}"})
