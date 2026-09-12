import asyncio
import json
import time
from collections.abc import Awaitable, Callable, Mapping
from typing import Any

from app.benchmarks.cancellation import (
    await_with_cancellation,
    raise_if_cancelled,
)
from app.benchmarks.models import BenchmarkCase, BenchmarkSimulationFact
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
from app.services.chat.agent import engine as agent_engine
from app.services.chat.agent import diagnostic_extractor
from app.services.chat.agent import gap_finder
from app.services.chat.agent import diagnostic_state as diagnostic_state_service
from app.services.chat.agent import next_best_step as agent_next_best_step
from app.services.chat.agent import retrieval as agent_retrieval
from app.services.chat.agent.diagnostic_state import (
    DiagnosticFact,
    DiagnosticGap,
    DiagnosticState,
)
from app.services.chat.agent.models import CaseContext, MachineContext
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


def _conversation_stage_timings_ms(
    conversation: list[dict[str, Any]],
) -> dict[str, int]:
    timings: dict[str, int] = {}
    for turn in conversation:
        for event in turn.get("debug", []):
            step = event.get("step")
            duration_ms = event.get("duration_ms")
            if step not in {"route", "retrieval", "generation"} or not isinstance(
                duration_ms, int | float
            ):
                continue
            if step == "generation":
                time_to_first_chunk_ms = event.get("time_to_first_chunk_ms")
                if isinstance(time_to_first_chunk_ms, int | float):
                    generation_ms = round(float(time_to_first_chunk_ms))
                    timings["generation"] = timings.get("generation", 0) + generation_ms
                    timings["streaming"] = timings.get("streaming", 0) + max(
                        0, round(float(duration_ms)) - generation_ms
                    )
                    continue
            timings[step] = timings.get(step, 0) + round(float(duration_ms))
            if step == "retrieval":
                data = event.get("data")
                translation_duration_ms = (
                    data.get("translation_duration_ms")
                    if isinstance(data, dict)
                    else None
                )
                if isinstance(translation_duration_ms, int | float):
                    timings["translation"] = timings.get("translation", 0) + round(
                        float(translation_duration_ms)
                    )
    return timings


def _response_timeline(
    conversation: list[dict[str, Any]], total_duration_ms: int | None = None
) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    offset_ms = 0
    timeline_steps = {"route", "retrieval", "generation", "persistence"}
    for turn_index, turn in enumerate(conversation, start=1):
        turn_events = [
            event
            for event in turn.get("debug", [])
            if event.get("step") in timeline_steps
            and isinstance(event.get("start_ms"), int | float)
            and isinstance(event.get("end_ms"), int | float)
        ]
        measured_duration_ms = round(float(turn.get("duration_ms", 0)))
        pipeline_end_ms = max(
            (round(float(event["end_ms"])) for event in turn_events), default=0
        )
        turn_duration_ms = max(measured_duration_ms, pipeline_end_ms)
        cursor_ms = 0
        for event in sorted(turn_events, key=lambda item: float(item["start_ms"])):
            event_start_ms = round(float(event["start_ms"]))
            event_end_ms = round(float(event["end_ms"]))
            if event_start_ms > cursor_ms:
                items.append(
                    {
                        "key": "response_overhead",
                        "label": "Pozostała obsługa odpowiedzi",
                        "turn": turn_index,
                        "start_ms": offset_ms + cursor_ms,
                        "end_ms": offset_ms + event_start_ms,
                        "duration_ms": event_start_ms - cursor_ms,
                    }
                )
            first_chunk_ms = event.get("first_chunk_ms")
            if event.get("step") == "generation" and isinstance(
                first_chunk_ms, int | float
            ):
                marker_ms = round(float(first_chunk_ms))
                items.append(
                    {
                        "key": "generation",
                        "label": "Generowanie odpowiedzi",
                        "turn": turn_index,
                        "start_ms": offset_ms + event_start_ms,
                        "end_ms": offset_ms + marker_ms,
                        "duration_ms": max(0, marker_ms - event_start_ms),
                    }
                )
                items.append(
                    {
                        "key": "streaming",
                        "label": "Streamowanie odpowiedzi",
                        "turn": turn_index,
                        "start_ms": offset_ms + marker_ms,
                        "end_ms": offset_ms + event_end_ms,
                        "duration_ms": max(0, event_end_ms - marker_ms),
                    }
                )
            else:
                items.append(
                    {
                        "key": event["step"],
                        "label": event.get("label", event["step"]),
                        "turn": turn_index,
                        "start_ms": offset_ms + event_start_ms,
                        "end_ms": offset_ms + event_end_ms,
                        "duration_ms": round(float(event.get("duration_ms", 0))),
                    }
                )
            cursor_ms = max(cursor_ms, event_end_ms)
        if turn_duration_ms > cursor_ms:
            items.append(
                {
                    "key": "response_overhead",
                    "label": "Pozostała obsługa odpowiedzi",
                    "turn": turn_index,
                    "start_ms": offset_ms + cursor_ms,
                    "end_ms": offset_ms + turn_duration_ms,
                    "duration_ms": turn_duration_ms - cursor_ms,
                }
            )
        offset_ms += turn_duration_ms
    if total_duration_ms is not None and total_duration_ms > offset_ms:
        items.append(
            {
                "key": "response_overhead",
                "label": "Pozostała obsługa odpowiedzi",
                "turn": len(conversation),
                "start_ms": offset_ms,
                "end_ms": total_duration_ms,
                "duration_ms": total_duration_ms - offset_ms,
            }
        )
        offset_ms = total_duration_ms
    return {"duration_ms": offset_ms, "items": items}


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
    chunk: Mapping[str, Any], source_names_by_id: dict[int, str]
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
        "reranker_score": chunk.get("reranker_score"),
    }


