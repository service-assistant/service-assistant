import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from app.config import Settings
from app.models import ChatThread, ChunkMessage, Message, MessageSender
from app.repositories import MessageRepository
from app.schemas import MessageCreate, MessageRead
from app.services import photo_context, retrieval
from app.services.embedding import RetrievedChunk
from app.services.reranker import rerank_chunks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .common import (
    diagnostic_plan_cache_key,
    is_explicit_continuation,
    looks_like_continuation,
    sse,
)
from . import generation, streaming
from .diagnostic import next_best_step, router

RouteResolver = Callable[
    [
        MessageCreate,
        Settings,
        list[Message],
        list[router.RoutingHistoryMessage],
    ],
    Awaitable[router.RouteDecision],
]

MULTI_QUERY_CHUNK_LIMIT = 7
RECIPROCAL_RANK_CONSTANT = 60
AGENT_GLOBAL_RERANK_CANDIDATE_LIMIT = 30
logger = logging.getLogger(__name__)


async def retrieve_for_queries(
    session: AsyncSession,
    queries: list[str],
    *,
    device_id: int,
    settings: Settings,
    diagnostic_enabled: bool,
    retrieval_trace: dict[str, Any],
) -> list[RetrievedChunk]:
    if len(queries) == 1:
        query_trace: dict[str, Any] = {}
        selected = await retrieval.retrieve_context_chunks(
            session,
            queries[0],
            device_id=device_id,
            settings=settings,
            diagnostic_mode_enabled=diagnostic_enabled,
            retrieval_trace=query_trace,
        )
        retrieval_trace.update(query_trace)
        retrieval_trace["queries"] = [{"query": queries[0], **query_trace}]
        return selected

    chunks_by_id: dict[int, RetrievedChunk] = {}
    scores: dict[int, float] = {}
    query_traces: list[dict[str, Any]] = []
    reranker_enabled = False
    reranker_statuses: set[str] = set()

    # AsyncSession is not safe for concurrent task use, so expanded queries are
    # intentionally retrieved sequentially until retrieval owns its own sessions.
    for query in queries:
        query_trace: dict[str, Any] = {}
        query_chunks = await retrieval.retrieve_context_chunks(
            session,
            query,
            device_id=device_id,
            settings=settings,
            diagnostic_mode_enabled=diagnostic_enabled,
            retrieval_trace=query_trace,
        )
        query_traces.append({"query": query, **query_trace})
        reranker_enabled = reranker_enabled or bool(
            query_trace.get("reranker_enabled", False)
        )
        reranker_statuses.add(str(query_trace.get("reranker_status", "not_run")))
        for rank, chunk in enumerate(query_chunks, start=1):
            chunk_id = chunk["id"]
            chunks_by_id[chunk_id] = chunk
            scores[chunk_id] = scores.get(chunk_id, 0) + 1 / (
                RECIPROCAL_RANK_CONSTANT + rank
            )

    ranked_ids = sorted(scores, key=scores.__getitem__, reverse=True)
    selected = [
        chunks_by_id[chunk_id] for chunk_id in ranked_ids[:MULTI_QUERY_CHUNK_LIMIT]
    ]
    all_candidates = list(chunks_by_id.values())
    retrieval_trace.update(
        {
            "queries": query_traces,
            "reranker_enabled": reranker_enabled,
            "reranker_status": (
                next(iter(reranker_statuses))
                if len(reranker_statuses) == 1
                else "mixed"
            ),
            "before_reranker": all_candidates,
            "after_reranker": selected,
        }
    )
    return selected


