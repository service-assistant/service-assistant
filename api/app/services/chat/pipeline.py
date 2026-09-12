import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

from app.config import Settings
from app.models import ChatThread, ChunkMessage, Message, MessageSender
from app.repositories import MessageRepository
from app.schemas import MessageCreate, MessageRead
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from . import photo_context
from .agent import diagnostic_extractor
from .agent import gap_finder
from .agent import diagnostic_state as diagnostic_state_service
from .agent import next_best_step as agent_next_best_step
from .agent import retrieval as agent_retrieval_service
from .agent.models import CaseContext
from .retrieval import RetrievedChunk, retrieve_for_queries
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
    agent_case_context: CaseContext | None = None,
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
            return await agent_retrieval_service.retrieve_for_agent_queries(
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

    fresh_chunks: list[RetrievedChunk]
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

    retrieved_chunks: list[RetrievedChunk]
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

    extraction: diagnostic_extractor.DiagnosticExtraction | None = None
    evidence_gate: diagnostic_extractor.ExtractedEvidenceGateResult | None = None
    diagnostic_state: diagnostic_state_service.DiagnosticState | None = None
    extraction_finished_at = retrieved_at
    evidence_gate_finished_at = retrieved_at
    diagnostic_state_finished_at = retrieved_at
    gap_finder_finished_at = retrieved_at
    if agent_retrieval:
        if agent_case_context is None:
            raise ValueError("agent_case_context is required for agent retrieval")
        extraction = await diagnostic_extractor.extract_diagnostic_evidence(
            agent_case_context,
            retrieved_chunks,
            settings,
        )
        extraction_finished_at = time.perf_counter()
        evidence_gate = diagnostic_extractor.evaluate_extracted_evidence(
            extraction, retrieved_chunks
        )
        evidence_gate_finished_at = time.perf_counter()
        diagnostic_state = diagnostic_state_service.prepare_diagnostic_state(
            agent_case_context, extraction, evidence_gate
        )
        diagnostic_state_finished_at = time.perf_counter()
        diagnostic_state = gap_finder.enrich_with_gaps(diagnostic_state)
        gap_finder_finished_at = time.perf_counter()
        accepted_source_ids = set(evidence_gate.accepted_source_chunk_ids)
        retrieved_chunks = [
            chunk for chunk in retrieved_chunks if chunk["id"] in accepted_source_ids
        ]

    if not retrieval_trace:
        retrieval_trace = {
            "reranker_enabled": False,
            "reranker_status": "not_run",
            "before_reranker": fresh_chunks,
            "after_reranker": retrieved_chunks,
        }

    context_chunks = [chunk["content"] for chunk in retrieved_chunks]

    agent_next_step_decision: agent_next_best_step.AgentNextStepDecision | None = None
    if diagnostic_state is not None:
        agent_next_step_decision = await agent_next_best_step.evaluate_next_step(
            diagnostic_state, settings
        )
    agent_step_answer = (
        agent_next_best_step.technician_response(agent_next_step_decision)
        if agent_next_step_decision is not None
        else None
    )

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
                    "start_ms": 0,
                    "end_ms": round((routed_at - started_at) * 1000),
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
                    "label": "Retrieval + Reranker",
                    "duration_ms": round((retrieved_at - routed_at) * 1000),
                    "start_ms": round((routed_at - started_at) * 1000),
                    "end_ms": round((retrieved_at - started_at) * 1000),
                    "data": {
                        "device_id": device_id,
                        "photo_context": [
                            observation.model_dump(mode="json")
                            for observation in body.photo_context
                        ],
                        "queries": effective_retrieval_queries,
                        "continuation": is_continuation,
                        "translation_duration_ms": retrieval_trace.get(
                            "translation_duration_ms", 0
                        ),
                        "timeline": retrieval_trace.get("timeline", []),
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
                                "reranker_score": chunk.get("reranker_score"),
                            }
                            for chunk in retrieval_trace.get("before_reranker", [])
                        ],
                        "after_reranker": [
                            {
                                "id": chunk["id"],
                                "attachment_id": chunk["attachment_id"],
                                "preview": chunk["content"][:1000],
                                "metadata": chunk.get("extra_metadata") or {},
                                "reranker_score": chunk.get("reranker_score"),
                            }
                            for chunk in retrieval_trace.get("after_reranker", [])
                        ],
                        "initial_evidence_gate": retrieval_trace.get(
                            "initial_evidence_gate"
                        ),
                        "after_evidence_gate": [
                            {
                                "id": chunk["id"],
                                "attachment_id": chunk["attachment_id"],
                                "preview": chunk["content"][:1000],
                                "metadata": chunk.get("extra_metadata") or {},
                                "reranker_score": chunk.get("reranker_score"),
                            }
                            for chunk in retrieval_trace.get("after_evidence_gate", [])
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
            if extraction is not None and evidence_gate is not None:
                yield sse(
                    "debug",
                    {
                        "step": "diagnostic_extractor",
                        "label": "Diagnostic Extractor",
                        "duration_ms": round(
                            (extraction_finished_at - retrieved_at) * 1000
                        ),
                        "start_ms": round((retrieved_at - started_at) * 1000),
                        "end_ms": round((extraction_finished_at - started_at) * 1000),
                        "data": extraction.model_dump(mode="json"),
                    },
                )
                yield sse(
                    "debug",
                    {
                        "step": "evidence_gate",
                        "label": "Evidence Gate",
                        "duration_ms": round(
                            (evidence_gate_finished_at - extraction_finished_at) * 1000
                        ),
                        "start_ms": round((extraction_finished_at - started_at) * 1000),
                        "end_ms": round(
                            (evidence_gate_finished_at - started_at) * 1000
                        ),
                        "data": evidence_gate.model_dump(mode="json"),
                    },
                )
            if diagnostic_state is not None:
                yield sse(
                    "debug",
                    {
                        "step": "diagnostic_state",
                        "label": "Diagnostic State",
                        "duration_ms": round(
                            (diagnostic_state_finished_at - evidence_gate_finished_at)
                            * 1000
                        ),
                        "start_ms": round(
                            (evidence_gate_finished_at - started_at) * 1000
                        ),
                        "end_ms": round(
                            (diagnostic_state_finished_at - started_at) * 1000
                        ),
                        "data": diagnostic_state.model_dump(mode="json"),
                    },
                )
                yield sse(
                    "debug",
                    {
                        "step": "gap_finder",
                        "label": "Gap Finder",
                        "duration_ms": round(
                            (gap_finder_finished_at - diagnostic_state_finished_at)
                            * 1000
                        ),
                        "start_ms": round(
                            (diagnostic_state_finished_at - started_at) * 1000
                        ),
                        "end_ms": round((gap_finder_finished_at - started_at) * 1000),
                        "data": {
                            "status": diagnostic_state.status,
                            "gaps": [
                                gap.model_dump(mode="json")
                                for gap in diagnostic_state.gaps
                            ],
                            "rule_states": [
                                rule_state.model_dump(mode="json")
                                for rule_state in diagnostic_state.rule_states
                            ],
                        },
                    },
                )
            yield sse(
                "debug",
                {
                    "step": "plan",
                    "label": (
                        "Agent Next Best Step"
                        if agent_next_step_decision is not None
                        else "Next Best Step"
                    ),
                    "duration_ms": round((planned_at - gap_finder_finished_at) * 1000),
                    "start_ms": round((gap_finder_finished_at - started_at) * 1000),
                    "end_ms": round((planned_at - started_at) * 1000),
                    "data": {
                        "active": (
                            agent_next_step_decision.status == "selected"
                            if agent_next_step_decision is not None
                            else diagnostic_plan is not None
                        ),
                        **(
                            agent_next_step_decision.model_dump(mode="json")
                            if agent_next_step_decision is not None
                            else diagnostic_plan.model_dump(mode="json")
                            if diagnostic_plan is not None
                            else {}
                        ),
                    },
                },
            )
        yield sse("route", diagnostic_route.value)

        generation_started_at = time.perf_counter()
        first_chunk_at: float | None = None
        if standard_completion_answer:
            answer_parts.append(standard_completion_answer)
            first_chunk_at = time.perf_counter()
            yield sse("chunk", standard_completion_answer)
        elif agent_step_answer:
            answer_parts.append(agent_step_answer)
            first_chunk_at = time.perf_counter()
            yield sse("chunk", agent_step_answer)
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
                    if first_chunk_at is None:
                        first_chunk_at = time.perf_counter()
                    yield sse("chunk", visible_chunk)

            for visible_chunk in stream_limiter.finish():
                answer_parts.append(visible_chunk)
                if first_chunk_at is None:
                    first_chunk_at = time.perf_counter()
                yield sse("chunk", visible_chunk)
        generation_finished_at = time.perf_counter()
        generation_duration_ms = round(
            (generation_finished_at - generation_started_at) * 1000
        )

        if debug:
            yield sse(
                "debug",
                {
                    "step": "generation",
                    "label": "Generowanie odpowiedzi",
                    "duration_ms": generation_duration_ms,
                    "start_ms": round((generation_started_at - started_at) * 1000),
                    "end_ms": round((generation_finished_at - started_at) * 1000),
                    "first_chunk_ms": (
                        round((first_chunk_at - started_at) * 1000)
                        if first_chunk_at is not None
                        else None
                    ),
                    "time_to_first_chunk_ms": (
                        round((first_chunk_at - generation_started_at) * 1000)
                        if first_chunk_at is not None
                        else None
                    ),
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
        persisted_at = time.perf_counter()

        if debug:
            yield sse(
                "debug",
                {
                    "step": "persistence",
                    "label": "Normalizacja i zapis odpowiedzi",
                    "duration_ms": round(
                        (persisted_at - generation_finished_at) * 1000
                    ),
                    "start_ms": round((generation_finished_at - started_at) * 1000),
                    "end_ms": round((persisted_at - started_at) * 1000),
                    "data": {"status": "completed"},
                },
            )
            yield sse(
                "debug",
                {
                    "step": "complete",
                    "label": "Odpowiedź zapisana",
                    "duration_ms": round((persisted_at - planned_at) * 1000),
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
