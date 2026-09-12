import asyncio
import json
from types import SimpleNamespace
from typing import cast

import pytest

from app.benchmarks.cancellation import await_with_cancellation
from app.benchmarks.dataset import load_benchmark_dataset
from app.benchmarks.evaluation import (
    ChunkEvaluation,
    ChunkJudgeResult,
    CriterionResult,
    JudgeResult,
)
from app.benchmarks.exceptions import BenchmarkCancelledError
from app.config import Settings
from app.models import Device
from app.services.benchmark import runner as benchmark_runner
from app.services.benchmark.judge import judge_answer, judge_chunks
from app.services.chat.agent.diagnostic_extractor import (
    DiagnosticCondition,
    DiagnosticExtraction,
    DiagnosticRule,
)
from app.services.chat.agent.diagnostic_state import (
    DiagnosticGap,
    DiagnosticRuleState,
    DiagnosticState,
)
from app.services.chat.agent.models import (
    CaseContext,
    MachineContext,
    Observation,
    RetrievalQueryPlan,
    Symptom,
)
from app.services.chat.agent.next_best_step import (
    AgentNextStepDecision,
    GapAssessment,
    GapEvaluation,
    select_from_evaluation,
)


def test_pass_thresholds_require_seven_of_eight_facts():
    assert 6 / 8 < benchmark_runner.REQUIRED_FACTS_PASS_THRESHOLD
    assert 7 / 8 >= benchmark_runner.REQUIRED_FACTS_PASS_THRESHOLD
    assert 6 / 8 < benchmark_runner.FACT_COVERAGE_PASS_THRESHOLD
    assert 7 / 8 >= benchmark_runner.FACT_COVERAGE_PASS_THRESHOLD


async def test_agent_judge_should_score_final_answer_and_retrieved_chunks(mocker):
    case = next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_colloquial_controls"
    )
    judge = JudgeResult(
        required_facts=[
            CriterionResult(index=index, satisfied=True, evidence="covered")
            for index in range(len(case.required_facts))
        ],
        required_behaviors=[
            CriterionResult(index=index, satisfied=True, evidence="covered")
            for index in range(len(case.required_behaviors))
        ],
        forbidden_claims=[
            CriterionResult(index=index, satisfied=False, evidence="absent")
            for index in range(len(case.forbidden_claims))
        ],
        feedback="Complete and grounded.",
    )
    chunk_judge = ChunkJudgeResult(
        chunks=[
            ChunkEvaluation(
                index=0,
                relevance_score=3,
                supported_fact_indexes=list(range(len(case.required_facts))),
                evidence="Manual supports the answer.",
            )
        ],
        feedback="Relevant source.",
    )
    mocker.patch(
        "app.services.benchmark.runner.judge_answer",
        new=mocker.AsyncMock(return_value=judge),
    )
    mocker.patch(
        "app.services.benchmark.runner.judge_chunks",
        new=mocker.AsyncMock(return_value=chunk_judge),
    )
    settings = cast(
        Settings,
        SimpleNamespace(
            benchmark_judge_model="judge-model",
            benchmark_chunk_judge_model="chunk-judge-model",
            benchmark_judge_reasoning_effort="low",
        ),
    )

    result = await benchmark_runner._judge_agent_answer(
        case,
        case.reference_answer,
        [{"content": "Click-2-Creep", "source_name": case.source.filename}],
        [case.source.filename],
        settings,
        cancellation_event=None,
        agent_simulation_steps=[
            {
                "selected_fact_key": "display_message",
                "canonical_fact_key": "display_message",
                "fact_value": "SLO",
            }
        ],
        final_diagnostic_answer={
            "status": "completed",
            "matched_rule_indexes": [1],
            "actions": [
                "Rapidly click the travel control twice again to close the function."
            ],
        },
    )

    assert result["passed"] is True
    assert result["score"] == 100
    assert result["source_passed"] is True
    assert result["chunk_fact_coverage"] == 100
    assert result["agent_goal_passed"] is True
    assert result["evidence_before_fix_passed"] is True
    assert result["primary_action_limit_passed"] is True
    assert result["unique_resolution_passed"] is True
    assert result["judge"] == judge.model_dump(mode="json")


async def test_agent_judge_should_reject_evidence_without_required_repair(mocker):
    case = next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_colloquial_controls"
    )
    judge = JudgeResult(
        required_facts=[CriterionResult(index=0, satisfied=False, evidence="missing")],
        required_behaviors=[
            CriterionResult(index=index, satisfied=False, evidence="missing")
            for index in range(len(case.required_behaviors))
        ],
        forbidden_claims=[
            CriterionResult(index=index, satisfied=False, evidence="absent")
            for index in range(len(case.forbidden_claims))
        ],
        feedback="Evidence alone is not the terminal goal.",
    )
    chunk_judge = ChunkJudgeResult(chunks=[], feedback="No repair source.")
    mocker.patch(
        "app.services.benchmark.runner.judge_answer",
        new=mocker.AsyncMock(return_value=judge),
    )
    mocker.patch(
        "app.services.benchmark.runner.judge_chunks",
        new=mocker.AsyncMock(return_value=chunk_judge),
    )

    result = await benchmark_runner._judge_agent_answer(
        case,
        "SLO is displayed.",
        [],
        [case.source.filename],
        cast(
            Settings,
            SimpleNamespace(
                benchmark_judge_model="judge-model",
                benchmark_chunk_judge_model="chunk-judge-model",
                benchmark_judge_reasoning_effort="low",
            ),
        ),
        cancellation_event=None,
        agent_simulation_steps=[{"canonical_fact_key": "display_message"}],
        final_diagnostic_answer={"actions": []},
    )

    assert result["evidence_before_fix_passed"] is True
    assert result["primary_action_limit_passed"] is False
    assert result["agent_goal_passed"] is False


