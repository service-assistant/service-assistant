import asyncio
import json
import time
from typing import Any

from app.config import Settings
from app.models import ChatThread, ChunkMessage, Message, MessageSender
from app.repositories import MessageRepository
from app.schemas import MessageCreate, MessageRead
from app.services import (
    llm,
    message_router,
    next_best_step,
    photo_context,
    retrieval,
    streaming,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession


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


async def stream_chat_message(
    thread: ChatThread,
    body: MessageCreate,
    settings: Settings,
    session: AsyncSession,
    organization_id: int,
    debug: bool,
) -> StreamingResponse:
    started_at = time.perf_counter()
    thread_id = thread.id
    device_id = thread.device_id
    rag_question = photo_context.build_augmented_rag_query(
        body.content, body.photo_context
    )
    rag_photo_context = photo_context.build_rag_photo_context(body.photo_context)

    recent_messages = await MessageRepository(
        session, organization_id
    ).list_recent_for_thread(thread.id, limit=20)
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

    might_continue = (
        not body.photo_context
        and latest_system_message is not None
        and _looks_like_continuation(body.content)
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
        and not body.photo_context
        and latest_system_message
        and _is_explicit_continuation(body.content)
        and not has_promised_continuation
        else None
    )
    retrieval_trace: dict[str, Any] = {}

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
                rag_question,
                device_id=device_id,
                settings=settings,
                diagnostic_mode_2002=body.diagnostic_mode_enabled,
                retrieval_trace=retrieval_trace,
            ),
        )
    else:
        is_continuation = might_continue
        fresh_chunks = await retrieval.retrieve_context_chunks(
            session,
            rag_question,
            device_id=device_id,
            settings=settings,
            diagnostic_mode_2002=body.diagnostic_mode_enabled,
            retrieval_trace=retrieval_trace,
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

    if not retrieval_trace:
        retrieval_trace = {
            "reranker_enabled": False,
            "reranker_status": "not_run",
            "before_reranker": fresh_chunks,
            "after_reranker": retrieved_chunks,
        }

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
                        "photo_context": [
                            observation.model_dump(mode="json")
                            for observation in body.photo_context
                        ],
                        "continuation": is_continuation,
                        "reranker_enabled": retrieval_trace.get(
                            "reranker_enabled", False
                        ),
                        "reranker_status": retrieval_trace.get(
                            "reranker_status", "not_run"
                        ),
                        "before_reranker": [
                            {
                                "id": chunk["id"],
                                "attachment_id": chunk["attachment_id"],
                                "preview": chunk["content"][:1000],
                                "metadata": chunk.get("extra_metadata") or {},
                            }
                            for chunk in retrieval_trace.get("before_reranker", [])
                        ],
                        "after_reranker": [
                            {
                                "id": chunk["id"],
                                "attachment_id": chunk["attachment_id"],
                                "preview": chunk["content"][:1000],
                                "metadata": chunk.get("extra_metadata") or {},
                            }
                            for chunk in retrieval_trace.get("after_reranker", [])
                        ],
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
        yield _sse("route", diagnostic_route.value)

        generation_started_at = time.perf_counter()
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
                photo_context=rag_photo_context,
            ):
                for visible_chunk in stream_limiter.feed(chunk):
                    answer_parts.append(visible_chunk)
                    yield _sse("chunk", visible_chunk)

            for visible_chunk in stream_limiter.finish():
                answer_parts.append(visible_chunk)
                yield _sse("chunk", visible_chunk)
        generation_duration_ms = round(
            (time.perf_counter() - generation_started_at) * 1000
        )

        if debug:
            yield _sse(
                "debug",
                {
                    "step": "generation",
                    "label": "Generowanie odpowiedzi",
                    "duration_ms": generation_duration_ms,
                    "data": {"status": "completed"},
                },
            )

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
