import asyncio
import json
from collections.abc import Awaitable, Callable
from contextlib import suppress
from typing import Any, cast

from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import Attachment, ChatThread, Chunk, ChunkMessage, Device
from app.schemas import MessageCreate
from app.services.benchmark_cases import BenchmarkCase
from app.services.benchmark_setup import BENCHMARK_MODEL_SERIAL_CODE

REQUIRED_FACTS_PASS_THRESHOLD = 0.8
FACT_COVERAGE_PASS_THRESHOLD = 0.8
MAX_CONTINUATION_MESSAGES = 3


class BenchmarkCancelledError(RuntimeError):
    """Raised when an active benchmark run is cancelled by the administrator."""


def _raise_if_cancelled(cancellation_event: asyncio.Event | None) -> None:
    if cancellation_event is not None and cancellation_event.is_set():
        raise BenchmarkCancelledError("Benchmark run was cancelled.")


async def _await_with_cancellation(
    awaitable: Awaitable[Any],
    cancellation_event: asyncio.Event | None,
) -> Any:
    if cancellation_event is None:
        return await awaitable
    operation = asyncio.ensure_future(awaitable)
    if cancellation_event.is_set():
        operation.cancel()
        with suppress(asyncio.CancelledError):
            await operation
        raise BenchmarkCancelledError("Benchmark run was cancelled.")
    cancelled = asyncio.create_task(cancellation_event.wait())
    done, _pending = await asyncio.wait(
        {operation, cancelled}, return_when=asyncio.FIRST_COMPLETED
    )
    if cancelled in done:
        operation.cancel()
        with suppress(asyncio.CancelledError):
            await operation
        raise BenchmarkCancelledError("Benchmark run was cancelled.")
    cancelled.cancel()
    with suppress(asyncio.CancelledError):
        await cancelled
    return await operation


class CriterionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    index: int = Field(ge=0)
    satisfied: bool
    evidence: str


class JudgeResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    required_facts: list[CriterionResult]
    forbidden_claims: list[CriterionResult]
    feedback: str


class ChunkEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    index: int = Field(ge=0)
    relevance_score: int = Field(ge=0, le=3)
    supported_fact_indexes: list[int]
    evidence: str


class ChunkJudgeResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chunks: list[ChunkEvaluation]
    feedback: str


def _source_image_judgement(
    case: BenchmarkCase,
    chunks: list[dict[str, Any]],
) -> tuple[JudgeResult, ChunkJudgeResult, list[str]]:
    source_image_paths: list[str] = []
    evaluations: list[ChunkEvaluation] = []
    for index, chunk in enumerate(chunks):
        metadata = chunk.get("metadata") or {}
        image_paths = [str(path) for path in metadata.get("images", []) if path]
        expected_source = chunk.get("source_name") == case.source.filename
        displayed = bool(chunk.get("linked_for_display"))
        supports_image_fact = expected_source and displayed and bool(image_paths)
        if supports_image_fact:
            source_image_paths.extend(image_paths)
        evaluations.append(
            ChunkEvaluation(
                index=index,
                relevance_score=3
                if supports_image_fact
                else (2 if expected_source else 0),
                supported_fact_indexes=(
                    list(range(len(case.required_facts))) if supports_image_fact else []
                ),
                evidence=(
                    f"Chunk is linked to the assistant message and exposes "
                    f"{len(image_paths)} image(s) from the expected source."
                    if supports_image_fact
                    else "Chunk does not expose a displayable image from the expected source."
                ),
            )
        )

    source_image_paths = list(dict.fromkeys(source_image_paths))
    passed = len(source_image_paths) >= case.minimum_source_images
    evidence = (
        f"Found {len(source_image_paths)} displayable image(s) from "
        f"{case.source.filename}; required {case.minimum_source_images}."
    )
    judge = JudgeResult(
        required_facts=[
            CriterionResult(index=index, satisfied=passed, evidence=evidence)
            for index in range(len(case.required_facts))
        ],
        forbidden_claims=[],
        feedback=evidence,
    )
    chunk_judge = ChunkJudgeResult(
        chunks=evaluations,
        feedback=(
            "Source-image evaluation checks images on chunks actually linked to the "
            "assistant message, matching what the client can display."
        ),
    )
    return judge, chunk_judge, source_image_paths


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


async def _judge_answer(
    case: BenchmarkCase,
    answer: str,
    settings: Settings,
) -> JudgeResult:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    schema = {
        "type": "json_schema",
        "json_schema": {
            "name": "benchmark_judgement",
            "strict": True,
            "schema": JudgeResult.model_json_schema(),
        },
    }
    payload = {
        "question": case.question,
        "reference_answer": case.reference_answer,
        "required_facts": list(enumerate(case.required_facts)),
        "forbidden_claims": list(enumerate(case.forbidden_claims)),
        "assistant_answer": answer,
    }
    request: dict[str, Any] = {
        "model": settings.benchmark_judge_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Jesteś rygorystycznym sędzią odpowiedzi technicznych. Oceniaj "
                    "znaczenie, nie identyczność słów. Dla każdego required_facts zwróć "
                    "satisfied=true tylko gdy odpowiedź jasno przekazuje dany fakt. Dla "
                    "forbidden_claims zwróć satisfied=true, gdy odpowiedź zawiera lub "
                    "sugeruje zakazane twierdzenie. Nie uzupełniaj braków wiedzą z odpowiedzi "
                    "referencyjnej. Evidence ma być krótkim cytatem albo opisem braku. "
                    "Dla faktu normalizacji kodu uznaj kryterium za spełnione, gdy użytkownik "
                    "podaje kod bez separatora, a odpowiedź bezpośrednio opisuje odpowiadający "
                    "mu kod ze separatorem. Odpowiedź nie musi powtarzać surowego zapisu ani "
                    "mówić wprost, że oba zapisy są równoważne. "
                    "Zachowaj wszystkie indeksy i ich kolejność."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(payload, ensure_ascii=False),
            },
        ],
        "response_format": schema,
        "reasoning_effort": settings.benchmark_judge_reasoning_effort,
    }
    response = await client.chat.completions.create(**cast(Any, request))
    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("Judge returned an empty response.")
    result = JudgeResult.model_validate_json(content)
    required_indexes = [item.index for item in result.required_facts]
    forbidden_indexes = [item.index for item in result.forbidden_claims]
    if required_indexes != list(range(len(case.required_facts))):
        raise RuntimeError("Judge returned invalid required-fact indexes.")
    if forbidden_indexes != list(range(len(case.forbidden_claims))):
        raise RuntimeError("Judge returned invalid forbidden-claim indexes.")
    return result