async def test_agent_judge_should_reject_a_lucky_fix_without_required_evidence(
    mocker,
):
    case = next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_colloquial_controls"
    )
    judge = JudgeResult(
        required_facts=[
            CriterionResult(index=0, satisfied=True, evidence="correct fix")
        ],
        required_behaviors=[
            CriterionResult(index=index, satisfied=True, evidence="claimed")
            for index in range(len(case.required_behaviors))
        ],
        forbidden_claims=[
            CriterionResult(index=index, satisfied=False, evidence="absent")
            for index in range(len(case.forbidden_claims))
        ],
        feedback="The final instruction happens to be correct.",
    )
    chunk_judge = ChunkJudgeResult(
        chunks=[
            ChunkEvaluation(
                index=0,
                relevance_score=3,
                supported_fact_indexes=[0],
                evidence="Manual supports the fix.",
            )
        ],
        feedback="Relevant source.",
    )
    mocker.patch(
        "app.services.benchmark.runner.judge_answer",
        new=mocker.AsyncMock(return_value=judge),
    )
    mocker.patch(
        "app.services.benchmark.runner.judge_chunks",
        new=mocker.AsyncMock(return_value=chunk_judge),
    )

    result = await benchmark_runner._judge_agent_answer(
        case,
        "Dwukrotnie naciśnij dźwignię jazdy.",
        [{"content": "Click-2-Creep", "source_name": case.source.filename}],
        [case.source.filename],
        cast(
            Settings,
            SimpleNamespace(
                benchmark_judge_model="judge-model",
                benchmark_chunk_judge_model="chunk-judge-model",
                benchmark_judge_reasoning_effort="low",
            ),
        ),
        cancellation_event=None,
        agent_simulation_steps=[],
        final_diagnostic_answer={"actions": ["Double tap the travel control."]},
    )

    assert result["passed"] is False
    assert result["agent_goal_passed"] is False
    assert result["evidence_before_fix_passed"] is False


async def test_agent_judge_should_reject_multiple_matched_repair_rules(mocker):
    case = next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_colloquial_controls"
    )
    judge = JudgeResult(
        required_facts=[
            CriterionResult(index=index, satisfied=True, evidence="covered")
            for index in range(len(case.required_facts))
        ],
        required_behaviors=[
            CriterionResult(index=index, satisfied=True, evidence="covered")
            for index in range(len(case.required_behaviors))
        ],
        forbidden_claims=[
            CriterionResult(index=index, satisfied=False, evidence="absent")
            for index in range(len(case.forbidden_claims))
        ],
        feedback="The text happens to contain the target instruction.",
    )
    mocker.patch(
        "app.services.benchmark.runner.judge_answer",
        new=mocker.AsyncMock(return_value=judge),
    )
    mocker.patch(
        "app.services.benchmark.runner.judge_chunks",
        new=mocker.AsyncMock(return_value=ChunkJudgeResult(chunks=[], feedback="")),
    )

    result = await benchmark_runner._judge_agent_answer(
        case,
        "Deactivate Click-2-Creep.",
        [],
        [case.source.filename],
        cast(
            Settings,
            SimpleNamespace(
                benchmark_judge_model="judge-model",
                benchmark_chunk_judge_model="chunk-judge-model",
                benchmark_judge_reasoning_effort="low",
            ),
        ),
        cancellation_event=None,
        agent_simulation_steps=[{"canonical_fact_key": "display_message"}],
        final_diagnostic_answer={
            "status": "completed_with_unresolved_alternatives",
            "matched_rule_indexes": [1, 2],
            "actions": ["Deactivate Click-2-Creep."],
        },
    )

    assert result["unique_resolution_passed"] is False
    assert result["agent_goal_passed"] is False
    assert result["passed"] is False


def test_parse_sse_should_preserve_multiline_data():
    events = benchmark_runner._parse_sse(
        "event: route\ndata: start_diagnostic\n\n"
        "event: chunk\ndata: first\ndata: second\n\n"
    )

    assert events == [
        ("route", "start_diagnostic"),
        ("chunk", "first\nsecond"),
    ]


async def test_conversation_should_follow_at_most_three_promised_continuations():
    sent: list[str] = []

    async def send(content: str):
        sent.append(content)
        return {
            "route": "standard_query",
            "message": {
                "id": len(sent),
                "content": f"answer {len(sent)}",
                "has_continuation": True,
            },
            "debug": [],
        }

    turns = await benchmark_runner._collect_benchmark_conversation(
        "mam blad 2504", send
    )

    assert sent == ["mam blad 2504", "kontynuuj", "kontynuuj", "kontynuuj"]
    assert len(turns) == 4


