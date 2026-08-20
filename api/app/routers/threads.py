import asyncio
import json
from contextlib import suppress
from typing import Annotated

from app.config import Settings, get_settings
from app.database import get_session
from app.dependencies.auth import CurrentOrganizationDependency
from app.dependencies.database import DbSessionDependency
from app.dependencies.entities import ThreadDependency
from app.models import ChatThread
from app.repositories import (
    DeviceRepository,
    MessageRepository,
    SessionRepository,
    ThreadRepository,
    UserRepository,
)
from app.schemas import (
    ChatThreadRead,
    MessageCreate,
    MessageRead,
    PhotoContextResponse,
    ThreadCreate,
    TranscriptDecision,
    TranscriptResponse,
)
from app.services import chat, photo_context, stt, voice_query_selector
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()
# WebSocket handshakes carry no cookies/Authorization header, so this route
# can't use the cookie/header-based auth dependency chain (get_current_user
# reads from `Request`) — it authenticates via a `token` query param instead
# and does its own role check. Kept on a separate router so the REST router
# above can carry a single router-level `Depends(require_org_admin)` in
# main.py without applying it here.
websocket_router = APIRouter()

_ALLOWED_PHOTO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_PHOTO_BYTES = 10 * 1024 * 1024


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=ChatThreadRead,
    summary="Create a chat thread",
    description="Creates a new chat thread for a specific device. Each thread holds an independent conversation history.",
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
    "/{thread_id}/photo-context",
    response_model=PhotoContextResponse,
    summary="Extract concise context from technician photos",
    description=(
        "Uses the chat vision model to extract only the visible component type and "
        "one primary identifier per photo for subsequent RAG retrieval."
    ),
)
async def create_photo_context(
    thread: ThreadDependency,
    settings: Annotated[Settings, Depends(get_settings)],
    question: str = Form(default=""),
    photos: list[UploadFile] = File(...),
):
    if not photos or len(photos) > photo_context.MAX_CHAT_PHOTOS:
        raise HTTPException(
            status_code=400,
            detail=f"Upload between 1 and {photo_context.MAX_CHAT_PHOTOS} photos",
        )

    photo_inputs: list[photo_context.PhotoInput] = []
    for photo in photos:
        if photo.content_type not in _ALLOWED_PHOTO_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Photos must be JPEG, PNG, or WebP images",
            )
        image_bytes = await photo.read(_MAX_PHOTO_BYTES + 1)
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Photo is empty")
        if len(image_bytes) > _MAX_PHOTO_BYTES:
            raise HTTPException(status_code=413, detail="Photo is too large")
        photo_inputs.append(
            photo_context.PhotoInput(
                content=image_bytes,
                media_type=photo.content_type,
            )
        )

    try:
        observations = await photo_context.analyze_photos(
            photo_inputs, question, settings
        )
    except photo_context.PhotoContextTimeoutError as error:
        raise HTTPException(status_code=504, detail=str(error)) from error
    except photo_context.PhotoContextError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return PhotoContextResponse(observations=observations)