async def _judge_chunks(
    case: BenchmarkCase,
    chunks: list[dict[str, Any]],
    settings: Settings,
) -> ChunkJudgeResult:
    if not chunks:
        return ChunkJudgeResult(chunks=[], feedback="No chunks were retrieved.")

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    schema = {
        "type": "json_schema",
        "json_schema": {
            "name": "benchmark_chunk_judgement",
            "strict": True,
            "schema": ChunkJudgeResult.model_json_schema(),
        },
    }
    payload = {
        "question": case.question,
        "reference_answer": case.reference_answer,
        "required_facts": list(enumerate(case.required_facts)),
        "chunks_after_reranker": [
            {
                "index": index,
                "content": chunk["content"],
                "source_name": chunk.get("source_name"),
                "metadata": chunk.get("metadata", {}),
            }
            for index, chunk in enumerate(chunks)
        ],
    }
    request: dict[str, Any] = {
        "model": settings.benchmark_judge_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a strict retrieval evaluator. Evaluate every chunk only "
                    "against the question and required facts. relevance_score: 0 means "
                    "irrelevant, 1 weakly related, 2 useful and relevant, 3 directly "
                    "supports the central answer. Include a required-fact index only "
                    "when the chunk explicitly supports that fact. Do not infer missing "
                    "information from the reference answer. For an identifier-normalization "
                    "fact, a chunk containing the separator-form code corresponding to the "
                    "raw code in the question supports that fact; the chunk does not need to "
                    "state their equivalence explicitly. Return every chunk index once "
                    "and in the original order. Evidence must be concise."
                ),
            },
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        "response_format": schema,
        "reasoning_effort": settings.benchmark_judge_reasoning_effort,
    }
    response = await client.chat.completions.create(**cast(Any, request))
    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("Chunk judge returned an empty response.")
    result = ChunkJudgeResult.model_validate_json(content)
    if [item.index for item in result.chunks] != list(range(len(chunks))):
        raise RuntimeError("Chunk judge returned invalid chunk indexes.")
    valid_fact_indexes = set(range(len(case.required_facts)))
    if any(
        len(item.supported_fact_indexes) != len(set(item.supported_fact_indexes))
        or not set(item.supported_fact_indexes).issubset(valid_fact_indexes)
        for item in result.chunks
    ):
        raise RuntimeError("Chunk judge returned invalid required-fact indexes.")
    return result


async def run_benchmark_case(
    case: BenchmarkCase,
    settings: Settings,
    session: AsyncSession,
    cancellation_event: asyncio.Event | None = None,
) -> dict[str, Any]:
    _raise_if_cancelled(cancellation_event)
    device = await session.scalar(
        select(Device)
        .where(Device.model_serial_code == BENCHMARK_MODEL_SERIAL_CODE)
        .order_by(Device.id)
    )
    if device is None:
        raise RuntimeError("Run the full benchmark setup before running cases.")

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
        _raise_if_cancelled(cancellation_event)
        response = await _await_with_cancellation(
            threads.create_message(
                thread_id=thread.id,
                body=MessageCreate(
                    content=content,
                    diagnostic_mode_enabled=case.diagnostic_mode_enabled,
                ),
                settings=settings,
                session=session,
                debug=True,
            ),
            cancellation_event,
        )
        return await _await_with_cancellation(
            _consume_assistant_response(response), cancellation_event
        )

    conversation = await _collect_benchmark_conversation(case.question, send)
    route = conversation[0]["route"]
    message_payloads = [turn["message"] for turn in conversation]
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

    _raise_if_cancelled(cancellation_event)
    answer = "\n\n--- Kontynuacja ---\n\n".join(
        str(payload["content"]) for payload in message_payloads
    )
    source_image_paths: list[str] = []
    if case.evaluation_mode == "source_image":
        judge, chunk_judge, source_image_paths = _source_image_judgement(
            case, chunks_for_judge
        )
        judge_model = "deterministic-source-image-check"
        judge_reasoning_effort = "not applicable"
    else:
        judge, chunk_judge = await _await_with_cancellation(
            asyncio.gather(
                _judge_answer(case, answer, settings),
                _judge_chunks(case, chunks_for_judge, settings),
            ),
            cancellation_event,
        )
        judge_model = settings.benchmark_judge_model
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
        and fact_coverage_threshold_passed
        and forbidden_found == 0
    )
    _raise_if_cancelled(cancellation_event)

    return {
        "case_id": case.id,
        "passed": passed,
        "score": round(required_score * 100),
        "required_facts_threshold": round(REQUIRED_FACTS_PASS_THRESHOLD * 100),
        "required_facts_threshold_passed": required_facts_threshold_passed,
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
            }
            for payload in message_payloads
        ],
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
        "judge_reasoning_effort": judge_reasoning_effort,
        "judge": judge.model_dump(mode="json"),
    }