async def test_conversation_should_stop_after_complete_first_answer():
    sent: list[str] = []

    async def send(content: str):
        sent.append(content)
        return {
            "route": "standard_query",
            "message": {
                "id": 1,
                "content": "complete answer",
                "has_continuation": False,
            },
            "debug": [],
        }

    turns = await benchmark_runner._collect_benchmark_conversation(
        "mam blad 2504", send
    )

    assert sent == ["mam blad 2504"]
    assert len(turns) == 1


def test_merge_chunks_should_deduplicate_sources_from_both_messages():
    merged = benchmark_runner._merge_chunks(
        [{"id": 1}, {"id": 2}],
        [{"id": 2}, {"id": 3}],
    )

    assert [chunk["id"] for chunk in merged] == [1, 2, 3]


def test_assistant_response_time_should_use_only_generation_duration():
    turn = {
        "debug": [
            {"step": "route", "duration_ms": 120},
            {"step": "retrieval", "duration_ms": 340},
            {"step": "generation", "duration_ms": 1567},
            {"step": "complete", "duration_ms": 1700},
        ]
    }

    assert benchmark_runner._assistant_response_time_ms(turn) == 1567


def test_conversation_stage_timings_should_sum_all_standard_turns():
    conversation = [
        {
            "debug": [
                {"step": "route", "duration_ms": 120},
                {
                    "step": "retrieval",
                    "duration_ms": 340.4,
                    "data": {"translation_duration_ms": 150},
                },
                {
                    "step": "generation",
                    "duration_ms": 1567,
                    "time_to_first_chunk_ms": 500,
                },
                {"step": "complete", "duration_ms": 1700},
            ]
        },
        {
            "debug": [
                {"step": "route", "duration_ms": 80},
                {
                    "step": "retrieval",
                    "duration_ms": 100,
                    "data": {"translation_duration_ms": 40.4},
                },
                {"step": "plan", "duration_ms": 30},
                {
                    "step": "generation",
                    "duration_ms": 900,
                    "time_to_first_chunk_ms": 300,
                },
            ]
        },
    ]

    assert benchmark_runner._conversation_stage_timings_ms(conversation) == {
        "route": 200,
        "retrieval": 440,
        "translation": 190,
        "generation": 800,
        "streaming": 1667,
    }


def test_response_timeline_should_join_continuations_on_one_axis():
    conversation = [
        {
            "duration_ms": 120,
            "debug": [
                {"step": "route", "label": "Router", "start_ms": 0, "end_ms": 10},
                {
                    "step": "generation",
                    "label": "Generation",
                    "start_ms": 50,
                    "end_ms": 100,
                    "first_chunk_ms": 72,
                },
            ],
        },
        {
            "duration_ms": 80,
            "debug": [
                {"step": "route", "label": "Router", "start_ms": 0, "end_ms": 5},
                {
                    "step": "generation",
                    "label": "Generation",
                    "start_ms": 30,
                    "end_ms": 70,
                },
            ],
        },
    ]

    timeline = benchmark_runner._response_timeline(conversation)

    assert timeline["duration_ms"] == 200
    assert timeline["items"][2] == {
        "key": "generation",
        "label": "Generowanie odpowiedzi",
        "turn": 1,
        "start_ms": 50,
        "end_ms": 72,
        "duration_ms": 22,
    }
    assert timeline["items"][3] == {
        "key": "streaming",
        "label": "Streamowanie odpowiedzi",
        "turn": 1,
        "start_ms": 72,
        "end_ms": 100,
        "duration_ms": 28,
    }
    assert timeline["items"][4] == {
        "key": "response_overhead",
        "label": "Pozostała obsługa odpowiedzi",
        "turn": 1,
        "start_ms": 100,
        "end_ms": 120,
        "duration_ms": 20,
    }
    assert timeline["items"][5]["start_ms"] == 120
    assert timeline["items"][-1]["end_ms"] == 200


def test_agent_simulation_fact_should_resolve_by_alias_not_question_text():
    case = next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_colloquial_controls"
    )

    canonical_key, fact = benchmark_runner._resolve_simulation_fact(
        case, "displayed_message"
    )

    assert canonical_key == "display_message"
    assert fact.value == "SLO"
    assert fact.technician_reply == "Na wyświetlaczu widzę komunikat SLO."

    canonical_key, fact = benchmark_runner._resolve_simulation_fact(
        case, "travel_control_lever_opposite_direction"
    )
    assert canonical_key == "travel_control_lever_opposite_direction"
    assert fact.value is False

    canonical_key, fact = benchmark_runner._resolve_simulation_fact(
        case, "low_speed_button_option_fitted"
    )
    assert canonical_key == "low_speed_button_option_fitted"
    assert fact.value is False

    canonical_key, fact = benchmark_runner._resolve_simulation_fact(
        case, "low_speed_button_pressed_once"
    )
    assert canonical_key == "low_speed_button_pressed_once"
    assert fact.value is False

    canonical_key, fact = benchmark_runner._resolve_simulation_fact(
        case, "travel_control_lever_released"
    )
    assert canonical_key == "travel_control_lever_released"
    assert fact.value is True

    canonical_key, fact = benchmark_runner._resolve_simulation_fact(
        case, "travel_control_neutral"
    )
    assert canonical_key == "travel_control_lever_released"
    assert fact.value is True

    for shock_key in ("shock_sensor_stop", "shock_sensor_stopped_truck"):
        canonical_key, fact = benchmark_runner._resolve_simulation_fact(case, shock_key)
        assert canonical_key == "shock_sensor_stopped_truck"
        assert fact.value is False