def _resolve_simulation_fact(
    case: BenchmarkCase, fact_key: str
) -> tuple[str, BenchmarkSimulationFact]:
    matches = [
        (canonical_key, fact)
        for canonical_key, fact in case.simulation_facts.items()
        if fact_key == canonical_key or fact_key in fact.aliases
    ]
    if not matches:
        return (
            fact_key,
            BenchmarkSimulationFact(
                value=False,
                technician_reply="Tego nie zaobserwowano.",
            ),
        )
    if len(matches) != 1:
        matching_keys = ", ".join(key for key, _fact in matches)
        raise RuntimeError(
            f"Agent benchmark case {case.id!r} maps Best Next Step key "
            f"{fact_key!r} ambiguously to: {matching_keys}."
        )
    return matches[0]


def _benchmark_fact_key_vocabulary(
    case: BenchmarkCase, case_context: CaseContext
) -> list[str]:
    keys = [
        case_context.symptom.fact_key,
        *(observation.key for observation in case_context.observations),
        *case.simulation_facts.keys(),
    ]
    return list(dict.fromkeys(keys))


def _apply_simulation_fact(
    state: DiagnosticState,
    selected_fact_key: str,
    simulation_fact: BenchmarkSimulationFact,
) -> DiagnosticState:
    resolved_fact = DiagnosticFact(
        key=selected_fact_key,
        value=simulation_fact.value,
        unit=simulation_fact.unit,
        certainty="certain",
        source="observation",
    )
    facts = [fact for fact in state.facts if fact.key != selected_fact_key]
    facts.append(resolved_fact)
    return gap_finder.enrich_with_gaps(state.model_copy(update={"facts": facts}))


def _has_unique_action_resolution(
    state: DiagnosticState, min_primary_actions: int
) -> bool:
    """Return true only when one still-viable repair rule is fully matched."""
    viable_action_rules = [
        (rule, rule_state)
        for rule, rule_state in zip(state.rules, state.rule_states, strict=True)
        if rule.actions and rule_state.status != "conflicting"
    ]
    return (
        len(viable_action_rules) == 1
        and viable_action_rules[0][1].status == "matched"
        and len(viable_action_rules[0][0].actions) >= min_primary_actions
    )


def _diagnostic_gap_cache_key(gap: DiagnosticGap) -> tuple[str, str, str, str]:
    return (
        gap.fact_key,
        gap.operator,
        repr(gap.expected_value),
        gap.unit or "",
    )


