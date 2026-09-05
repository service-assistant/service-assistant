import asyncio
import json
from collections.abc import Awaitable, Callable
from typing import Any

from app.benchmarks.cancellation import (
    await_with_cancellation,
    raise_if_cancelled,
)
from app.benchmarks.models import BenchmarkCase
from app.config import Settings
from app.models import (
    Attachment,
    Category,
    ChatThread,
    Chunk,
    ChunkMessage,
    Device,
)
from app.schemas import ChatMode, MessageCreate
from app.services.benchmark.judge import (
    evaluate_source_images,
    judge_answer,
    judge_chunks,
)
from app.services.benchmark.setup import BENCHMARK_MODEL_SERIAL_CODE
from app.services.chat import pipeline
from app.services.chat.agent import engine as agent_engine
from app.services.chat.agent.models import MachineContext
from app.services.organizations import get_system_organization_id
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

REQUIRED_FACTS_PASS_THRESHOLD = 0.8
FACT_COVERAGE_PASS_THRESHOLD = 0.8
MAX_CONTINUATION_MESSAGES = 3


def _parse_sse(raw: str) -> list[tuple[str, str]]:
    events: list[tuple[str, str]] = []
    for block in raw.replace("\r\n", "\n").split("\n\n"):
        event_name: str | None = None
        data_lines: list[str] = []
        for line in block.splitlines():
            if line.startswith("event: "):
                event_name = line.removeprefix("event: ")
            elif line.startswith("data: "):
                data_lines.append(line.removeprefix("data: "))
        if event_name is not None:
            events.append((event_name, "\n".join(data_lines)))
    return events


async def _consume_assistant_response(response: Any) -> dict[str, Any]:
    chunks: list[str] = []
    async for part in response.body_iterator:
        chunks.append(part.decode() if isinstance(part, bytes) else part)
    events = _parse_sse("".join(chunks))
    route = next((data for event, data in events if event == "route"), None)
    message = next(
        (json.loads(data) for event, data in events if event == "message"), None
    )
    if route is None or message is None:
        raise RuntimeError("Assistant stream did not contain route or message events.")
    return {
        "route": route,
        "message": message,
        "debug": [json.loads(data) for event, data in events if event == "debug"],
    }


async def _collect_benchmark_conversation(
    question: str,
    send: Callable[[str], Awaitable[dict[str, Any]]],
) -> list[dict[str, Any]]:
    turns = [await send(question)]
    for _ in range(MAX_CONTINUATION_MESSAGES):
        if not bool(turns[-1]["message"].get("has_continuation")):
            break
        turns.append(await send("kontynuuj"))
    return turns


