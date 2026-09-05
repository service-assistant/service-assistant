from typing import Annotated

from app.config import Settings, get_settings
from app.dependencies.auth import CurrentOrganizationDependency
from app.dependencies.database import DbSessionDependency
from app.dependencies.entities import ThreadDependency
from app.models import ChatThread
from app.repositories import DeviceRepository, ThreadRepository
from app.schemas import ChatThreadRead, DeviceRead, MessageCreate, ThreadCreate
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.services import chat

# Debug-only tool for tracing the RAG chat pipeline (route/retrieval/plan
# steps). Operates on the app_admin's own (system) org, never a real
# tenant's data — gate applied in main.py's include_router call, not here.
router = APIRouter()


@router.get(
    "/devices",
    response_model=list[DeviceRead],
    summary="List devices",
    description="Returns all devices in the app_admin's organization.",
)
async def list_devices(
    session: DbSessionDependency, organization_id: CurrentOrganizationDependency
):
    return await DeviceRepository(session, organization_id).list()


@router.post(
    "/threads",
    status_code=status.HTTP_201_CREATED,
    response_model=ChatThreadRead,
    summary="Create a chat thread",
    description="Creates a new chat thread for a specific device.",
    responses={404: {"description": "Device not found"}},
)
async def create_thread(
    body: ThreadCreate,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    if not await DeviceRepository(session, organization_id).get(body.device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    thread = ChatThread(**body.model_dump())
    return await ThreadRepository(session, organization_id).add(thread)


@router.post(
    "/threads/{thread_id}/messages",
    response_class=StreamingResponse,
    summary="Send a message",
    description=(
        "Appends a user message to the thread and streams the RAG pipeline's "
        "route/retrieval/plan debug events alongside the LLM reply via SSE."
    ),
    responses={
        200: {"description": "SSE stream of debug, chunk, and message events"},
        404: {"description": "Thread not found"},
    },
)
async def create_message(
    thread: ThreadDependency,
    body: MessageCreate,
    settings: Annotated[Settings, Depends(get_settings)],
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    return await chat.stream_chat_message(
        thread, body, settings, session, organization_id, debug=True
    )