async def retrieve_for_agent_queries(
    session: AsyncSession,
    queries: list[str],
    *,
    device_id: int,
    settings: Settings,
    retrieval_trace: dict[str, Any],
) -> list[RetrievedChunk]:
    """Fuse agent query retrieval with RRF, then rerank the shared pool once."""
    chunks_by_id: dict[int, RetrievedChunk] = {}
    scores: dict[int, float] = {}
    query_traces: list[dict[str, Any]] = []

    for query in queries:
        query_chunks = await retrieval.retrieve_context_chunks(
            session,
            query,
            device_id=device_id,
            settings=settings,
            diagnostic_mode_enabled=False,
            reranking_enabled_override=False,
        )
        query_traces.append({"query": query, "chunks": query_chunks})
        for rank, chunk in enumerate(query_chunks, start=1):
            chunk_id = chunk["id"]
            chunks_by_id[chunk_id] = chunk
            scores[chunk_id] = scores.get(chunk_id, 0) + 1 / (
                RECIPROCAL_RANK_CONSTANT + rank
            )

    ranked_ids = sorted(scores, key=scores.__getitem__, reverse=True)
    fused_candidates = [
        chunks_by_id[chunk_id]
        for chunk_id in ranked_ids[:AGENT_GLOBAL_RERANK_CANDIDATE_LIMIT]
    ]
    selected = fused_candidates[:MULTI_QUERY_CHUNK_LIMIT]
    global_query = "\n".join(queries)
    reranker_status = "disabled"

    if settings.reranker_enabled and fused_candidates:
        try:
            ranked = await rerank_chunks(global_query, fused_candidates, settings)
            candidate_ids = {chunk["id"] for chunk in fused_candidates}
            result_ids = {chunk["id"] for chunk in ranked}
            if len(ranked) != len(fused_candidates) or result_ids != candidate_ids:
                raise ValueError(
                    "Global agent reranker returned an incomplete or duplicate ranking"
                )
            selected = ranked[:MULTI_QUERY_CHUNK_LIMIT]
            reranker_status = "applied"
        except Exception:
            logger.exception(
                "Global agent reranking failed for %d fused candidates; using RRF order",
                len(fused_candidates),
            )
            reranker_status = "fallback"

    retrieval_trace.update(
        {
            "queries": query_traces,
            "fusion_method": "reciprocal_rank_fusion",
            "global_reranker_query": global_query,
            "reranker_enabled": settings.reranker_enabled,
            "reranker_status": reranker_status,
            "before_reranker": fused_candidates,
            "after_reranker": selected,
        }
    )
    return selected


