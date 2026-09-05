from typing import Annotated

from app.config import Settings, get_settings
from app.dependencies.database import DbSessionDependency
from app.models import (
    Attachment,
    Category,
    ChatThread,
    Chunk,
    ChunkMessage,
    Device,
    Message,
    Organization,
)
from app.schemas import (
    DebugMessageDeviceRead,
    DebugMessageRead,
    DebugMessageThreadRead,
    MessageCreate,
    ThreadCreate,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.services import chat

router = APIRouter()


def _thread_row(
    thread: ChatThread,
    device: Device,
    organization: Organization,
    message_count: int,
    last_message_at,
):
    return {
        "id": thread.id,
        "title": thread.title,
        "device_id": device.id,
        "device_name": device.name,
        "organization_id": organization.id,
        "organization_name": organization.name,
        "organization_slug": organization.slug,
        "message_count": message_count,
        "last_message_at": last_message_at,
        "created_at": thread.created_at,
        "updated_at": thread.updated_at,
    }


def _thread_query():
    return (
        select(
            ChatThread,
            Device,
            Organization,
            func.count(Message.id),
            func.max(Message.created_at),
        )
        .join(Device, Device.id == ChatThread.device_id)
        .join(Category, Category.id == Device.category_id)
        .join(Organization, Organization.id == Category.organization_id)
        .outerjoin(Message, Message.thread_id == ChatThread.id)
        .group_by(ChatThread.id, Device.id, Organization.id)
    )


async def _get_thread(session: DbSessionDependency, thread_id: int):
    row = (
        await session.execute(_thread_query().where(ChatThread.id == thread_id))
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Thread not found")
    return row


@router.get(
    "/devices",
    response_model=list[DebugMessageDeviceRead],
    summary="List devices available when creating a debug chat thread",
)
async def list_message_devices(session: DbSessionDependency):
    rows = (
        await session.execute(
            select(Device, Organization)
            .join(Category, Category.id == Device.category_id)
            .join(Organization, Organization.id == Category.organization_id)
            .order_by(Organization.name, Device.name, Device.id)
        )
    ).all()
    return [
        {
            "id": device.id,
            "name": device.name,
            "model_serial_code": device.model_serial_code,
            "organization_id": organization.id,
            "organization_name": organization.name,
            "organization_slug": organization.slug,
        }
        for device, organization in rows
    ]


@router.get(
    "/threads",
    response_model=list[DebugMessageThreadRead],
    summary="List all chat threads newest first",
)
async def list_message_threads(
    session: DbSessionDependency,
    search: str | None = Query(default=None, max_length=200),
):
    query = _thread_query().order_by(ChatThread.created_at.desc(), ChatThread.id.desc())
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(
            ChatThread.title.ilike(pattern)
            | Device.name.ilike(pattern)
            | Organization.name.ilike(pattern)
            | Organization.slug.ilike(pattern)
        )
    rows = (await session.execute(query)).all()
    return [_thread_row(*row) for row in rows]


@router.post(
    "/threads",
    status_code=status.HTTP_201_CREATED,
    response_model=DebugMessageThreadRead,
    summary="Create a chat thread for any device",
)
async def create_message_thread(body: ThreadCreate, session: DbSessionDependency):
    device_row = (
        await session.execute(
            select(Device, Organization)
            .join(Category, Category.id == Device.category_id)
            .join(Organization, Organization.id == Category.organization_id)
            .where(Device.id == body.device_id)
        )
    ).one_or_none()
    if device_row is None:
        raise HTTPException(status_code=404, detail="Device not found")

    device, organization = device_row
    thread = ChatThread(**body.model_dump())
    session.add(thread)
    await session.commit()
    await session.refresh(thread)
    return _thread_row(thread, device, organization, 0, None)


@router.get(
    "/threads/{thread_id}",
    response_model=DebugMessageThreadRead,
    summary="Get a chat thread",
)
async def get_message_thread(thread_id: int, session: DbSessionDependency):
    return _thread_row(*(await _get_thread(session, thread_id)))


@router.get(
    "/threads/{thread_id}/messages",
    response_model=list[DebugMessageRead],
    summary="List messages with the chunks, sources, and schematics used in each answer",
)
async def list_thread_messages(thread_id: int, session: DbSessionDependency):
    await _get_thread(session, thread_id)
    messages = list(
        (
            await session.execute(
                select(Message)
                .where(Message.thread_id == thread_id)
                .order_by(Message.created_at, Message.id)
            )
        )
        .scalars()
        .all()
    )
    if not messages:
        return []

    chunk_rows = (
        await session.execute(
            select(ChunkMessage.message_id, Chunk, Attachment.original_filename)
            .join(Chunk, Chunk.id == ChunkMessage.chunk_id)
            .join(Attachment, Attachment.id == Chunk.attachment_id)
            .where(ChunkMessage.message_id.in_([message.id for message in messages]))
            .order_by(ChunkMessage.message_id, Chunk.id)
        )
    ).all()
    chunks_by_message: dict[int, list[dict]] = {}
    for message_id, chunk, attachment_name in chunk_rows:
        chunks_by_message.setdefault(message_id, []).append(
            {
                "id": chunk.id,
                "attachment_id": chunk.attachment_id,
                "attachment_name": attachment_name,
                "content": chunk.content,
                "metadata": chunk.extra_metadata,
            }
        )

    return [
        {
            "id": message.id,
            "content": message.content,
            "sender": message.sender,
            "has_continuation": message.has_continuation,
            "router_decision": message.router_decision,
            "thread_id": message.thread_id,
            "created_at": message.created_at,
            "updated_at": message.updated_at,
            "chunks": chunks_by_message.get(message.id, []),
        }
        for message in messages
    ]


@router.post(
    "/threads/{thread_id}/messages",
    response_class=StreamingResponse,
    summary="Send a message in an existing thread",
)
async def create_thread_message(
    thread_id: int,
    body: MessageCreate,
    settings: Annotated[Settings, Depends(get_settings)],
    session: DbSessionDependency,
):
    thread, _, organization, _, _ = await _get_thread(session, thread_id)
    return await chat.stream_chat_message(
        thread, body, settings, session, organization.id, debug=False
    )