def _cache_gap_assessments(
    state: DiagnosticState,
    decision: agent_next_best_step.AgentNextStepDecision,
    cache: dict[tuple[str, str, str, str], agent_next_best_step.RankedGapAssessment],
) -> None:
    for assessment in decision.assessments:
        if 0 <= assessment.gap_index < len(state.gaps):
            cache[_diagnostic_gap_cache_key(state.gaps[assessment.gap_index])] = (
                assessment
            )


def _select_from_cached_gap_assessments(
    state: DiagnosticState,
    cache: dict[tuple[str, str, str, str], agent_next_best_step.RankedGapAssessment],
) -> agent_next_best_step.AgentNextStepDecision | None:
    cached = [cache.get(_diagnostic_gap_cache_key(gap)) for gap in state.gaps]
    if any(assessment is None for assessment in cached):
        return None

    assessments = []
    for gap_index, assessment in enumerate(cached):
        if assessment is None:
            continue
        values = assessment.model_dump(exclude={"score"})
        values["gap_index"] = gap_index
        assessments.append(agent_next_best_step.GapAssessment.model_validate(values))
    return agent_next_best_step.select_from_evaluation(
        state,
        agent_next_best_step.GapEvaluation(assessments=assessments),
    )


async def _simulate_agent_next_steps(
    case: BenchmarkCase,
    state: DiagnosticState,
    settings: Settings,
    cancellation_event: asyncio.Event | None,
) -> tuple[
    DiagnosticState,
    agent_next_best_step.AgentNextStepDecision,
    list[dict[str, Any]],
]:
    steps: list[dict[str, Any]] = []
    used_fact_keys: set[str] = set()
    assessment_cache: dict[
        tuple[str, str, str, str], agent_next_best_step.RankedGapAssessment
    ] = {}

    while True:
        required_evidence = (
            set(case.agent_goal.required_evidence_fact_keys)
            if case.agent_goal
            else set()
        )
        observed_fact_keys = {
            str(step["canonical_fact_key"])
            for step in steps
            if step.get("canonical_fact_key")
        }
        observed_evidence = required_evidence.intersection(observed_fact_keys)
        has_resolution_match = (
            _has_unique_action_resolution(state, case.agent_goal.min_primary_actions)
            if case.agent_goal and case.agent_goal.min_primary_actions > 0
            else bool(case.agent_goal)
        )
        if (
            required_evidence
            and observed_evidence == required_evidence
            and has_resolution_match
        ):
            return (
                state,
                agent_next_best_step.AgentNextStepDecision(
                    status="no_gaps",
                    reason=(
                        "The required diagnostic evidence was observed and a relevant "
                        "repair rule is uniquely matched; no other action-bearing "
                        "candidate remains viable."
                    ),
                ),
                steps,
            )

        if not state.gaps:
            return (
                state,
                agent_next_best_step.AgentNextStepDecision(
                    status="no_gaps",
                    reason="The diagnostic state contains no unresolved gaps.",
                ),
                steps,
            )

        decision = _select_from_cached_gap_assessments(state, assessment_cache)
        if decision is None:
            decision = await await_with_cancellation(
                agent_next_best_step.evaluate_next_step(state, settings),
                cancellation_event,
            )
            _cache_gap_assessments(state, decision, assessment_cache)
        if decision.status != "selected" or decision.selected is None:
            return state, decision, steps

        selected = decision.selected
        canonical_key, simulation_fact = _resolve_simulation_fact(
            case, selected.fact_key
        )
        if selected.fact_key in used_fact_keys:
            raise RuntimeError(
                f"Agent benchmark case {case.id!r} selected simulation fact "
                f"{selected.fact_key!r} more than once without making progress."
            )
        used_fact_keys.add(selected.fact_key)

        steps.append(
            {
                "turn": len(steps) + 1,
                "technician_prompt": agent_next_best_step.technician_response(decision),
                "technician_reply": simulation_fact.technician_reply,
                "selected_fact_key": selected.fact_key,
                "canonical_fact_key": canonical_key,
                "fact_value": simulation_fact.value,
                "unit": simulation_fact.unit,
                "decision": decision.model_dump(mode="json"),
            }
        )
        state = _apply_simulation_fact(state, selected.fact_key, simulation_fact)
        if canonical_key != selected.fact_key:
            state = _apply_simulation_fact(state, canonical_key, simulation_fact)


