import asyncio
import json
import time
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import Settings, get_settings
from app.database import get_session
from app.models import (
    ChatThread,
    ChunkMessage,
    Device,
    Message,
    MessageSender,
)
from app.schemas import (
    ChatThreadRead,
    MessageCreate,
    MessageRead,
    ThreadCreate,
    TranscriptDecision,
    TranscriptResponse,
)
from app.services import (
    llm,
    message_router,
    next_best_step,
    retrieval,
    streaming,
    stt,
    voice_query_selector,
)
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
    normalized_data = data.replace("\r\n", "\n").replace("\r", "\n")
    data_lines = "\n".join(f"data: {line}" for line in normalized_data.split("\n"))
    return f"event: {event}\n{data_lines}\n\n"


_CONTINUATION_HINTS = {"kontynuuj", "dalej", "rozwiń", "więcej", "ciągnij"}


def _looks_like_continuation(content: str) -> bool:
    lower = content.lower().strip()
    return len(lower.split()) <= 4 or any(hint in lower for hint in _CONTINUATION_HINTS)


def _is_explicit_continuation(content: str) -> bool:
    normalized = content.lower().strip().rstrip(".!?")
    return normalized in {"co dalej", "dalej", "kontynuuj"}


def _diagnostic_plan_cache_key(message: Message) -> str:
    return f"{message.thread_id}:{message.id}"


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
    debug: bool = Query(
        default=False,
        description="Emit diagnostic pipeline details as `debug` SSE events.",
    ),
):
    started_at = time.perf_counter()
    thread = await session.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    device_id = thread.device_id

    recent_messages = list(
        (
            await session.scalars(
                select(Message)
                .where(Message.thread_id == thread.id)
                .order_by(Message.created_at.desc())
                .limit(20)
                .options(selectinload(Message.chunks))
            )
        ).all()
    )
    latest_system_message = next(
        (
            message
            for message in recent_messages
            if message.sender == MessageSender.assistant
        ),
        None,
    )
    routing_history: list[message_router.RoutingHistoryMessage] = [
        {
            "id": message.id,
            "sender": message.sender.value,
            "content": message.content[-3000:],
            "has_chunks": bool(message.chunks),
        }
        for message in reversed(recent_messages)
    ]

    route_decision = message_router.RouteDecision(
        route=message_router.MessageRoute.standard_query,
        confidence=1,
        recognized_problem=None,
        diagnostic_message_id=None,
    )
    if body.diagnostic_mode_enabled:
        route_decision = await message_router.route_message(
            body.content,
            settings,
            recent_messages=routing_history,
        )
        if next_best_step.requests_next_action(body.content):
            cached_message_and_plan = next(
                (
                    (message, plan)
                    for message in recent_messages
                    if message.sender == MessageSender.assistant and message.chunks
                    if (
                        plan := next_best_step.get_cached_diagnostic_plan(
                            _diagnostic_plan_cache_key(message)
                        )
                    )
                ),
                None,
            )
            if cached_message_and_plan:
                cached_message, cached_plan = cached_message_and_plan
                route_decision = message_router.RouteDecision(
                    route=message_router.MessageRoute.diagnostic_followup,
                    confidence=1,
                    recognized_problem=cached_plan.problem,
                    diagnostic_message_id=cached_message.id,
                )
    routed_at = time.perf_counter()
    diagnostic_route = route_decision.route
    diagnostic_message = next(
        (
            message
            for message in recent_messages
            if message.id == route_decision.diagnostic_message_id
            and message.sender == MessageSender.assistant
            and message.chunks
        ),
        None,
    )
    current_diagnostic_plan: next_best_step.DiagnosticPlan | None = None
    if diagnostic_message:
        current_diagnostic_plan = next_best_step.get_cached_diagnostic_plan(
            _diagnostic_plan_cache_key(diagnostic_message)
        )
    if (
        diagnostic_route == message_router.MessageRoute.diagnostic_followup
        and current_diagnostic_plan is None
    ):
        diagnostic_route = message_router.MessageRoute.standard_query

    might_continue = latest_system_message is not None and _looks_like_continuation(
        body.content
    )
    has_promised_continuation = bool(
        latest_system_message
        and (
            latest_system_message.has_continuation
            or llm.has_continuation_marker(latest_system_message.content)
        )
    )
    standard_completion_answer = (
        llm.DOCUMENTATION_EXHAUSTED_ANSWER
        if not body.diagnostic_mode_enabled
        and latest_system_message
        and _is_explicit_continuation(body.content)
        and not has_promised_continuation
        else None
    )

    if standard_completion_answer:
        is_continuation = False
        fresh_chunks = []
    elif current_diagnostic_plan and diagnostic_message:
        is_continuation = False
        fresh_chunks = [
            {
                "id": chunk.id,
                "content": chunk.content,
                "attachment_id": chunk.attachment_id,
                "extra_metadata": chunk.extra_metadata,
            }
            for chunk in diagnostic_message.chunks
        ]
    elif might_continue and not _is_explicit_continuation(body.content):
        is_continuation, fresh_chunks = await asyncio.gather(
            llm.is_message_continuation_request(body.content, settings),
            retrieval.retrieve_context_chunks(
                session,
                body.content,
                device_id=device_id,
                settings=settings,
                diagnostic_mode_2002=body.diagnostic_mode_enabled,
            ),
        )
    else:
        is_continuation = might_continue
        fresh_chunks = await retrieval.retrieve_context_chunks(
            session,
            body.content,
            device_id=device_id,
            settings=settings,
            diagnostic_mode_2002=body.diagnostic_mode_enabled,
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
    retrieved_at = time.perf_counter()

    context_chunks = [chunk["content"] for chunk in retrieved_chunks]

    diagnostic_plan: next_best_step.DiagnosticPlan | None = None
    if diagnostic_route == message_router.MessageRoute.start_diagnostic:
        diagnostic_problem = route_decision.recognized_problem or body.content
        diagnostic_plan = await next_best_step.build_diagnostic_plan(
            context_chunks, diagnostic_problem, settings
        )
    elif (
        diagnostic_route == message_router.MessageRoute.diagnostic_followup
        and diagnostic_message
        and current_diagnostic_plan
    ):
        (
            is_diagnostic_result,
            followup_plan,
        ) = await next_best_step.build_followup_plan(
            current_diagnostic_plan,
            diagnostic_message.content,
            body.content,
            settings,
        )
        if is_diagnostic_result:
            diagnostic_plan = followup_plan
    planned_at = time.perf_counter()
    response_plan = diagnostic_plan.current_action_only() if diagnostic_plan else None

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

        if debug:
            yield _sse(
                "debug",
                {
                    "step": "route",
                    "label": "Router wiadomości",
                    "duration_ms": round((routed_at - started_at) * 1000),
                    "data": {
                        **route_decision.model_dump(mode="json"),
                        "effective_route": diagnostic_route.value,
                        "history_messages": len(routing_history),
                    },
                },
            )
            yield _sse(
                "debug",
                {
                    "step": "retrieval",
                    "label": "Retrieval dokumentacji",
                    "duration_ms": round((retrieved_at - routed_at) * 1000),
                    "data": {
                        "device_id": device_id,
                        "continuation": is_continuation,
                        "chunks": [
                            {
                                "id": chunk["id"],
                                "attachment_id": chunk["attachment_id"],
                                "preview": chunk["content"][:500],
                                "metadata": chunk.get("extra_metadata") or {},
                            }
                            for chunk in retrieved_chunks
                        ],
                    },
                },
            )
            yield _sse(
                "debug",
                {
                    "step": "plan",
                    "label": "Next Best Step",
                    "duration_ms": round((planned_at - retrieved_at) * 1000),
                    "data": {
                        "active": diagnostic_plan is not None,
                        **(
                            diagnostic_plan.model_dump(mode="json")
                            if diagnostic_plan
                            else {}
                        ),
                    },
                },
            )
            yield _sse(
                "debug",
                {
                    "step": "generation",
                    "label": "Generowanie odpowiedzi",
                    "duration_ms": None,
                    "data": {"status": "started"},
                },
            )

        yield _sse("route", diagnostic_route.value)

        if standard_completion_answer:
            answer_parts.append(standard_completion_answer)
            yield _sse("chunk", standard_completion_answer)
        else:
            stream_limiter = streaming.ChecklistStreamLimiter()
            async for chunk in llm.stream_query(
                session,
                thread_id,
                body.content,
                context_chunks,
                settings,
                exclude_message_id=user_message.id,
                diagnostic_plan=response_plan,
                continuation_requested=is_continuation,
                continuation_hint=continuation_hint,
            ):
                for visible_chunk in stream_limiter.feed(chunk):
                    answer_parts.append(visible_chunk)
                    yield _sse("chunk", visible_chunk)

            for visible_chunk in stream_limiter.finish():
                answer_parts.append(visible_chunk)
                yield _sse("chunk", visible_chunk)

        answer = "".join(answer_parts)
        answer = llm.normalize_numbered_checklist(answer)
        answer = llm.promote_bare_checklist(answer)
        answer = llm.limit_checklist_items(answer)
        if is_continuation:
            answer = llm.ensure_continuation_intro(answer)
        answer = llm.clean_completion_notice(answer)
        answer = llm.normalize_warning_lists(answer)
        answer = llm.order_warnings_before_checklist(answer)
        has_continuation = llm.has_continuation_marker(answer) or bool(
            body.diagnostic_mode_enabled
            and diagnostic_plan
            and diagnostic_plan.has_next_action()
        )

        assistant_message = Message(
            content=answer,
            thread_id=thread_id,
            sender=MessageSender.assistant,
            has_continuation=has_continuation,
            router_decision=diagnostic_route.value,
        )
        session.add(assistant_message)
        await session.flush()

        if diagnostic_plan:
            next_best_step.cache_diagnostic_plan(
                _diagnostic_plan_cache_key(assistant_message), diagnostic_plan
            )

        if not llm.is_no_source_answer(answer) and not llm.is_completion_only_answer(
            answer
        ):
            for chunk in retrieved_chunks:
                session.add(
                    ChunkMessage(message_id=assistant_message.id, chunk_id=chunk["id"])
                )

        await session.commit()

        if debug:
            yield _sse(
                "debug",
                {
                    "step": "complete",
                    "label": "Odpowiedź zapisana",
                    "duration_ms": round((time.perf_counter() - planned_at) * 1000),
                    "data": {
                        "message_id": assistant_message.id,
                        "answer_characters": len(answer),
                        "source_count": len(retrieved_chunks),
                    },
                },
            )

        yield _sse(
            "message", MessageRead.model_validate(assistant_message).model_dump_json()
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
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
