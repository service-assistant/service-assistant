import asyncio
import json
import re
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

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


_SENTENCE_END = re.compile(r"(?<=[.!?…])\s+")
_MIN_SENTENCE_CHARS = 20


def _extract_sentences(buffer: str) -> tuple[list[str], str]:
    """Return (complete_sentences, remaining_buffer) splitting on sentence boundaries."""
    sentences: list[str] = []
    pos = 0
    for m in _SENTENCE_END.finditer(buffer):
        s = buffer[pos : m.start()].strip()
        if len(s) >= _MIN_SENTENCE_CHARS:
            sentences.append(s)
            pos = m.end()
    return sentences, buffer[pos:]


async def _synthesize_and_enqueue(
    idx: int,
    text: str,
    queue: asyncio.Queue[tuple[int, bytes | None]],
    settings: Settings,
) -> None:
    try:
        pcm = await tts.synthesize_pcm(text, settings)
        await queue.put((idx, pcm))
    except tts.TtsError:
        await queue.put((idx, None))


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

    user_message = Message(
        content=body.content,
        thread_id=thread_id,
        sender=MessageSender.user,
    )
    session.add(user_message)
    await session.flush()

    retrieved_chunks = await retrieval.retrieve_context_chunks(
        session, body.content, device_id=device_id, settings=settings
    )
    context_chunks = [chunk["content"] for chunk in retrieved_chunks]

    async def event_stream():
        answer_parts: list[str] = []
        sentence_buffer = ""
        sentence_idx = 0
        tts_enabled = bool(settings.gemini_api_key)
        audio_queue: asyncio.Queue[tuple[int, bytes | None]] = asyncio.Queue()
        tts_tasks: list[asyncio.Task[None]] = []

        async for chunk in llm.stream_query(
            session, thread_id, body.content, context_chunks, settings
        ):
            answer_parts.append(chunk)
            yield _sse("chunk", chunk)
            if tts_enabled:
                sentence_buffer += chunk
                sentences, sentence_buffer = _extract_sentences(sentence_buffer)
                for sentence in sentences:
                    task = asyncio.create_task(
                        _synthesize_and_enqueue(
                            sentence_idx, sentence, audio_queue, settings
                        )
                    )
                    tts_tasks.append(task)
                    sentence_idx += 1

        answer = "".join(answer_parts)

        if tts_enabled and sentence_buffer.strip():
            task = asyncio.create_task(
                _synthesize_and_enqueue(
                    sentence_idx, sentence_buffer.strip(), audio_queue, settings
                )
            )
            tts_tasks.append(task)
            sentence_idx += 1

        system_message = Message(
            content=answer,
            thread_id=thread_id,
            sender=MessageSender.system,
        )
        session.add(system_message)
        await session.commit()
        await session.refresh(system_message)
        assert system_message.id is not None
        for chunk in retrieved_chunks:
            session.add(
                ChunkMessage(message_id=system_message.id, chunk_id=chunk["id"])
            )
        await session.commit()
        await session.refresh(system_message)

        if tts_tasks:
            total = len(tts_tasks)
            pending: dict[int, bytes | None] = {}
            next_to_emit = 0
            received = 0
            while received < total:
                idx, pcm = await audio_queue.get()
                received += 1
                pending[idx] = pcm
                while next_to_emit in pending:
                    audio = pending.pop(next_to_emit)
                    if audio is not None:
                        for payload in tts.iter_audio_chunk_payloads(audio):
                            yield _sse(
                                "audio_chunk", {**payload, "sentence": next_to_emit}
                            )
                        yield _sse(
                            "audio_done",
                            {
                                **tts.audio_done_payload(total_bytes=len(audio)),
                                "sentence": next_to_emit,
                            },
                        )
                    next_to_emit += 1

        yield _sse(
            "message", MessageRead.model_validate(system_message).model_dump_json()
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