def test_agent_simulation_fact_should_default_unknown_key_to_false():
    case = next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_colloquial_controls"
    )

    canonical_key, fact = benchmark_runner._resolve_simulation_fact(
        case, "temporary_speed_reduction_button_pressed"
    )

    assert canonical_key == "temporary_speed_reduction_button_pressed"
    assert fact.value is False
    assert fact.unit is None
    assert fact.technician_reply == "Tego nie zaobserwowano."


def test_one_simulated_fact_should_resolve_all_gaps_for_the_same_key():
    case = next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_colloquial_controls"
    )
    rules = [
        DiagnosticRule(
            conditions=[
                DiagnosticCondition(
                    text="Control arm position is known",
                    fact_key="control_arm_position",
                    operator="present",
                )
            ],
            actions=["Record the known control arm position"],
            source_chunk_ids=[11],
        ),
        DiagnosticRule(
            conditions=[
                DiagnosticCondition(
                    text="Control arm is raised",
                    fact_key="control_arm_position",
                    operator="eq",
                    expected_value="raised_braked",
                )
            ],
            actions=["Deactivate creep speed"],
            source_chunk_ids=[12],
        ),
    ]
    state = benchmark_runner.gap_finder.enrich_with_gaps(
        DiagnosticState(
            status="needs_information",
            case_context=CaseContext(
                machine=MachineContext(device_id=7, name="LPE200"),
                symptom=Symptom(search_phrase="creep speed"),
            ),
            accepted_rule_indexes=[0, 1],
            rules=rules,
        )
    )
    assert len(state.gaps) == 2

    resolved = benchmark_runner._apply_simulation_fact(
        state,
        "control_arm_position",
        case.simulation_facts["control_arm_position"],
    )

    assert resolved.gaps == []
    assert [rule.status for rule in resolved.rule_states] == ["matched", "matched"]


async def test_agent_simulation_should_not_inject_required_evidence_gap(mocker):
    case = next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_colloquial_controls"
    )
    state = DiagnosticState(
        status="needs_information",
        case_context=CaseContext(
            machine=MachineContext(device_id=7, name="LPE200"),
            symptom=Symptom(search_phrase="creep speed"),
        ),
        gaps=[
            DiagnosticGap(
                fact_key="travel_control_double_tapped",
                kind="missing",
                expected_value=True,
                operator="eq",
                condition_text="The travel control was double tapped.",
            ),
            DiagnosticGap(
                fact_key="display_message",
                kind="missing",
                expected_value="SLO",
                operator="eq",
                condition_text="Check the display.",
            ),
        ],
    )
    evaluate = mocker.patch(
        "app.services.benchmark.runner.agent_next_best_step.evaluate_next_step",
        new=mocker.AsyncMock(
            return_value=AgentNextStepDecision(
                status="no_valid_step", reason="Test snapshot only."
            )
        ),
    )

    await benchmark_runner._simulate_agent_next_steps(
        case, state, cast(Settings, SimpleNamespace()), cancellation_event=None
    )

    evaluated_state = evaluate.await_args.args[0]
    assert [gap.fact_key for gap in evaluated_state.gaps] == [
        "travel_control_double_tapped",
        "display_message",
    ]


async def test_agent_simulation_should_answer_and_add_selected_alias_fact(mocker):
    case = next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_colloquial_controls"
    )
    case_context = CaseContext(
        machine=MachineContext(device_id=7, name="LPE200"),
        symptom=Symptom(search_phrase="creep speed"),
    )
    state = DiagnosticState(
        status="needs_information",
        case_context=case_context,
        gaps=[
            DiagnosticGap(
                fact_key="displayed_message",
                kind="missing",
                expected_value="SLO",
                operator="eq",
                condition_text="The display shows SLO.",
            )
        ],
    )
    selected = AgentNextStepDecision.model_validate(
        {
            "status": "selected",
            "selected": {
                "gap_index": 0,
                "fact_key": "displayed_message",
                "gap_kind": "missing",
                "method": "ask",
                "condition_text": "The display shows SLO.",
                "operator": "eq",
                "expected_value": "SLO",
                "technician_prompt": "Jaki komunikat widać na wyświetlaczu?",
                "score": 5.0,
            },
            "reason": "Selected the highest-value gap.",
        }
    )
    evaluate = mocker.patch(
        "app.services.benchmark.runner.agent_next_best_step.evaluate_next_step",
        new=mocker.AsyncMock(return_value=selected),
    )

    (
        final_state,
        final_decision,
        steps,
    ) = await benchmark_runner._simulate_agent_next_steps(
        case,
        state,
        cast(Settings, SimpleNamespace()),
        cancellation_event=None,
    )

    assert evaluate.await_count == 1
    assert final_decision.status == "no_gaps"
    assert steps == [
        {
            "turn": 1,
            "technician_prompt": "Jaki komunikat widać na wyświetlaczu?",
            "technician_reply": "Na wyświetlaczu widzę komunikat SLO.",
            "selected_fact_key": "displayed_message",
            "canonical_fact_key": "display_message",
            "fact_value": "SLO",
            "unit": None,
            "decision": selected.model_dump(mode="json"),
        }
    ]
    assert any(
        fact.key == "displayed_message"
        and fact.value == "SLO"
        and fact.certainty == "certain"
        for fact in final_state.facts
    )
    assert any(
        fact.key == "display_message"
        and fact.value == "SLO"
        and fact.certainty == "certain"
        for fact in final_state.facts
    )


