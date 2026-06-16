import mimetypes
from dataclasses import dataclass
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.routers.attachments import list_attachments
from app.routers.brands import list_brands
from app.routers.device_types import list_device_types
from app.routers.devices import list_devices
from app.routers.threads import list_threads

router = APIRouter()

_templates_dir = Path(__file__).parent.parent / "templates"
templates = Jinja2Templates(directory=str(_templates_dir))


async def _require_auth(
    request: Request, settings: Settings = Depends(get_settings)
) -> None:
    if request.cookies.get("admin_token") != settings.auth_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


@router.get("/login", response_class=HTMLResponse)
async def get_login(request: Request):
    return templates.TemplateResponse("admin/login.html", {"request": request})


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
    response.set_cookie("admin_token", token, httponly=True, samesite="lax")
    return response


@router.get("/logout")
async def logout():
    response = RedirectResponse(url="/admin/login", status_code=303)
    response.delete_cookie("admin_token")
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
        "admin/documents.html",
        {
            "request": request,
            "active": "documents",
            "attachments": rows,
            "devices": all_devices,
        },
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
        "admin/devices.html",
        {
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
        "admin/device_edit.html",
        {
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
        "admin/brands.html",
        {
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
        "admin/brand_edit.html",
        {"request": request, "active": "brands", "brand": brand},
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
        "admin/device_types.html",
        {
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
        "admin/device_type_edit.html",
        {"request": request, "active": "device_types", "device_type": dt},
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
        "admin/threads.html",
        {
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
        "admin/thread_detail.html",
        {
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
        "admin/chunks.html",
        {
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