def _unique_non_empty(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value.strip() for value in values if value.strip()))


def _build_final_diagnostic_answer(
    state: DiagnosticState,
    max_primary_actions: int | None = None,
    require_unique_action_rule: bool = False,
) -> dict[str, Any]:
    matched = [
        (extraction_index, rule)
        for extraction_index, rule, rule_state in zip(
            state.accepted_rule_indexes,
            state.rules,
            state.rule_states,
            strict=True,
        )
        if rule_state.status == "matched"
    ]
    if require_unique_action_rule:
        viable_action_rules = [
            (extraction_index, rule, rule_state)
            for extraction_index, rule, rule_state in zip(
                state.accepted_rule_indexes,
                state.rules,
                state.rule_states,
                strict=True,
            )
            if rule.actions and rule_state.status != "conflicting"
        ]
        if (
            len(viable_action_rules) != 1
            or viable_action_rules[0][2].status != "matched"
        ):
            return {
                "status": "not_ready",
                "matched_rule_indexes": [index for index, _rule in matched],
                "actions": [],
                "tests": [],
                "constraints": [],
                "source_chunk_ids": [],
                "text": None,
                "reason": (
                    "A unique repair rule has not been established; multiple "
                    "action-bearing candidates are matched or still viable."
                ),
            }
        selected_index, selected_rule, _selected_state = viable_action_rules[0]
        matched = [(selected_index, selected_rule)]
    if not matched:
        if state.gaps:
            return {
                "status": "not_ready",
                "matched_rule_indexes": [],
                "actions": [],
                "tests": [],
                "constraints": [],
                "source_chunk_ids": [],
                "text": None,
                "reason": "No rule is matched and unresolved gaps remain.",
            }
        text = (
            "Uzupełnione fakty nie potwierdzają żadnej zaakceptowanej reguły "
            "diagnostycznej."
        )
        return {
            "status": "no_matching_rules",
            "matched_rule_indexes": [],
            "actions": [],
            "tests": [],
            "constraints": [],
            "source_chunk_ids": [],
            "text": text,
            "reason": "No accepted diagnostic rule is fully matched.",
        }

    actions = _unique_non_empty(
        [action for _index, rule in matched for action in rule.actions]
    )
    if max_primary_actions is not None:
        actions = actions[:max_primary_actions]
    tests = _unique_non_empty([test for _index, rule in matched for test in rule.tests])
    constraints = _unique_non_empty(
        [constraint for _index, rule in matched for constraint in rule.constraints]
    )
    source_chunk_ids = sorted(
        {chunk_id for _index, rule in matched for chunk_id in rule.source_chunk_ids}
    )

    sections: list[str] = []
    if actions:
        sections.append(
            "Zalecane działania:\n"
            + "\n".join(
                f"{index}. {action}" for index, action in enumerate(actions, start=1)
            )
        )
    elif tests:
        sections.append(
            "Udokumentowane sprawdzenia:\n" + "\n".join(f"- {test}" for test in tests)
        )
    if constraints:
        sections.append(
            "Ograniczenia i ostrzeżenia:\n"
            + "\n".join(f"- {constraint}" for constraint in constraints)
        )
    text = "\n\n".join(sections)

    status = "completed_with_unresolved_alternatives" if state.gaps else "completed"
    return {
        "status": status,
        "matched_rule_indexes": [index for index, _rule in matched],
        "actions": actions,
        "tests": tests,
        "constraints": constraints,
        "source_chunk_ids": source_chunk_ids,
        "text": text,
        "reason": (
            "Composed only from fully matched accepted diagnostic rules; gaps in "
            "other candidate rules were not used."
            if state.gaps
            else "Composed only from fully matched accepted diagnostic rules."
        ),
    }


