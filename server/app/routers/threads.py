import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import Settings, get_settings
from app.database import get_session
from app.models import ChatThread, ChunkMessage, Device, Message, MessageSender
from app.schemas import (
    ChatThreadRead,
    MessageCreate,
    MessageRead,
    ThreadCreate,
    TranscriptResponse,
)
from app.services import retrieval, llm, next_best_step, stt
from fastapi import WebSocket, WebSocketDisconnect
from contextlib import suppress

router = APIRouter()


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
    session: AsyncSession = Depends(get_session),
):
    device = await session.get(Device, body.device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    thread = ChatThread(**body.model_dump())
    session.add(thread)
    await session.commit()
    await session.refresh(thread)
    return thread


@router.get(
    "",
    response_model=list[ChatThreadRead],
    summary="List chat threads",
    description="Returns all chat threads across all devices.",
)
async def list_threads(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(ChatThread))
    return result.scalars().all()


@router.get(
    "/{thread_id}",
    response_model=ChatThreadRead,
    summary="Get a chat thread",
    description="Returns a single chat thread by its ID.",
    responses={404: {"description": "Thread not found"}},
)
async def get_thread(thread_id: int, session: AsyncSession = Depends(get_session)):
    thread = await session.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


@router.delete(
    "/{thread_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a chat thread",
    description="Permanently deletes a thread and all its messages (cascade).",
    responses={404: {"description": "Thread not found"}},
)
async def delete_thread(thread_id: int, session: AsyncSession = Depends(get_session)):
    thread = await session.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    await session.delete(thread)
    await session.commit()


def _sse(event: str, payload: object) -> str:
    if isinstance(payload, str):
        data = payload
    else:
        data = json.dumps(payload, ensure_ascii=False)
    return f"event: {event}\ndata: {data}\n\n"


_CONTINUATION_HINTS = {"kontynuuj", "dalej", "rozwiń", "więcej", "ciągnij"}


def _looks_like_continuation(content: str) -> bool:
    lower = content.lower().strip()
    return len(lower.split()) <= 4 or any(hint in lower for hint in _CONTINUATION_HINTS)


def _is_explicit_continuation(content: str) -> bool:
    normalized = content.lower().strip().rstrip(".!?")
    return normalized in {"co dalej", "dalej", "kontynuuj"}


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
    thread_id: int,
    body: MessageCreate,
    settings: Annotated[Settings, Depends(get_settings)],
    session: AsyncSession = Depends(get_session),
):
    thread = await session.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    device_id = thread.device_id

    latest_system_message = await session.scalar(
        select(Message)
        .where(Message.thread_id == thread.id)
        .where(Message.sender == MessageSender.assistant)
        .order_by(Message.created_at.desc())
        .limit(1)
        .options(selectinload(Message.chunks))
    )

    might_continue = latest_system_message is not None and _looks_like_continuation(
        body.content
    )

    if might_continue and not _is_explicit_continuation(body.content):
        is_continuation, fresh_chunks = await asyncio.gather(
            llm.is_message_continuation_request(body.content, settings),
            retrieval.retrieve_context_chunks(
                session,
                body.content,
                device_id=device_id,
                settings=settings,
            ),
        )
    else:
        is_continuation = might_continue
        fresh_chunks = await retrieval.retrieve_context_chunks(
            session,
            body.content,
            device_id=device_id,
            settings=settings,
        )

    if is_continuation and latest_system_message and latest_system_message.chunks:
        retrieved_chunks = [
            {
                "id": c.id,
                "content": c.content,
                "attachment_id": c.attachment_id,
                "extra_metadata": c.extra_metadata,
            }
            for c in latest_system_message.chunks
        ]
    else:
        retrieved_chunks = fresh_chunks

    context_chunks = [chunk["content"] for chunk in retrieved_chunks]

    ranked_plan = ""
    if body.diagnostic_mode_2002 and next_best_step.is_supported_question(body.content):
        ranked_plan = await next_best_step.build_ranked_plan(context_chunks, settings)
    elif (
        body.diagnostic_mode_2002
        and latest_system_message
        and latest_system_message.chunks
    ):
        recent_messages = list(
            (
                await session.scalars(
                    select(Message)
                    .where(Message.thread_id == thread.id)
                    .order_by(Message.created_at.desc())
                    .limit(8)
                )
            ).all()
        )
        has_recent_2002_question = any(
            message.sender == MessageSender.user
            and next_best_step.is_supported_question(message.content)
            for message in recent_messages
        )
        if has_recent_2002_question:
            diagnostic_chunks = [
                {
                    "id": chunk.id,
                    "content": chunk.content,
                    "attachment_id": chunk.attachment_id,
                    "extra_metadata": chunk.extra_metadata,
                }
                for chunk in latest_system_message.chunks
            ]
            (
                is_diagnostic_result,
                followup_plan,
            ) = await next_best_step.build_followup_plan(
                [chunk["content"] for chunk in diagnostic_chunks],
                latest_system_message.content,
                body.content,
                settings,
            )
            if is_diagnostic_result:
                retrieved_chunks = diagnostic_chunks
                context_chunks = [chunk["content"] for chunk in diagnostic_chunks]
                ranked_plan = followup_plan

    user_message = Message(
        content=body.content,
        thread_id=thread_id,
        sender=MessageSender.user,
    )
    session.add(user_message)
    await session.commit()

    continuation_hint = (
        llm.continuation_target(latest_system_message.content)
        if is_continuation and latest_system_message
        else ""
    )

    async def event_stream():
        answer_parts: list[str] = []

        async for chunk in llm.stream_query(
            session,
            thread_id,
            body.content,
            context_chunks,
            settings,
            exclude_message_id=user_message.id,
            ranked_plan=ranked_plan,
            continuation_requested=is_continuation,
            continuation_hint=continuation_hint,
        ):
            answer_parts.append(chunk)
            yield _sse("chunk", chunk)

        answer = "".join(answer_parts)
        answer = llm.promote_bare_checklist(answer)
        if is_continuation:
            answer = llm.ensure_continuation_intro(answer)
        answer = llm.clean_completion_notice(answer)
        answer = llm.limit_checklist_items(answer)
        has_continuation = llm.has_continuation_marker(answer)

        assistant_message = Message(
            content=answer,
            thread_id=thread_id,
            sender=MessageSender.assistant,
            has_continuation=has_continuation,
        )
        session.add(assistant_message)
        await session.flush()

        if not llm.is_no_source_answer(answer) and not llm.is_completion_only_answer(
            answer
        ):
            for chunk in retrieved_chunks:
                session.add(
                    ChunkMessage(message_id=assistant_message.id, chunk_id=chunk["id"])
                )

        await session.commit()

        yield _sse(
            "message", MessageRead.model_validate(assistant_message).model_dump_json()
        )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post(
    "/{thread_id}/messages/transcribe",
    response_model=TranscriptResponse,
    summary="Transcribe voice message",
    description=(
        "Accepts an audio file, runs Deepgram STT on the server, "
        "and returns the transcript. Does not call the LLM — "
        "send the transcript via POST /{thread_id}/messages (JSON + SSE)."
    ),
    responses={
        404: {"description": "Thread not found"},
        422: {"description": "Invalid or empty audio"},
        502: {"description": "STT provider error"},
    },
)
async def transcribe_message(
    thread_id: int,
    audio: UploadFile = File(..., description="Recorded audio (e.g. m4a)."),
    settings: Annotated[Settings, Depends(get_settings)] = None,  # type: ignore
    session: AsyncSession = Depends(get_session),
):
    thread = await session.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    audio_bytes = await audio.read()
    content_type = audio.content_type or "audio/m4a"

    try:
        transcript = await stt.transcribe(audio_bytes, content_type, settings)
    except stt.SttError as exc:
        detail = str(exc)
        if "Empty" in detail:
            raise HTTPException(status_code=422, detail=detail) from exc
        raise HTTPException(status_code=502, detail=detail) from exc

    return TranscriptResponse(transcript=transcript)


@router.websocket("/{thread_id}/messages/transcribe-stream")
async def transcribe_stream(
    thread_id: int,
    websocket: WebSocket,
    settings: Annotated[Settings, Depends(get_settings)],
    session: AsyncSession = Depends(get_session),
    token: str = "",
    encoding: str = "linear16",
    sample_rate: int = 16000,
):
    if token != settings.auth_token:
        await websocket.close(code=1008, reason="Unauthorized")
        return

    await websocket.accept()

    thread = await session.get(ChatThread, thread_id)
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
async def list_messages(thread_id: int, session: AsyncSession = Depends(get_session)):
    thread = await session.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return (
        await session.scalars(
            select(Message)
            .where(Message.thread_id == thread_id)
            .order_by(Message.created_at)
        )
    ).all()