async def test_agent_simulation_should_reuse_initial_llm_gap_assessments(mocker):
    case = next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_colloquial_controls"
    ).model_copy(update={"agent_goal": None})
    state = benchmark_runner.gap_finder.enrich_with_gaps(
        DiagnosticState(
            status="needs_information",
            case_context=CaseContext(
                machine=MachineContext(device_id=7, name="LPE200"),
                symptom=Symptom(search_phrase="creep speed"),
            ),
            accepted_rule_indexes=[0, 1],
            rules=[
                DiagnosticRule(
                    conditions=[
                        DiagnosticCondition(
                            text="A display message identifies the active mode.",
                            fact_key="display_message",
                            operator="eq",
                            expected_value="SLO",
                        )
                    ],
                    actions=["Deactivate the active mode."],
                    source_chunk_ids=[11],
                ),
                DiagnosticRule(
                    conditions=[
                        DiagnosticCondition(
                            text="The shock sensor stopped the truck.",
                            fact_key="shock_sensor_stopped_truck",
                            operator="eq",
                            expected_value=True,
                        )
                    ],
                    actions=["Reset the shock sensor stop."],
                    source_chunk_ids=[12],
                ),
            ],
        )
    )
    evaluation = GapEvaluation(
        assessments=[
            GapAssessment(
                gap_index=0,
                feasible=True,
                method="observe",
                diagnostic_value=9,
                effort_cost=1,
                safety_risk=1,
                technician_prompt="Odczytaj komunikat widoczny na wyświetlaczu.",
            ),
            GapAssessment(
                gap_index=1,
                feasible=True,
                method="ask",
                diagnostic_value=6,
                effort_cost=1,
                safety_risk=1,
                technician_prompt="Czy czujnik wstrząsowy zatrzymał wózek?",
            ),
        ]
    )
    initial_decision = select_from_evaluation(state, evaluation)
    evaluate = mocker.patch(
        "app.services.benchmark.runner.agent_next_best_step.evaluate_next_step",
        new=mocker.AsyncMock(return_value=initial_decision),
    )

    (
        final_state,
        final_decision,
        steps,
    ) = await benchmark_runner._simulate_agent_next_steps(
        case,
        state,
        cast(Settings, SimpleNamespace()),
        cancellation_event=None,
    )

    assert evaluate.await_count == 1
    assert [step["canonical_fact_key"] for step in steps] == [
        "display_message",
        "shock_sensor_stopped_truck",
    ]
    assert final_decision.status == "no_gaps"
    assert final_state.gaps == []


def test_final_diagnostic_answer_should_only_use_fully_matched_rules():
    state = DiagnosticState(
        status="ready",
        case_context=CaseContext(
            machine=MachineContext(device_id=7, name="LPE200"),
            symptom=Symptom(search_phrase="creep speed"),
        ),
        accepted_rule_indexes=[2, 5],
        rules=[
            DiagnosticRule(
                actions=["Ponownie dwukrotnie użyj dźwigni jazdy."],
                constraints=["Nie obchodź urządzeń bezpieczeństwa."],
                source_chunk_ids=[11],
            ),
            DiagnosticRule(
                actions=["Niepasująca akcja."],
                source_chunk_ids=[12],
            ),
        ],
        rule_states=[
            DiagnosticRuleState(
                extraction_rule_index=2,
                status="matched",
            ),
            DiagnosticRuleState(
                extraction_rule_index=5,
                status="conflicting",
            ),
        ],
    )

    answer = benchmark_runner._build_final_diagnostic_answer(state)

    assert answer["status"] == "completed"
    assert answer["matched_rule_indexes"] == [2]
    assert answer["actions"] == ["Ponownie dwukrotnie użyj dźwigni jazdy."]
    assert answer["constraints"] == ["Nie obchodź urządzeń bezpieczeństwa."]
    assert "Niepasująca" not in answer["text"]

    answer_with_unresolved_alternative = (
        benchmark_runner._build_final_diagnostic_answer(
            state.model_copy(
                update={
                    "status": "needs_information",
                    "gaps": [
                        DiagnosticGap(
                            fact_key="unrelated_candidate_fact",
                            kind="missing",
                            operator="present",
                            condition_text="An unrelated candidate needs another fact.",
                            rule_indexes=[5],
                        )
                    ],
                }
            )
        )
    )

    assert (
        answer_with_unresolved_alternative["status"]
        == "completed_with_unresolved_alternatives"
    )
    assert answer_with_unresolved_alternative["actions"] == [
        "Ponownie dwukrotnie użyj dźwigni jazdy."
    ]