async def _judge_agent_answer(
    case: BenchmarkCase,
    answer: str,
    chunks: list[dict[str, Any]],
    source_names: list[str],
    settings: Settings,
    cancellation_event: asyncio.Event | None,
    agent_simulation_steps: list[dict[str, Any]] | None = None,
    final_diagnostic_answer: dict[str, Any] | None = None,
) -> dict[str, Any]:
    simulation_steps = agent_simulation_steps or []
    final_answer = final_diagnostic_answer or {}
    agent_trajectory = {
        "simulation_steps": simulation_steps,
        "final_diagnostic_answer": final_answer,
    }
    judge, chunk_judge = await await_with_cancellation(
        asyncio.gather(
            judge_answer(case, answer, settings, agent_trajectory=agent_trajectory),
            judge_chunks(case, chunks, settings),
        ),
        cancellation_event,
    )
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
    required_total = len(case.required_facts)
    required_score = required_passed / required_total if required_total else 1.0
    required_behaviors_passed = sum(item.satisfied for item in judge.required_behaviors)
    required_behaviors_total = len(case.required_behaviors)
    forbidden_found = sum(item.satisfied for item in judge.forbidden_claims)
    required_facts_threshold_passed = required_score >= REQUIRED_FACTS_PASS_THRESHOLD
    fact_coverage_threshold_passed = (
        case.agent_goal is not None or fact_coverage >= FACT_COVERAGE_PASS_THRESHOLD
    )
    required_behaviors_threshold_passed = (
        required_behaviors_passed == required_behaviors_total
    )
    source_passed = case.source.filename in source_names
    observed_fact_keys = {
        str(step.get("canonical_fact_key") or step.get("selected_fact_key"))
        for step in simulation_steps
    }
    required_evidence_fact_keys = (
        case.agent_goal.required_evidence_fact_keys if case.agent_goal else []
    )
    evidence_before_fix_passed = set(required_evidence_fact_keys).issubset(
        observed_fact_keys
    )
    primary_action_count = len(final_answer.get("actions", []))
    primary_action_count_passed = (
        case.agent_goal is None
        or case.agent_goal.min_primary_actions
        <= primary_action_count
        <= case.agent_goal.max_primary_actions
    )
    unique_resolution_passed = (
        case.agent_goal is None
        or case.agent_goal.min_primary_actions == 0
        or (
            final_answer.get("status")
            in {"completed", "completed_with_unresolved_alternatives"}
            and len(final_answer.get("matched_rule_indexes", [])) == 1
        )
    )
    agent_goal_passed = (
        evidence_before_fix_passed
        and primary_action_count_passed
        and unique_resolution_passed
    )
    passed = (
        source_passed
        and required_facts_threshold_passed
        and required_behaviors_threshold_passed
        and fact_coverage_threshold_passed
        and forbidden_found == 0
        and agent_goal_passed
    )
    return {
        "evaluation_skipped": False,
        "passed": passed,
        "score": round(required_score * 100),
        "required_facts_threshold": round(REQUIRED_FACTS_PASS_THRESHOLD * 100),
        "required_facts_threshold_passed": required_facts_threshold_passed,
        "required_behaviors_passed": required_behaviors_passed,
        "required_behaviors_total": required_behaviors_total,
        "required_behaviors_threshold_passed": required_behaviors_threshold_passed,
        "source_passed": source_passed,
        "source_names": source_names,
        "agent_goal_passed": agent_goal_passed,
        "required_evidence_fact_keys": required_evidence_fact_keys,
        "observed_evidence_fact_keys": sorted(
            set(required_evidence_fact_keys).intersection(observed_fact_keys)
        ),
        "evidence_before_fix_passed": evidence_before_fix_passed,
        "primary_action_count": primary_action_count,
        "primary_action_minimum": (
            case.agent_goal.min_primary_actions if case.agent_goal else None
        ),
        "primary_action_limit": (
            case.agent_goal.max_primary_actions if case.agent_goal else None
        ),
        "primary_action_limit_passed": primary_action_count_passed,
        "unique_resolution_passed": unique_resolution_passed,
        "chunk_precision_at_k": round(precision_at_k * 100),
        "chunk_fact_coverage": round(fact_coverage * 100),
        "fact_coverage_threshold": round(FACT_COVERAGE_PASS_THRESHOLD * 100),
        "fact_coverage_threshold_passed": fact_coverage_threshold_passed,
        "chunk_relevant": relevant_chunks,
        "chunk_total": len(chunk_judge.chunks),
        "chunk_judge": chunk_judge.model_dump(mode="json"),
        "required_passed": required_passed,
        "required_total": required_total,
        "forbidden_found": forbidden_found,
        "judge_model": settings.benchmark_judge_model,
        "chunk_judge_model": settings.benchmark_chunk_judge_model,
        "judge_reasoning_effort": settings.benchmark_judge_reasoning_effort,
        "judge": judge.model_dump(mode="json"),
    }