@router.get(
    "",
    response_model=list[ChatThreadRead],
    summary="List chat threads",
    description="Returns all chat threads across all devices.",
)
async def list_threads(
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    return await ThreadRepository(session, organization_id).list()


@router.get(
    "/{thread_id}",
    response_model=ChatThreadRead,
    summary="Get a chat thread",
    description="Returns a single chat thread by its ID.",
    responses={404: {"description": "Thread not found"}},
)
async def get_thread(thread: ThreadDependency):
    return thread


@router.delete(
    "/{thread_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a chat thread",
    description="Permanently deletes a thread and all its messages (cascade).",
    responses={404: {"description": "Thread not found"}},
)
async def delete_thread(
    thread: ThreadDependency,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    await ThreadRepository(session, organization_id).delete(thread)


@router.post(
    "/{thread_id}/messages",
    response_class=StreamingResponse,
    summary="Send a message",
    description=(
        "Appends a user message to the thread, then runs a RAG pipeline: "
        "embeds the question, retrieves the most relevant document chunks for the thread's device, "
        "and streams the LLM reply via Server-Sent Events. "
        "Emits `chunk` events for each text fragment and a final `message` event "
        "with the persisted assistant Message as JSON."
    ),
    responses={
        200: {"description": "SSE stream of chunk and message events"},
        404: {"description": "Thread not found"},
    },
)
async def create_message(
    thread: ThreadDependency,
    body: MessageCreate,
    settings: Annotated[Settings, Depends(get_settings)],
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
    debug: bool = Query(
        default=False,
        description="Emit diagnostic pipeline details as `debug` SSE events.",
    ),
):
    return await chat.stream_chat_message(
        thread, body, settings, session, organization_id, debug
    )


@router.post(
    "/{thread_id}/messages/transcribe",
    response_model=TranscriptResponse,
    summary="Transcribe voice message",
    description=(
        "Transcribes an uploaded recording, then uses the configured chat model to "
        "select the technician's intended query from the full transcript."
    ),
    responses={
        404: {"description": "Thread not found"},
        422: {"description": "Invalid or empty audio"},
        502: {"description": "STT provider error"},
    },
)
async def transcribe_message(
    thread: ThreadDependency,
    audio: UploadFile = File(..., description="Recorded audio (e.g. m4a)."),
    settings: Annotated[Settings, Depends(get_settings)] = None,  # type: ignore
):
    audio_bytes = await audio.read()
    content_type = audio.content_type or "audio/m4a"

    try:
        full_transcript = await stt.transcribe(
            audio_bytes,
            content_type,
            settings,
            filename=audio.filename or "recording.m4a",
        )
    except stt.SttError as exc:
        detail = str(exc)
        if "Empty" in detail:
            raise HTTPException(status_code=422, detail=detail) from exc
        raise HTTPException(status_code=502, detail=detail) from exc

    try:
        selection = await voice_query_selector.select_technician_query(
            full_transcript, settings
        )
    except voice_query_selector.VoiceQuerySelectorError:
        selection = None

    transcript = voice_query_selector.selected_text_or_full_transcript(
        full_transcript, selection
    )
    return TranscriptResponse(
        decision=TranscriptDecision.accept,
        transcript=transcript,
        message=None,
    )


@websocket_router.websocket("/{thread_id}/messages/transcribe-stream")
async def transcribe_stream(
    thread_id: int,
    websocket: WebSocket,
    settings: Annotated[Settings, Depends(get_settings)],
    session: AsyncSession = Depends(get_session),
    token: str = "",
    encoding: str = "linear16",
    sample_rate: int = 16000,
):
    # No cookies/Authorization header for a raw WebSocket handshake from the
    # Expo app, so the session token travels as a query param instead — same
    # spot the old shared AUTH_TOKEN used to go.
    user_session = await SessionRepository(session).get_active_session_by_token(token)
    user = (
        await UserRepository(session).get_by_id(user_session.user_id)
        if user_session
        else None
    )
    if user is None:
        await websocket.close(code=1008, reason="Unauthorized")
        return
    target_organization_id = user.organization_id

    await websocket.accept()

    thread = await ThreadRepository(session, target_organization_id).get(thread_id)
    if not thread:
        await websocket.send_json({"type": "error", "message": "Thread not found"})
        await websocket.close()
        return

    try:
        async with stt.deepgram_websocket(settings, encoding, sample_rate) as dg_ws:

            async def forward_audio() -> None:
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await dg_ws.send(data)
                except WebSocketDisconnect:
                    pass
                finally:
                    with suppress(Exception):
                        await dg_ws.send(json.dumps({"type": "CloseStream"}))

            async def forward_transcripts() -> None:
                try:
                    async for raw in dg_ws:
                        event = stt.parse_deepgram_stream_message(raw)
                        if event:
                            with suppress(Exception):
                                await websocket.send_json(event)
                except Exception:
                    pass

            audio_task = asyncio.create_task(forward_audio())
            transcript_task = asyncio.create_task(forward_transcripts())
            audio_task.add_done_callback(lambda _: transcript_task.cancel())
            transcript_task.add_done_callback(lambda _: audio_task.cancel())
            await asyncio.gather(audio_task, transcript_task, return_exceptions=True)

    except stt.SttError as exc:
        with suppress(Exception):
            await websocket.send_json({"type": "error", "message": str(exc)})
    finally:
        with suppress(Exception):
            await websocket.close()


@router.get(
    "/{thread_id}/messages",
    response_model=list[MessageRead],
    summary="List messages in a thread",
    description="Returns all messages in a thread ordered chronologically (oldest first).",
    responses={404: {"description": "Thread not found"}},
)
async def list_messages(
    thread: ThreadDependency,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    return await MessageRepository(session, organization_id).list_for_thread(thread.id)