def test_final_diagnostic_answer_should_limit_primary_repair_actions():
    state = DiagnosticState(
        status="ready",
        case_context=CaseContext(
            machine=MachineContext(device_id=7, name="LPE200"),
            symptom=Symptom(search_phrase="creep speed"),
        ),
        accepted_rule_indexes=[0],
        rules=[
            DiagnosticRule(
                actions=["Primary repair.", "Alternative repair."],
                source_chunk_ids=[11],
            )
        ],
        rule_states=[DiagnosticRuleState(extraction_rule_index=0, status="matched")],
    )

    answer = benchmark_runner._build_final_diagnostic_answer(
        state, max_primary_actions=1
    )

    assert answer["actions"] == ["Primary repair."]
    assert "Alternative repair" not in answer["text"]


def test_final_diagnostic_answer_should_refuse_competing_repair_rules():
    state = DiagnosticState(
        status="ready",
        case_context=CaseContext(
            machine=MachineContext(device_id=7, name="LPE200"),
            symptom=Symptom(search_phrase="creep speed"),
        ),
        accepted_rule_indexes=[1, 2],
        rules=[
            DiagnosticRule(
                actions=["Deactivate Click-2-Creep."],
                source_chunk_ids=[11],
            ),
            DiagnosticRule(
                actions=["Disable temporary speed reduction."],
                source_chunk_ids=[12],
            ),
        ],
        rule_states=[
            DiagnosticRuleState(extraction_rule_index=1, status="matched"),
            DiagnosticRuleState(extraction_rule_index=2, status="matched"),
        ],
    )

    answer = benchmark_runner._build_final_diagnostic_answer(
        state, max_primary_actions=1, require_unique_action_rule=True
    )

    assert answer["status"] == "not_ready"
    assert answer["actions"] == []
    assert answer["text"] is None
    assert answer["matched_rule_indexes"] == [1, 2]


def test_unique_action_resolution_should_wait_for_viable_alternative():
    state = DiagnosticState(
        status="needs_information",
        case_context=CaseContext(
            machine=MachineContext(device_id=7, name="LPE200"),
            symptom=Symptom(search_phrase="creep speed"),
        ),
        accepted_rule_indexes=[1, 2],
        rules=[
            DiagnosticRule(
                actions=["Deactivate Click-2-Creep."],
                source_chunk_ids=[11],
            ),
            DiagnosticRule(
                actions=["Disable temporary speed reduction."],
                source_chunk_ids=[12],
            ),
        ],
        rule_states=[
            DiagnosticRuleState(extraction_rule_index=1, status="matched"),
            DiagnosticRuleState(extraction_rule_index=2, status="partially_matched"),
        ],
    )

    assert benchmark_runner._has_unique_action_resolution(state, 1) is False

    state.rule_states[1].status = "conflicting"
    assert benchmark_runner._has_unique_action_resolution(state, 1) is True