async def _run_agent_retrieval_benchmark(
    case: BenchmarkCase,
    device: Device,
    settings: Settings,
    session: AsyncSession,
    cancellation_event: asyncio.Event | None,
    evaluate: bool = True,
) -> dict[str, Any]:
    pipeline_started_at = time.perf_counter()
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
    preparation_finished_at = time.perf_counter()
    retrieval_trace: dict[str, Any] = {}
    retrieved_chunks = await await_with_cancellation(
        agent_retrieval.retrieve_for_agent_queries(
            session,
            queries,
            device_id=device.id,
            settings=settings,
            retrieval_trace=retrieval_trace,
        ),
        cancellation_event,
    )
    retrieval_finished_at = time.perf_counter()
    fact_key_vocabulary = _benchmark_fact_key_vocabulary(case, case_context)
    extraction = await await_with_cancellation(
        diagnostic_extractor.extract_diagnostic_evidence(
            case_context,
            retrieved_chunks,
            settings,
            fact_key_vocabulary=fact_key_vocabulary,
            required_condition_fact_keys=(
                case.agent_goal.required_evidence_fact_keys if case.agent_goal else None
            ),
        ),
        cancellation_event,
    )
    extraction_finished_at = time.perf_counter()
    evidence_gate = diagnostic_extractor.evaluate_extracted_evidence(
        extraction,
        retrieved_chunks,
        allowed_fact_keys=set(fact_key_vocabulary),
    )
    evidence_gate_finished_at = time.perf_counter()
    diagnostic_state = diagnostic_state_service.prepare_diagnostic_state(
        case_context, extraction, evidence_gate
    )
    diagnostic_state_finished_at = time.perf_counter()
    diagnostic_state = gap_finder.enrich_with_gaps(diagnostic_state)
    gap_finder_finished_at = time.perf_counter()
    diagnostic_state_before_simulation = diagnostic_state
    (
        diagnostic_state,
        next_step,
        agent_simulation_steps,
    ) = await _simulate_agent_next_steps(
        case,
        diagnostic_state,
        settings,
        cancellation_event,
    )
    agent_next_step_decisions = [
        step["decision"]
        for step in agent_simulation_steps
        if isinstance(step.get("decision"), dict)
    ]
    terminal_next_step = next_step.model_dump(mode="json")
    if (
        not agent_next_step_decisions
        or agent_next_step_decisions[-1] != terminal_next_step
    ):
        agent_next_step_decisions.append(terminal_next_step)
    agent_simulation_steps = [
        {key: value for key, value in step.items() if key != "decision"}
        for step in agent_simulation_steps
    ]
    final_diagnostic_answer = _build_final_diagnostic_answer(
        diagnostic_state,
        max_primary_actions=(
            case.agent_goal.max_primary_actions if case.agent_goal else None
        ),
        require_unique_action_rule=bool(
            case.agent_goal and case.agent_goal.min_primary_actions > 0
        ),
    )
    next_step_finished_at = time.perf_counter()
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

    serialized_after_gate = serialize_many(
        retrieval_trace.get("after_evidence_gate", [])
    )
    result: dict[str, Any] = {
        "case_id": case.id,
        "mode": ChatMode.agent.value,
        "pipeline_stage": "final_answer_composed",
        "stage_timings_ms": {
            "message": 0,
            "case_context_and_query_rewrite": round(
                (preparation_finished_at - pipeline_started_at) * 1000
            ),
            "retrieval_and_reranker": max(
                0,
                round((retrieval_finished_at - preparation_finished_at) * 1000)
                - int(retrieval_trace.get("initial_evidence_gate_duration_ms", 0)),
            ),
            "initial_evidence_gate": int(
                retrieval_trace.get("initial_evidence_gate_duration_ms", 0)
            ),
            "diagnostic_extractor": round(
                (extraction_finished_at - retrieval_finished_at) * 1000
            ),
            "evidence_gate": round(
                (evidence_gate_finished_at - extraction_finished_at) * 1000
            ),
            "diagnostic_state": round(
                (diagnostic_state_finished_at - evidence_gate_finished_at) * 1000
            ),
            "gap_finder": round(
                (gap_finder_finished_at - diagnostic_state_finished_at) * 1000
            ),
            "next_best_step": round(
                (next_step_finished_at - gap_finder_finished_at) * 1000
            ),
        },
        "total_time_ms": round((next_step_finished_at - pipeline_started_at) * 1000),
        "question": case.question,
        "assumptions": [
            assumption.model_dump(mode="json") for assumption in case.assumptions
        ],
        "simulation_facts": {
            fact_key: fact.model_dump(mode="json")
            for fact_key, fact in case.simulation_facts.items()
        },
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
        "initial_evidence_gate": retrieval_trace.get("initial_evidence_gate"),
        "chunks_after_evidence_gate": serialized_after_gate,
        "diagnostic_extractor_model": settings.agent_diagnostic_extractor_model,
        "agent_next_step_model": settings.agent_next_step_model,
        "diagnostic_extraction": extraction.model_dump(mode="json"),
        "fact_key_vocabulary": fact_key_vocabulary,
        "evidence_gate": evidence_gate.model_dump(mode="json"),
        "diagnostic_state_before_simulation": (
            diagnostic_state_before_simulation.model_dump(mode="json")
        ),
        "diagnostic_state": diagnostic_state.model_dump(mode="json"),
        "agent_next_step": next_step.model_dump(mode="json"),
        "agent_next_step_decisions": agent_next_step_decisions,
        "agent_simulation_steps": agent_simulation_steps,
        "final_diagnostic_answer": final_diagnostic_answer,
        "answer": final_diagnostic_answer["text"],
        "technician_response": agent_next_best_step.technician_response(next_step),
        "retrieval_timelines": [
            {
                "label": "Agent retrieval",
                "layout": "chronological",
                "duration_ms": round(
                    (retrieval_finished_at - preparation_finished_at) * 1000
                ),
                "items": retrieval_trace.get("timeline", []),
            }
        ],
        "query_runs": [
            {
                "query": trace.get("query", ""),
                "chunks": serialize_many(trace.get("chunks", [])),
                "duration_ms": trace.get("duration_ms"),
            }
            for trace in query_traces
        ],
    }

    if not evaluate:
        result["evaluation_skipped"] = True
        result["stage_timings_ms"]["evaluation"] = 0
        return result

    judge_source_chunks = (
        retrieval_trace.get("after_evidence_gate", []) or retrieved_chunks
    )
    chunks_for_judge = [
        {
            **_serialize_retrieval_chunk(chunk, source_names_by_id),
            "content": str(chunk.get("content", chunk.get("preview", ""))),
        }
        for chunk in judge_source_chunks
    ]
    source_names = list(
        dict.fromkeys(
            str(chunk["source_name"])
            for chunk in chunks_for_judge
            if chunk.get("source_name")
        )
    )
    evaluation_started_at = time.perf_counter()
    evaluation = await _judge_agent_answer(
        case,
        str(final_diagnostic_answer["text"] or ""),
        chunks_for_judge,
        source_names,
        settings,
        cancellation_event,
        agent_simulation_steps=agent_simulation_steps,
        final_diagnostic_answer=final_diagnostic_answer,
    )
    evaluation_finished_at = time.perf_counter()
    result["pipeline_stage"] = "benchmark_evaluated"
    result["stage_timings_ms"]["evaluation"] = round(
        (evaluation_finished_at - evaluation_started_at) * 1000
    )
    result["total_time_ms"] = round(
        (evaluation_finished_at - pipeline_started_at) * 1000
    )
    result.update(evaluation)
    return result