async def stream_message(
    thread: ChatThread,
    body: MessageCreate,
    settings: Settings,
    session: AsyncSession,
    organization_id: int,
    debug: bool,
    *,
    route_resolver: RouteResolver | None = None,
    retrieval_queries: list[str] | None = None,
    preprocessing_debug: dict[str, Any] | None = None,
    agent_retrieval: bool = False,
) -> StreamingResponse:
    diagnostic_enabled = route_resolver is not None
    started_at = time.perf_counter()
    thread_id = thread.id
    device_id = thread.device_id
    rag_question = photo_context.build_augmented_rag_query(
        body.content, body.photo_context
    )
    effective_retrieval_queries = retrieval_queries or [rag_question]
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
    routing_history: list[router.RoutingHistoryMessage] = [
        {
            "id": message.id,
            "sender": message.sender.value,
            "content": message.content[-3000:],
            "has_chunks": bool(message.chunks),
        }
        for message in reversed(recent_messages)
    ]

    route_decision = (
        await route_resolver(body, settings, recent_messages, routing_history)
        if route_resolver is not None
        else None
    )

    diagnostic_route = (
        route_decision.route
        if route_decision is not None
        else router.MessageRoute.standard_query
    )

    routed_at = time.perf_counter()
    diagnostic_message_id = (
        route_decision.diagnostic_message_id if route_decision else None
    )

    diagnostic_message = next(
        (
            message
            for message in recent_messages
            if message.id == diagnostic_message_id
            and message.sender == MessageSender.assistant
            and message.chunks
        ),
        None,
    )

    current_diagnostic_plan: next_best_step.DiagnosticPlan | None = None
    if diagnostic_message:
        current_diagnostic_plan = next_best_step.get_cached_diagnostic_plan(
            diagnostic_plan_cache_key(diagnostic_message)
        )
    if (
        diagnostic_route == router.MessageRoute.diagnostic_followup
        and current_diagnostic_plan is None
    ):
        diagnostic_route = router.MessageRoute.standard_query

    might_continue = (
        not body.photo_context
        and latest_system_message is not None
        and looks_like_continuation(body.content)
    )
    has_promised_continuation = bool(
        latest_system_message
        and (
            latest_system_message.has_continuation
            or generation.has_continuation_marker(latest_system_message.content)
        )
    )
    standard_completion_answer = (
        generation.DOCUMENTATION_EXHAUSTED_ANSWER
        if not diagnostic_enabled
        and not body.photo_context
        and latest_system_message
        and is_explicit_continuation(body.content)
        and not has_promised_continuation
        else None
    )
    retrieval_trace: dict[str, Any] = {}

    async def retrieve_fresh_chunks() -> list[RetrievedChunk]:
        if agent_retrieval:
            return await retrieve_for_agent_queries(
                session,
                effective_retrieval_queries,
                device_id=device_id,
                settings=settings,
                retrieval_trace=retrieval_trace,
            )
        return await retrieve_for_queries(
            session,
            effective_retrieval_queries,
            device_id=device_id,
            settings=settings,
            diagnostic_enabled=diagnostic_enabled,
            retrieval_trace=retrieval_trace,
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
    elif might_continue and not is_explicit_continuation(body.content):
        is_continuation, fresh_chunks = await asyncio.gather(
            generation.is_message_continuation_request(body.content, settings),
            retrieve_fresh_chunks(),
        )
    else:
        is_continuation = might_continue
        fresh_chunks = await retrieve_fresh_chunks()

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
    if diagnostic_route == router.MessageRoute.start_diagnostic:
        diagnostic_problem = (
            route_decision.recognized_problem
            if route_decision and route_decision.recognized_problem
            else body.content
        )

        diagnostic_plan = await next_best_step.build_diagnostic_plan(
            context_chunks, diagnostic_problem, settings
        )
    elif (
        diagnostic_route == router.MessageRoute.diagnostic_followup
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
        generation.continuation_target(latest_system_message.content)
        if is_continuation and latest_system_message
        else ""
    )

    async def event_stream():
        answer_parts: list[str] = []

        if debug:
            if preprocessing_debug is not None:
                yield sse("debug", preprocessing_debug)
            yield sse(
                "debug",
                {
                    "step": "route",
                    "label": "Router wiadomości",
                    "duration_ms": round((routed_at - started_at) * 1000),
                    "data": {
                        "mode": body.mode.value,
                        "decision": (
                            route_decision.model_dump(mode="json")
                            if route_decision is not None
                            else None
                        ),
                        "effective_route": diagnostic_route.value,
                        "history_messages": len(routing_history),
                    },
                },
            )
            yield sse(
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
                        "queries": effective_retrieval_queries,
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
            yield sse(
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
        yield sse("route", diagnostic_route.value)

        generation_started_at = time.perf_counter()
        if standard_completion_answer:
            answer_parts.append(standard_completion_answer)
            yield sse("chunk", standard_completion_answer)
        else:
            stream_limiter = streaming.ChecklistStreamLimiter()
            async for chunk in generation.stream_query(
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
                    yield sse("chunk", visible_chunk)

            for visible_chunk in stream_limiter.finish():
                answer_parts.append(visible_chunk)
                yield sse("chunk", visible_chunk)
        generation_duration_ms = round(
            (time.perf_counter() - generation_started_at) * 1000
        )

        if debug:
            yield sse(
                "debug",
                {
                    "step": "generation",
                    "label": "Generowanie odpowiedzi",
                    "duration_ms": generation_duration_ms,
                    "data": {"status": "completed"},
                },
            )

        answer = "".join(answer_parts)
        answer = generation.normalize_numbered_checklist(answer)
        answer = generation.promote_bare_checklist(answer)
        answer = generation.limit_checklist_items(answer)
        if is_continuation:
            answer = generation.ensure_continuation_intro(answer)
        answer = generation.clean_completion_notice(answer)
        answer = generation.normalize_warning_lists(answer)
        answer = generation.order_warnings_before_checklist(answer)
        has_continuation = generation.has_continuation_marker(answer) or bool(
            diagnostic_enabled and diagnostic_plan and diagnostic_plan.has_next_action()
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
                diagnostic_plan_cache_key(assistant_message), diagnostic_plan
            )

        if not generation.is_no_source_answer(
            answer
        ) and not generation.is_completion_only_answer(answer):
            for chunk in retrieved_chunks:
                session.add(
                    ChunkMessage(message_id=assistant_message.id, chunk_id=chunk["id"])
                )

        await session.commit()

        if debug:
            yield sse(
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

        yield sse(
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