async def test_agent_benchmark_should_stop_after_evidence_gate_without_answer(mocker):
    case = next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_colloquial_controls"
    )
    machine = MachineContext(
        device_id=7,
        name="LPE200",
        model_serial_code="LPE200-TEST",
        nameplate_data=None,
    )
    case_context = CaseContext(
        machine=machine,
        symptom=Symptom(
            search_phrase="creep speed with raised tiller arm",
        ),
        observations=[
            Observation(
                key="control_input",
                value="travel control tapped twice",
                certainty="certain",
            )
        ],
    )
    query_plan = RetrievalQueryPlan(
        base_queries=["creep speed raised tiller"],
        contextual_queries=["travel control tapped twice creep speed"],
    )
    queries = [
        case_context.symptom.search_phrase,
        *query_plan.base_queries,
        *query_plan.contextual_queries,
    ]
    mocker.patch(
        "app.services.benchmark.runner.agent_engine.prepare_case",
        new=mocker.AsyncMock(return_value=(case_context, query_plan, queries)),
    )

    async def retrieve(*args, retrieval_trace, **kwargs):
        del args, kwargs
        chunk = {
            "id": 11,
            "attachment_id": 3,
            "content": "Click-2-Creep and SLO",
            "extra_metadata": {"page": 48},
        }
        retrieval_trace.update(
            {
                "reranker_enabled": True,
                "reranker_status": "applied",
                "fusion_method": "reciprocal_rank_fusion",
                "global_reranker_query": "\n".join(queries),
                "before_reranker": [chunk],
                "after_reranker": [chunk],
                "initial_evidence_gate": {
                    "decision": "accept",
                    "score": 0.88,
                    "reason": "Strong evidence.",
                    "passed": True,
                    "thresholds": {"accept": 0.7},
                    "weights": {"top_score": 0.6},
                    "signals": {"top_score": 0.9},
                },
                "after_evidence_gate": [chunk],
                "initial_evidence_gate_duration_ms": 2,
                "queries": [
                    {
                        "query": query,
                        "chunks": [chunk],
                        "duration_ms": 50,
                    }
                    for query in queries
                ],
                "duration_ms": 450,
                "timeline": [
                    {
                        "key": "reranker",
                        "label": "Globalny reranker",
                        "start_ms": 300,
                        "end_ms": 450,
                        "duration_ms": 150,
                    }
                ],
            }
        )
        return [chunk]

    mocker.patch(
        "app.services.benchmark.runner.agent_retrieval.retrieve_for_agent_queries",
        side_effect=retrieve,
    )
    extract = mocker.patch(
        "app.services.benchmark.runner.diagnostic_extractor.extract_diagnostic_evidence",
        new=mocker.AsyncMock(
            return_value=DiagnosticExtraction(
                rules=[
                    DiagnosticRule(
                        conditions=[
                            DiagnosticCondition(
                                text="SLO is displayed.",
                                fact_key="display_message",
                                operator="eq",
                                expected_value="SLO",
                            )
                        ],
                        actions=["use Click-2-Creep"],
                        source_chunk_ids=[11],
                    )
                ]
            )
        ),
    )
    mocker.patch(
        "app.services.benchmark.runner._attachment_names",
        new=mocker.AsyncMock(return_value={3: "manual.pdf"}),
    )
    display_step = AgentNextStepDecision.model_validate(
        {
            "status": "selected",
            "selected": {
                "gap_index": 0,
                "fact_key": "display_message",
                "gap_kind": "missing",
                "method": "ask",
                "condition_text": "Observe the required diagnostic evidence.",
                "operator": "eq",
                "expected_value": "SLO",
                "technician_prompt": "Jaki komunikat widać na wyświetlaczu?",
                "score": 5.0,
            },
            "reason": "Selected required evidence.",
        }
    )
    mocker.patch(
        "app.services.benchmark.runner.agent_next_best_step.evaluate_next_step",
        new=mocker.AsyncMock(return_value=display_step),
    )
    mocker.patch(
        "app.services.benchmark.runner.time.perf_counter",
        side_effect=[
            10.0,
            10.125,
            10.625,
            10.825,
            10.826,
            10.827,
            10.828,
            10.829,
        ],
    )

    result = await benchmark_runner._run_agent_retrieval_benchmark(
        case=case,
        device=Device(
            id=7,
            name="LPE200",
            model_serial_code="LPE200-TEST",
            image_url=None,
            category_id=1,
        ),
        settings=cast(
            Settings,
            SimpleNamespace(
                agent_diagnostic_extractor_model="gpt-5.6-luna",
                agent_next_step_model="gpt-5.6-luna",
            ),
        ),
        session=mocker.AsyncMock(),
        cancellation_event=None,
        evaluate=False,
    )

    assert result["mode"] == "agent"
    assert result["pipeline_stage"] == "final_answer_composed"
    assert result["simulation_facts"]["display_message"]["value"] == "SLO"
    assert result["case_context"]["symptom"]["search_phrase"] == (
        "creep speed with raised tiller arm"
    )
    assert result["query_plan"]["base_queries"] == ["creep speed raised tiller"]
    assert len(result["query_runs"]) == 3
    assert result["query_runs"][0]["duration_ms"] == 50
    assert result["fusion_method"] == "reciprocal_rank_fusion"
    assert result["chunks_after_reranker"][0]["source_name"] == "manual.pdf"
    assert result["chunks_after_evidence_gate"][0]["source_name"] == "manual.pdf"
    assert result["initial_evidence_gate"]["decision"] == "accept"
    assert result["diagnostic_extractor_model"] == "gpt-5.6-luna"
    assert result["agent_next_step_model"] == "gpt-5.6-luna"
    fact_key_vocabulary = result["fact_key_vocabulary"]
    assert "reported_symptom" in fact_key_vocabulary
    assert "control_input" in fact_key_vocabulary
    assert "display_message" in fact_key_vocabulary
    assert "displayed_message" not in fact_key_vocabulary
    assert "display_slo" not in fact_key_vocabulary
    assert extract.await_args.kwargs["fact_key_vocabulary"] == fact_key_vocabulary
    assert extract.await_args.kwargs["required_condition_fact_keys"] == [
        "display_message"
    ]
    assert result["evidence_gate"]["decision"] == "accept"
    assert result["diagnostic_state"]["status"] == "ready"
    assert result["diagnostic_state"]["accepted_rule_indexes"] == [0]
    assert result["diagnostic_state"]["rules"][0]["actions"] == ["use Click-2-Creep"]
    assert result["diagnostic_state"]["rule_states"] == [
        {
            "extraction_rule_index": 0,
            "status": "matched",
            "confirmed_conditions": ["SLO is displayed."],
            "gaps": [],
        }
    ]
    assert result["diagnostic_state"]["gaps"] == []
    assert result["agent_next_step"]["status"] == "no_gaps"
    assert [decision["status"] for decision in result["agent_next_step_decisions"]] == [
        "selected",
        "no_gaps",
    ]
    assert len(result["agent_simulation_steps"]) == 1
    assert "decision" not in result["agent_simulation_steps"][0]
    assert result["agent_simulation_steps"][0]["canonical_fact_key"] == (
        "display_message"
    )
    assert result["evaluation_skipped"] is True
    assert result["final_diagnostic_answer"]["status"] == "completed"
    assert result["final_diagnostic_answer"]["matched_rule_indexes"] == [0]
    assert result["final_diagnostic_answer"]["actions"] == ["use Click-2-Creep"]
    assert result["answer"] == "Zalecane działania:\n1. use Click-2-Creep"
    assert result["technician_response"] is None
    assert result["stage_timings_ms"] == {
        "message": 0,
        "case_context_and_query_rewrite": 125,
        "retrieval_and_reranker": 498,
        "initial_evidence_gate": 2,
        "diagnostic_extractor": 200,
        "evidence_gate": 1,
        "diagnostic_state": 1,
        "gap_finder": 1,
        "next_best_step": 1,
        "evaluation": 0,
    }
    assert result["total_time_ms"] == 829
    assert result["retrieval_timelines"] == [
        {
            "label": "Agent retrieval",
            "layout": "chronological",
            "duration_ms": 500,
            "items": [
                {
                    "key": "reranker",
                    "label": "Globalny reranker",
                    "start_ms": 300,
                    "end_ms": 450,
                    "duration_ms": 150,
                }
            ],
        }
    ]
    assert "judge" not in result