async def run_benchmark_case(
    case: BenchmarkCase,
    settings: Settings,
    session: AsyncSession,
    cancellation_event: asyncio.Event | None = None,
    evaluate: bool = True,
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
            evaluate=evaluate,
        )

    benchmark_started_at = time.perf_counter()
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
        turn_started_at = time.perf_counter()
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
        turn = await await_with_cancellation(
            _consume_assistant_response(response), cancellation_event
        )
        turn["duration_ms"] = round((time.perf_counter() - turn_started_at) * 1000)
        return turn

    conversation_started_at = time.perf_counter()
    conversation = await _collect_benchmark_conversation(case.question, send)
    conversation_finished_at = time.perf_counter()
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

    if not evaluate:
        benchmark_finished_at = time.perf_counter()
        response_total_ms = round(
            (conversation_finished_at - conversation_started_at) * 1000
        )
        result_preparation_ms = round(
            (benchmark_finished_at - conversation_finished_at) * 1000
        )
        benchmark_total_ms = round(
            (benchmark_finished_at - benchmark_started_at) * 1000
        )
        stage_timings_ms = _conversation_stage_timings_ms(conversation)
        response_accounted_ms = sum(
            stage_timings_ms.get(step, 0)
            for step in ("route", "retrieval", "generation", "streaming")
        )
        stage_timings_ms.update(
            {
                "conversation_total": response_total_ms,
                "response_overhead": max(0, response_total_ms - response_accounted_ms),
                "result_preparation": result_preparation_ms,
                "evaluation": 0,
                "benchmark_overhead": max(
                    0,
                    benchmark_total_ms - response_total_ms - result_preparation_ms,
                ),
            }
        )
        return {
            "case_id": case.id,
            "evaluation_skipped": True,
            "stage_timings_ms": stage_timings_ms,
            "total_time_ms": benchmark_total_ms,
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
            "source_names": source_names,
            "retrieved_chunk_count": len(retrieved_chunks),
            "reranker_enabled": bool(retrieval_data.get("reranker_enabled", False)),
            "reranker_status": retrieval_data.get("reranker_status", "not_run"),
            "chunks_before_reranker": chunks_before_reranker,
            "chunks_after_reranker": chunks_after_reranker,
            "response_timeline": _response_timeline(
                conversation, total_duration_ms=response_total_ms
            ),
            "retrieval_timelines": [
                {
                    "turn": index + 1,
                    "duration_ms": item.get("duration_ms", 0),
                    "items": item.get("data", {}).get("timeline", []),
                }
                for index, item in enumerate(
                    next(
                        (
                            event
                            for event in turn["debug"]
                            if event.get("step") == "retrieval"
                        ),
                        {},
                    )
                    for turn in conversation
                )
            ],
        }

    source_image_paths: list[str] = []
    evaluation_started_at = time.perf_counter()
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
    evaluation_finished_at = time.perf_counter()
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
    benchmark_finished_at = time.perf_counter()

    stage_timings_ms = _conversation_stage_timings_ms(conversation)
    response_total_ms = round(
        (conversation_finished_at - conversation_started_at) * 1000
    )
    result_preparation_ms = round(
        (evaluation_started_at - conversation_finished_at) * 1000
    )
    evaluation_ms = round((evaluation_finished_at - evaluation_started_at) * 1000)
    benchmark_total_ms = round((benchmark_finished_at - benchmark_started_at) * 1000)
    response_accounted_ms = sum(
        stage_timings_ms.get(step, 0)
        for step in ("route", "retrieval", "generation", "streaming")
    )
    stage_timings_ms.update(
        {
            "conversation_total": response_total_ms,
            "response_overhead": max(0, response_total_ms - response_accounted_ms),
            "result_preparation": result_preparation_ms,
            "evaluation": evaluation_ms,
            "benchmark_overhead": max(
                0,
                benchmark_total_ms
                - response_total_ms
                - result_preparation_ms
                - evaluation_ms,
            ),
        }
    )

    return {
        "case_id": case.id,
        "evaluation_skipped": False,
        "stage_timings_ms": stage_timings_ms,
        "total_time_ms": benchmark_total_ms,
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
        "assumptions": [
            assumption.model_dump(mode="json") for assumption in case.assumptions
        ],
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
        "response_timeline": _response_timeline(
            conversation, total_duration_ms=response_total_ms
        ),
        "retrieval_timelines": [
            {
                "turn": index + 1,
                "duration_ms": item.get("duration_ms", 0),
                "items": item.get("data", {}).get("timeline", []),
            }
            for index, item in enumerate(
                next(
                    (
                        event
                        for event in turn["debug"]
                        if event.get("step") == "retrieval"
                    ),
                    {},
                )
                for turn in conversation
            )
        ],
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
