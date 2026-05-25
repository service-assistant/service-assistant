import json
import mimetypes
import shutil
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.config import Settings, get_settings
from app.database import get_session
from app.models import (
    Attachment,
    AttachmentDevice,
    Brand,
    ChatThread,
    Chunk,
    Device,
    DeviceType,
    Message,
)
from app.routers.attachments import get_unique_filepath
from app.services.ingest import ingest_pdf_to_attachment

router = APIRouter()

_templates_dir = Path(__file__).parent.parent / "templates"
templates = Jinja2Templates(directory=str(_templates_dir))


def _redirect(
    path: str, *, success: str | None = None, error: str | None = None
) -> RedirectResponse:
    params = {}
    if success:
        params["success"] = success
    if error:
        params["error"] = error
    qs = ("?" + urlencode(params)) if params else ""
    return RedirectResponse(f"{path}{qs}", status_code=status.HTTP_303_SEE_OTHER)


def _check_auth(request: Request, settings: Settings) -> RedirectResponse | None:
    if request.cookies.get("admin_token") != settings.auth_token:
        return RedirectResponse("/admin/login", status_code=status.HTTP_303_SEE_OTHER)
    return None


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
        return templates.TemplateResponse(
            "admin/login.html",
            {"request": request, "error": "Invalid token."},
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
    response = RedirectResponse(
        "/admin/documents", status_code=status.HTTP_303_SEE_OTHER
    )
    response.set_cookie("admin_token", token, httponly=True, samesite="lax")
    return response


@router.get("/logout")
async def logout():
    response = RedirectResponse("/admin/login", status_code=status.HTTP_303_SEE_OTHER)
    response.delete_cookie("admin_token")
    return response


# ---------------------------------------------------------------------------
# Images proxy (cookie-auth so browser <img> tags work)
# ---------------------------------------------------------------------------


@router.get("/images/{image_path:path}", response_class=FileResponse)
async def admin_image(
    image_path: str,
    request: Request,
    settings: Settings = Depends(get_settings),
):
    if redirect := _check_auth(request, settings):
        return redirect

    file_path = Path("/") / image_path
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    media_type, _ = mimetypes.guess_type(str(file_path))
    return FileResponse(path=file_path, media_type=media_type or "image/png")


# ---------------------------------------------------------------------------
# Root redirect
# ---------------------------------------------------------------------------


@router.get("", response_class=HTMLResponse)
async def admin_root():
    return RedirectResponse("/admin/documents", status_code=status.HTTP_303_SEE_OTHER)


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


@dataclass
class AttachmentRow:
    attachment: Attachment
    device_names: list[str]


@router.get("/documents", response_class=HTMLResponse)
async def get_documents(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
):
    if redirect := _check_auth(request, settings):
        return redirect

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


@router.post("/documents")
async def post_documents(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
    file: UploadFile = File(...),
    device_ids: list[int] = Form(default=[]),
):
    if redirect := _check_auth(request, settings):
        return redirect

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

    return _redirect(
        "/admin/documents", success=f"'{original_name}' uploaded and indexed."
    )


@router.post("/documents/{attachment_id}/delete")
async def delete_document(
    attachment_id: int,
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
):
    if redirect := _check_auth(request, settings):
        return redirect

    attachment = await session.get(Attachment, attachment_id)
    if not attachment:
        return _redirect("/admin/documents", error="Document not found.")

    file_path = Path(attachment.file_global_path)
    await session.delete(attachment)
    await session.commit()

    if file_path.exists():
        file_path.unlink()

    return _redirect("/admin/documents", success="Document deleted.")


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------


@dataclass
class DeviceRow:
    device: Device
    brand_name: str
    device_type_name: str


@router.get("/devices", response_class=HTMLResponse)
async def get_devices(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
):
    if redirect := _check_auth(request, settings):
        return redirect

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


@router.post("/devices")
async def post_devices(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
    name: str = Form(...),
    brand_id: int = Form(...),
    device_type_id: int = Form(...),
    model_serial_code: str = Form(default=""),
    image_url: str = Form(default=""),
):
    if redirect := _check_auth(request, settings):
        return redirect

    device = Device(
        name=name,
        brand_id=brand_id,
        device_type_id=device_type_id,
        model_serial_code=model_serial_code or None,
        image_url=image_url or None,
    )
    session.add(device)
    await session.commit()
    return _redirect("/admin/devices", success=f"Device '{name}' created.")


@router.post("/devices/{device_id}/delete")
async def delete_device(
    device_id: int,
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
):
    if redirect := _check_auth(request, settings):
        return redirect

    device = await session.get(Device, device_id)
    if not device:
        return _redirect("/admin/devices", error="Device not found.")
    await session.delete(device)
    await session.commit()
    return _redirect("/admin/devices", success="Device deleted.")


# ---------------------------------------------------------------------------
# Brands
# ---------------------------------------------------------------------------


@router.get("/brands", response_class=HTMLResponse)
async def get_brands(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
):
    if redirect := _check_auth(request, settings):
        return redirect

    result = await session.execute(select(Brand))
    return templates.TemplateResponse(
        "admin/brands.html",
        {"request": request, "active": "brands", "brands": result.scalars().all()},
    )


@router.post("/brands")
async def post_brands(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
    name: str = Form(...),
    logo_url: str = Form(default=""),
):
    if redirect := _check_auth(request, settings):
        return redirect

    brand = Brand(name=name, logo_url=logo_url or None)
    session.add(brand)
    await session.commit()
    return _redirect("/admin/brands", success=f"Brand '{name}' created.")


@router.post("/brands/{brand_id}/delete")
async def delete_brand(
    brand_id: int,
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
):
    if redirect := _check_auth(request, settings):
        return redirect

    brand = await session.get(Brand, brand_id)
    if not brand:
        return _redirect("/admin/brands", error="Brand not found.")
    await session.delete(brand)
    await session.commit()
    return _redirect("/admin/brands", success="Brand deleted.")


# ---------------------------------------------------------------------------
# Device Types
# ---------------------------------------------------------------------------


@router.get("/device_types", response_class=HTMLResponse)
async def get_device_types(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
):
    if redirect := _check_auth(request, settings):
        return redirect

    result = await session.execute(select(DeviceType))
    return templates.TemplateResponse(
        "admin/device_types.html",
        {
            "request": request,
            "active": "device_types",
            "device_types": result.scalars().all(),
        },
    )


@router.post("/device_types")
async def post_device_types(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
    name: str = Form(...),
):
    if redirect := _check_auth(request, settings):
        return redirect

    dt = DeviceType(name=name)
    session.add(dt)
    await session.commit()
    return _redirect("/admin/device_types", success=f"Device type '{name}' created.")


@router.post("/device_types/{device_type_id}/delete")
async def delete_device_type(
    device_type_id: int,
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
):
    if redirect := _check_auth(request, settings):
        return redirect

    dt = await session.get(DeviceType, device_type_id)
    if not dt:
        return _redirect("/admin/device_types", error="Device type not found.")
    await session.delete(dt)
    await session.commit()
    return _redirect("/admin/device_types", success="Device type deleted.")


# ---------------------------------------------------------------------------
# Threads
# ---------------------------------------------------------------------------


@dataclass
class ThreadRow:
    thread: ChatThread
    device_name: str
    message_count: int


@router.get("/threads", response_class=HTMLResponse)
async def get_threads(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
):
    if redirect := _check_auth(request, settings):
        return redirect

    threads_result = await session.execute(select(ChatThread))
    all_threads = threads_result.scalars().all()

    devices_result = await session.execute(select(Device))
    device_map = {d.id: d.name for d in devices_result.scalars().all()}

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
        {"request": request, "active": "threads", "threads": rows},
    )