async def test_cancellation_should_interrupt_active_async_operation():
    cancellation_event = asyncio.Event()
    operation_started = asyncio.Event()
    operation_cancelled = asyncio.Event()

    async def long_operation():
        operation_started.set()
        try:
            await asyncio.sleep(60)
        finally:
            operation_cancelled.set()

    task = asyncio.create_task(
        await_with_cancellation(long_operation(), cancellation_event)
    )
    await operation_started.wait()
    cancellation_event.set()

    with pytest.raises(
        BenchmarkCancelledError,
        match="cancelled",
    ):
        await task
    assert operation_cancelled.is_set()


async def test_judge_should_use_reasoning_model_and_validate_all_criteria(mocker):
    case = next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_colloquial_controls"
    )
    result_payload = {
        "required_facts": [
            {"index": index, "satisfied": True, "evidence": "present"}
            for index in range(len(case.required_facts))
        ],
        "required_behaviors": [
            {"index": index, "satisfied": True, "evidence": "behavior present"}
            for index in range(len(case.required_behaviors))
        ],
        "forbidden_claims": [
            {"index": index, "satisfied": False, "evidence": "absent"}
            for index in range(len(case.forbidden_claims))
        ],
        "feedback": "Correct.",
    }
    create = mocker.AsyncMock(
        return_value=SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=json.dumps(result_payload, ensure_ascii=False)
                    )
                )
            ]
        )
    )
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    mocker.patch("app.services.benchmark.judge.AsyncOpenAI", return_value=client)
    settings = SimpleNamespace(
        openai_api_key="test",
        benchmark_judge_model="gpt-5.1",
        benchmark_chunk_judge_model="gpt-5.6-luna",
        benchmark_judge_reasoning_effort="medium",
    )

    result = await judge_answer(case, "answer", cast(Settings, settings))

    assert all(item.satisfied for item in result.required_facts)
    assert all(item.satisfied for item in result.required_behaviors)
    assert not any(item.satisfied for item in result.forbidden_claims)
    request = create.await_args.kwargs
    assert request["model"] == "gpt-5.1"
    assert request["reasoning_effort"] == "medium"
    assert request["response_format"]["type"] == "json_schema"
    assert "nie musi powtarzać surowego zapisu" in request["messages"][0]["content"]
    assert '"reference_answer": null' in request["messages"][1]["content"]
    assert '"case_assumptions": []' in request["messages"][1]["content"]
    assert "click_2_creep_still_active" not in request["messages"][1]["content"]


async def test_chunk_judge_should_score_each_chunk_and_fact_coverage(mocker):
    case = load_benchmark_dataset().cases[0]
    result_payload = {
        "chunks": [
            {
                "index": 0,
                "relevance_score": 3,
                "supported_fact_indexes": [0, 1],
                "evidence": "Directly describes the fault.",
            },
            {
                "index": 1,
                "relevance_score": 1,
                "supported_fact_indexes": [],
                "evidence": "Only weakly related.",
            },
        ],
        "feedback": "One useful chunk.",
    }
    create = mocker.AsyncMock(
        return_value=SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=json.dumps(result_payload))
                )
            ]
        )
    )
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    mocker.patch("app.services.benchmark.judge.AsyncOpenAI", return_value=client)
    settings = SimpleNamespace(
        openai_api_key="test",
        benchmark_judge_model="gpt-5.1",
        benchmark_chunk_judge_model="gpt-5.6-luna",
        benchmark_judge_reasoning_effort="medium",
    )

    result = await judge_chunks(
        case,
        [
            {"content": "fault details", "source_name": "manual.pdf"},
            {"content": "generic text", "source_name": "manual.pdf"},
        ],
        cast(Settings, settings),
    )

    assert [item.relevance_score for item in result.chunks] == [3, 1]
    assert result.chunks[0].supported_fact_indexes == [0, 1]
    request = create.await_args.kwargs
    assert request["model"] == "gpt-5.6-luna"
    assert request["reasoning_effort"] == "medium"
    assert request["response_format"]["json_schema"]["strict"] is True
    assert (
        "does not need to state their equivalence" in request["messages"][0]["content"]
    )
