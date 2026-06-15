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
from app.services import retrieval, llm, stt, tts
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


async def _synthesize_and_enqueue(
    idx: int,
    text: str,
    queue: asyncio.Queue[tuple[int, bytes | None, str | None]],
    settings: Settings,
) -> None:
    try:
        pcm = await tts.synthesize_pcm(text, settings)
        await queue.put((idx, pcm, None))
    except tts.TtsError as exc:
        await queue.put((idx, None, str(exc)))


def _drain_ready_audio(
    audio_queue: asyncio.Queue[tuple[int, bytes | None, str | None]],
    pending: dict[int, tuple[bytes | None, str | None]],
    next_to_emit: int,
) -> tuple[list[str], int]:
    while not audio_queue.empty():
        idx, pcm, err = audio_queue.get_nowait()
        pending[idx] = (pcm, err)
    events: list[str] = []
    while next_to_emit in pending:
        audio, err = pending.pop(next_to_emit)
        if audio is not None:
            for payload in tts.iter_audio_chunk_payloads(audio):
                events.append(
                    _sse("audio_chunk", {**payload, "sentence": next_to_emit})
                )
            events.append(
                _sse(
                    "audio_done",
                    {
                        **tts.audio_done_payload(total_bytes=len(audio)),
                        "sentence": next_to_emit,
                    },
                )
            )
        elif err is not None:
            events.append(_sse("tts_error", {"sentence": next_to_emit, "detail": err}))
        next_to_emit += 1
    return events, next_to_emit


def _sse(event: str, payload: object) -> str:
    if isinstance(payload, str):
        data = payload
    else:
        data = json.dumps(payload, ensure_ascii=False)
    return f"event: {event}\ndata: {data}\n\n"


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
        .options(selectinload(Message.chunks))
    )

    continue_latest_message: bool = False
    if latest_system_message:
        continue_latest_message = await llm.is_message_continuation_request(
            body.content, settings
        )

    retrieved_chunks = []
    if latest_system_message and continue_latest_message:
        # Reuse chunks from previous message in continuation
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
        retrieved_chunks = await retrieval.retrieve_context_chunks(
            session, body.content, device_id=device_id, settings=settings
        )

    context_chunks = [chunk["content"] for chunk in retrieved_chunks]

    async def event_stream():
        answer_parts: list[str] = []
        sentence_buffer = ""
        sentence_idx = 0
        tts_enabled = bool(settings.gemini_api_key)
        audio_queue: asyncio.Queue[tuple[int, bytes | None, str | None]] = (
            asyncio.Queue()
        )
        tts_tasks: list[asyncio.Task[None]] = []

        pending: dict[int, tuple[bytes | None, str | None]] = {}
        next_to_emit = 0

        async for chunk in llm.stream_query(
            session, thread_id, body.content, context_chunks, settings
        ):
            answer_parts.append(chunk)
            yield _sse("chunk", chunk)
            if tts_enabled:
                sentence_buffer += chunk
                sentences, sentence_buffer = tts.extract_sentences(sentence_buffer)
                for sentence in sentences:
                    tts_tasks.append(
                        asyncio.create_task(
                            _synthesize_and_enqueue(
                                sentence_idx, sentence, audio_queue, settings
                            )
                        )
                    )
                    sentence_idx += 1
                events, next_to_emit = _drain_ready_audio(
                    audio_queue, pending, next_to_emit
                )
                for ev in events:
                    yield ev

        answer = "".join(answer_parts)

        if tts_enabled and sentence_buffer.strip():
            tts_tasks.append(
                asyncio.create_task(
                    _synthesize_and_enqueue(
                        sentence_idx, sentence_buffer.strip(), audio_queue, settings
                    )
                )
            )
            sentence_idx += 1

        user_message = Message(
            content=body.content,
            thread_id=thread_id,
            sender=MessageSender.user,
        )
        session.add(user_message)

        assistant_message = Message(
            content=answer,
            thread_id=thread_id,
            sender=MessageSender.assistant,
        )
        session.add(assistant_message)
        await session.flush()

        if not llm.is_no_source_answer(answer):
            for chunk in retrieved_chunks:
                session.add(
                    ChunkMessage(message_id=assistant_message.id, chunk_id=chunk["id"])
                )

        await session.commit()

        total_tts = len(tts_tasks)
        while next_to_emit < total_tts:
            events, next_to_emit = _drain_ready_audio(
                audio_queue, pending, next_to_emit
            )
            for ev in events:
                yield ev
            if next_to_emit < total_tts:
                idx, pcm, err = await audio_queue.get()
                pending[idx] = (pcm, err)

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