def _merge_chunks(*chunk_lists: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[int] = set()
    for chunks in chunk_lists:
        for chunk in chunks:
            chunk_id = int(chunk["id"])
            if chunk_id not in seen:
                seen.add(chunk_id)
                merged.append(chunk)
    return merged


def _assistant_response_time_ms(turn: dict[str, Any]) -> int | None:
    generation_event = next(
        (
            item
            for item in turn.get("debug", [])
            if item.get("step") == "generation" and item.get("duration_ms") is not None
        ),
        None,
    )
    if generation_event is None:
        return None
    duration_ms = generation_event["duration_ms"]
    return round(float(duration_ms))


async def _attachment_names(
    session: AsyncSession, chunks: list[dict[str, Any]]
) -> dict[int, str]:
    attachment_ids = {
        int(item["attachment_id"])
        for item in chunks
        if item.get("attachment_id") is not None
    }
    if not attachment_ids:
        return {}
    rows = (
        await session.execute(
            select(Attachment.id, Attachment.original_filename).where(
                Attachment.id.in_(attachment_ids)
            )
        )
    ).all()
    return {row.id: row.original_filename for row in rows}


def _serialize_retrieval_chunk(
    chunk: dict[str, Any], source_names_by_id: dict[int, str]
) -> dict[str, Any]:
    content = str(chunk.get("content", chunk.get("preview", "")))
    attachment_id = chunk.get("attachment_id")
    source_name = (
        source_names_by_id.get(int(attachment_id))
        if attachment_id is not None
        else None
    )
    return {
        "id": chunk.get("id"),
        "attachment_id": attachment_id,
        "source_name": source_name,
        "preview": content[:1000],
        "metadata": chunk.get("extra_metadata", chunk.get("metadata", {})) or {},
    }


async def _run_agent_retrieval_benchmark(
    case: BenchmarkCase,
    device: Device,
    settings: Settings,
    session: AsyncSession,
    cancellation_event: asyncio.Event | None,
) -> dict[str, Any]:
    machine = MachineContext(
        device_id=device.id,
        name=device.name,
        model_serial_code=device.model_serial_code,
        nameplate_data=None,
    )
    case_context, query_plan, queries = await await_with_cancellation(
        agent_engine.prepare_case(case.question, machine, settings),
        cancellation_event,
    )
    retrieval_trace: dict[str, Any] = {}
    await await_with_cancellation(
        pipeline.retrieve_for_agent_queries(
            session,
            queries,
            device_id=device.id,
            settings=settings,
            retrieval_trace=retrieval_trace,
        ),
        cancellation_event,
    )
    query_traces = retrieval_trace.get("queries", [])
    all_chunks = [
        chunk
        for key in ("before_reranker", "after_reranker")
        for chunk in retrieval_trace.get(key, [])
    ] + [chunk for trace in query_traces for chunk in trace.get("chunks", [])]
    source_names_by_id = await _attachment_names(session, all_chunks)

    def serialize_many(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            _serialize_retrieval_chunk(chunk, source_names_by_id) for chunk in chunks
        ]

    return {
        "case_id": case.id,
        "mode": ChatMode.agent.value,
        "pipeline_stage": "retrieval_completed",
        "question": case.question,
        "case_context": case_context.model_dump(mode="json"),
        "query_plan": query_plan.model_dump(mode="json"),
        "retrieval_queries": queries,
        "reranker_enabled": bool(retrieval_trace.get("reranker_enabled", False)),
        "reranker_status": retrieval_trace.get("reranker_status", "not_run"),
        "fusion_method": retrieval_trace.get("fusion_method"),
        "global_reranker_query": retrieval_trace.get("global_reranker_query"),
        "chunks_before_reranker": serialize_many(
            retrieval_trace.get("before_reranker", [])
        ),
        "chunks_after_reranker": serialize_many(
            retrieval_trace.get("after_reranker", [])
        ),
        "query_runs": [
            {
                "query": trace.get("query", ""),
                "chunks": serialize_many(trace.get("chunks", [])),
            }
            for trace in query_traces
        ],
    }


async def run_benchmark_case(
    case: BenchmarkCase,
    settings: Settings,
    session: AsyncSession,
    cancellation_event: asyncio.Event | None = None,
) -> dict[str, Any]:
    raise_if_cancelled(cancellation_event)
    organization_id = await get_system_organization_id(session)
    device = await session.scalar(
        select(Device)
        .join(Category, Category.id == Device.category_id)
        .where(Device.model_serial_code == BENCHMARK_MODEL_SERIAL_CODE)
        .where(Category.organization_id == organization_id)
        .order_by(Device.id)
    )
    if device is None:
        raise RuntimeError("Run the full benchmark setup before running cases.")

    if case.mode == ChatMode.agent:
        return await _run_agent_retrieval_benchmark(
            case,
            device,
            settings,
            session,
            cancellation_event,
        )

    thread = ChatThread(
        title=f"BENCHMARK · {case.id}",
        device_id=device.id,
        nameplate_data=None,
    )
    session.add(thread)
    await session.commit()
    await session.refresh(thread)

    from app.routers import threads

    async def send(content: str) -> dict[str, Any]:
        raise_if_cancelled(cancellation_event)
        response = await await_with_cancellation(
            threads.create_message(
                thread=thread,
                body=MessageCreate(
                    content=content,
                    mode=case.mode,
                ),
                settings=settings,
                session=session,
                organization_id=organization_id,
                debug=True,
            ),
            cancellation_event,
        )
        return await await_with_cancellation(
            _consume_assistant_response(response), cancellation_event
        )

    conversation = await _collect_benchmark_conversation(case.question, send)
    route = conversation[0]["route"]
    message_payloads = [turn["message"] for turn in conversation]
    assistant_response_times_by_turn = [
        _assistant_response_time_ms(turn) for turn in conversation
    ]
    assistant_response_times_ms = [
        duration
        for duration in assistant_response_times_by_turn
        if duration is not None
    ]
    average_assistant_response_time_ms = (
        round(sum(assistant_response_times_ms) / len(assistant_response_times_ms))
        if assistant_response_times_ms
        else None
    )
    message_payload = message_payloads[-1]
    retrieval_data_items: list[dict[str, Any]] = []
    for turn in conversation:
        retrieval_event = next(
            (item for item in turn["debug"] if item.get("step") == "retrieval"),
            None,
        )
        if retrieval_event:
            retrieval_data_items.append(retrieval_event.get("data", {}))

    retrieved_chunks = _merge_chunks(
        *(item.get("chunks", []) for item in retrieval_data_items)
    )
    chunks_before_reranker = _merge_chunks(
        *(
            item.get("before_reranker", item.get("chunks", []))
            for item in retrieval_data_items
        )
    )
    chunks_after_reranker = _merge_chunks(
        *(
            item.get("after_reranker", item.get("chunks", []))
            for item in retrieval_data_items
        )
    )
    retrieval_data = retrieval_data_items[0] if retrieval_data_items else {}
    attachment_ids = {
        int(item["attachment_id"])
        for item in [*chunks_before_reranker, *chunks_after_reranker]
        if item.get("attachment_id") is not None
    }
    attachment_rows = (
        (
            await session.execute(
                select(Attachment.id, Attachment.original_filename).where(
                    Attachment.id.in_(attachment_ids)
                )
            )
        ).all()
        if attachment_ids
        else []
    )
    source_names_by_id = {row.id: row.original_filename for row in attachment_rows}

    def enrich_chunks(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                **item,
                "source_name": source_names_by_id.get(item.get("attachment_id")),
            }
            for item in items
        ]

    chunks_before_reranker = enrich_chunks(chunks_before_reranker)
    chunks_after_reranker = enrich_chunks(chunks_after_reranker)
    source_names = list(
        dict.fromkeys(
            item["source_name"]
            for item in chunks_after_reranker
            if item.get("source_name")
        )
    )

    after_chunk_ids = [int(item["id"]) for item in chunks_after_reranker]
    chunk_rows = (
        list(
            (
                await session.scalars(
                    select(Chunk).where(Chunk.id.in_(after_chunk_ids))
                )
            ).all()
        )
        if after_chunk_ids
        else []
    )
    chunk_content_by_id = {chunk.id: chunk.content for chunk in chunk_rows}
    displayed_chunk_ids = set(
        (
            await session.scalars(
                select(ChunkMessage.chunk_id).where(
                    ChunkMessage.message_id.in_(
                        [int(payload["id"]) for payload in message_payloads]
                    )
                )
            )
        ).all()
    )
    chunks_for_judge = [
        {
            **item,
            "content": chunk_content_by_id.get(
                int(item["id"]), item.get("preview", "")
            ),
            "linked_for_display": int(item["id"]) in displayed_chunk_ids,
        }
        for item in chunks_after_reranker
    ]

    raise_if_cancelled(cancellation_event)
    answer = "\n\n--- Kontynuacja ---\n\n".join(
        str(payload["content"]) for payload in message_payloads
    )
    source_image_paths: list[str] = []
    if case.evaluation_mode == "source_image":
        judge, chunk_judge, source_image_paths = evaluate_source_images(
            case, chunks_for_judge
        )
        judge_model = "deterministic-source-image-check"
        chunk_judge_model = "deterministic-source-image-check"
        judge_reasoning_effort = "not applicable"
    else:
        judge, chunk_judge = await await_with_cancellation(
            asyncio.gather(
                judge_answer(case, answer, settings),
                judge_chunks(case, chunks_for_judge, settings),
            ),
            cancellation_event,
        )
        judge_model = settings.benchmark_judge_model
        chunk_judge_model = settings.benchmark_chunk_judge_model
        judge_reasoning_effort = settings.benchmark_judge_reasoning_effort
    chunk_evaluations = [item.model_dump(mode="json") for item in chunk_judge.chunks]
    chunks_after_reranker = [
        {**item, "evaluation": chunk_evaluations[index]}
        for index, item in enumerate(chunks_after_reranker)
    ]
    relevant_chunks = sum(item.relevance_score >= 2 for item in chunk_judge.chunks)
    precision_at_k = (
        relevant_chunks / len(chunk_judge.chunks) if chunk_judge.chunks else 0.0
    )
    covered_fact_indexes = {
        fact_index
        for item in chunk_judge.chunks
        for fact_index in item.supported_fact_indexes
    }
    fact_coverage = (
        len(covered_fact_indexes) / len(case.required_facts)
        if case.required_facts
        else 1.0
    )
    required_passed = sum(item.satisfied for item in judge.required_facts)
    required_behaviors_passed = sum(item.satisfied for item in judge.required_behaviors)
    required_behaviors_total = len(case.required_behaviors)
    required_behaviors_threshold_passed = (
        required_behaviors_passed == required_behaviors_total
    )
    forbidden_found = sum(item.satisfied for item in judge.forbidden_claims)
    required_total = len(case.required_facts)
    required_score = required_passed / required_total if required_total else 1.0
    required_facts_threshold_passed = required_score >= REQUIRED_FACTS_PASS_THRESHOLD
    fact_coverage_threshold_passed = fact_coverage >= FACT_COVERAGE_PASS_THRESHOLD
    route_passed = route == case.expected_route
    source_passed = case.source.filename in source_names
    passed = (
        route_passed
        and source_passed
        and required_facts_threshold_passed
        and required_behaviors_threshold_passed
        and fact_coverage_threshold_passed
        and forbidden_found == 0
    )
    raise_if_cancelled(cancellation_event)

    return {
        "case_id": case.id,
        "passed": passed,
        "score": round(required_score * 100),
        "required_facts_threshold": round(REQUIRED_FACTS_PASS_THRESHOLD * 100),
        "required_facts_threshold_passed": required_facts_threshold_passed,
        "required_behaviors_passed": required_behaviors_passed,
        "required_behaviors_total": required_behaviors_total,
        "required_behaviors_threshold_passed": required_behaviors_threshold_passed,
        "thread_id": thread.id,
        "message_id": message_payload["id"],
        "message_ids": [payload["id"] for payload in message_payloads],
        "message_count": len(message_payloads),
        "continued": len(message_payloads) > 1,
        "assistant_messages": [
            {
                "id": payload["id"],
                "content": str(payload["content"]),
                "has_continuation": bool(payload.get("has_continuation", False)),
                "response_time_ms": assistant_response_times_by_turn[index],
            }
            for index, payload in enumerate(message_payloads)
        ],
        "assistant_response_times_ms": assistant_response_times_ms,
        "average_assistant_response_time_ms": average_assistant_response_time_ms,
        "question": case.question,
        "answer": answer,
        "route": route,
        "expected_route": case.expected_route,
        "route_passed": route_passed,
        "source_passed": source_passed,
        "source_names": source_names,
        "retrieved_chunk_count": len(retrieved_chunks),
        "reranker_enabled": bool(retrieval_data.get("reranker_enabled", False)),
        "reranker_status": retrieval_data.get("reranker_status", "not_run"),
        "chunks_before_reranker": chunks_before_reranker,
        "chunks_after_reranker": chunks_after_reranker,
        "chunk_precision_at_k": round(precision_at_k * 100),
        "chunk_fact_coverage": round(fact_coverage * 100),
        "fact_coverage_threshold": round(FACT_COVERAGE_PASS_THRESHOLD * 100),
        "fact_coverage_threshold_passed": fact_coverage_threshold_passed,
        "evaluation_mode": case.evaluation_mode,
        "minimum_source_images": case.minimum_source_images,
        "source_image_count": len(source_image_paths),
        "source_image_paths": source_image_paths,
        "source_images_passed": len(source_image_paths) >= case.minimum_source_images,
        "chunk_relevant": relevant_chunks,
        "chunk_total": len(chunk_judge.chunks),
        "chunk_judge": chunk_judge.model_dump(mode="json"),
        "required_passed": required_passed,
        "required_total": required_total,
        "forbidden_found": forbidden_found,
        "judge_model": judge_model,
        "chunk_judge_model": chunk_judge_model,
        "judge_reasoning_effort": judge_reasoning_effort,
        "judge": judge.model_dump(mode="json"),
    }