@router.get("/threads/{thread_id}", response_class=HTMLResponse)
async def get_thread_detail(
    thread_id: int,
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
):
    if redirect := _check_auth(request, settings):
        return redirect

    thread = await session.get(ChatThread, thread_id)
    if not thread:
        return _redirect("/admin/threads", error="Thread not found.")

    devices_result = await session.execute(select(Device))
    device_map = {d.id: d.name for d in devices_result.scalars().all()}

    messages_result = await session.execute(
        select(Message).where(Message.thread_id == thread_id)
    )
    messages = messages_result.scalars().all()

    messages_json = json.dumps(
        [
            {
                "id": m.id,
                "sender": m.sender,
                "content": m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
        indent=2,
        ensure_ascii=False,
    )

    return templates.TemplateResponse(
        "admin/thread_detail.html",
        {
            "request": request,
            "active": "threads",
            "thread": thread,
            "device_name": device_map.get(thread.device_id, "?"),
            "messages": messages,
            "messages_json": messages_json,
        },
    )


# ---------------------------------------------------------------------------
# Chunks
# ---------------------------------------------------------------------------


@dataclass
class ChunkRow:
    chunk: Chunk
    attachment_filename: str


@router.get("/chunks", response_class=HTMLResponse)
async def get_chunks(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
    attachment_id: int | None = None,
):
    if redirect := _check_auth(request, settings):
        return redirect

    attachments_result = await session.execute(select(Attachment))
    all_attachments = attachments_result.scalars().all()
    attachment_map = {a.id: a.original_filename for a in all_attachments}

    query = select(Chunk).order_by(Chunk.attachment_id, Chunk.id)
    if attachment_id is not None:
        query = query.where(Chunk.attachment_id == attachment_id)

    chunks_result = await session.execute(query)
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
        },
    )
