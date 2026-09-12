from types import SimpleNamespace
from typing import cast

import pytest
from app.config import Settings
from app.services.chat.agent.diagnostic_extractor import DiagnosticRule
from app.services.chat.agent.diagnostic_state import DiagnosticGap, DiagnosticState
from app.services.chat.agent.models import CaseContext, MachineContext, Symptom
from app.services.chat.agent.next_best_step import (
    SYSTEM_PROMPT,
    GapAssessment,
    GapEvaluation,
    GapEvaluationError,
    calculate_gap_score,
    evaluate_next_step,
    select_from_evaluation,
    technician_response,
)


def test_prompt_should_allow_direct_observation_of_visible_state():
    assert "plainly visible or readable state" in SYSTEM_PROMPT
    assert "does not require an explicit rule test" in SYSTEM_PROMPT
    assert "without naming that" in SYSTEM_PROMPT
    assert "expected value" in SYSTEM_PROMPT
    assert "diagnostic_value" in SYSTEM_PROMPT
    assert "information_gain" not in SYSTEM_PROMPT


def _state() -> DiagnosticState:
    return DiagnosticState(
        status="needs_information",
        case_context=CaseContext(
            machine=MachineContext(device_id=7, name="LPE200"),
            symptom=Symptom(
                search_phrase="forks not lifting",
                fact_key="lifting_state",
                fact_value="not_lifting",
            ),
        ),
        accepted_rule_indexes=[4, 7],
        rules=[
            DiagnosticRule(
                tests=["Listen for pump operation during a lifting attempt."],
                constraints=["Zachowaj odstęp od mechanizmu podnoszenia."],
                source_chunk_ids=[11],
            ),
            DiagnosticRule(
                source_chunk_ids=[12],
            ),
        ],
        gaps=[
            DiagnosticGap(
                fact_key="pump_operating",
                kind="missing",
                expected_value=True,
                operator="eq",
                condition_text="Pump operates during lifting",
                rule_indexes=[4],
            ),
            DiagnosticGap(
                fact_key="display_fault_code",
                kind="missing",
                expected_value=None,
                operator="present",
                condition_text="A fault code is displayed",
                rule_indexes=[4, 7],
            ),
        ],
        source_chunk_ids=[11, 12],
    )


def _assessment(gap_index: int, **updates) -> GapAssessment:
    values = {
        "gap_index": gap_index,
        "feasible": True,
        "method": "ask",
        "diagnostic_value": 7,
        "effort_cost": 1,
        "safety_risk": 1,
        "rule_index": None,
        "test_index": None,
        "technician_prompt": (
            "Czy podczas próby podnoszenia wideł słychać pracę pompy?"
            if gap_index == 0
            else "Jaki kod jest widoczny na wyświetlaczu?"
        ),
    }
    values.update(updates)
    return GapAssessment(**values)


def test_should_validate_rank_and_copy_documented_test_from_state():
    pump = _assessment(
        0,
        method="documented_test",
        diagnostic_value=10,
        rule_index=4,
        test_index=0,
        technician_prompt="Posłuchaj, czy podczas próby podnoszenia pracuje pompa.",
    )
    fault_code = _assessment(1)

    decision = select_from_evaluation(
        _state(), GapEvaluation(assessments=[fault_code, pump])
    )

    assert decision.status == "selected"
    assert decision.selected is not None
    assert decision.selected.fact_key == "pump_operating"
    assert decision.selected.instruction == (
        "Listen for pump operation during a lifting attempt."
    )
    assert decision.selected.constraints == [
        "Zachowaj odstęp od mechanizmu podnoszenia."
    ]
    assert decision.selected.source_chunk_ids == [11]
    assert decision.selected.score == calculate_gap_score(pump)
    assert [item.gap_index for item in decision.assessments] == [0, 1]
    assert technician_response(decision) == (
        "::warning\nZachowaj odstęp od mechanizmu podnoszenia.\n\n"
        "::checklist\n- Posłuchaj, czy podczas próby podnoszenia pracuje pompa."
    )


def test_should_reject_test_reference_from_unrelated_rule():
    invalid = _assessment(
        0,
        method="documented_test",
        rule_index=7,
        test_index=0,
        technician_prompt="Odczytaj kod błędu z wyświetlacza.",
    )

    with pytest.raises(GapEvaluationError, match="unrelated rule"):
        select_from_evaluation(
            _state(), GapEvaluation(assessments=[invalid, _assessment(1)])
        )


def test_should_add_standard_answers_to_response_for_selected_boolean_gap():
    decision = select_from_evaluation(
        _state(), GapEvaluation(assessments=[_assessment(0), _assessment(1)])
    )

    assert decision.selected is not None
    assert technician_response(decision) == (
        "Czy podczas próby podnoszenia wideł słychać pracę pompy?\n\n"
        "Możliwe odpowiedzi: Tak / Nie / Nie wiem"
    )


async def test_should_skip_llm_when_state_has_no_gaps(mocker):
    openai = mocker.patch("app.services.chat.agent.next_best_step.AsyncOpenAI")
    state = _state().model_copy(update={"status": "ready", "gaps": []})

    decision = await evaluate_next_step(state, cast(Settings, SimpleNamespace()))

    assert decision.status == "no_gaps"
    openai.assert_not_called()


async def test_should_not_treat_insufficient_evidence_as_ready(mocker):
    openai = mocker.patch("app.services.chat.agent.next_best_step.AsyncOpenAI")
    state = _state().model_copy(
        update={
            "status": "insufficient_evidence",
            "rules": [],
            "accepted_rule_indexes": [],
            "gaps": [],
            "evidence_gap": "No relevant manual rule.",
        }
    )

    decision = await evaluate_next_step(state, cast(Settings, SimpleNamespace()))

    assert decision.status == "no_valid_step"
    assert decision.reason == "No relevant manual rule."
    openai.assert_not_called()


async def test_should_evaluate_compact_state_with_configured_model(mocker):
    parsed = GapEvaluation(assessments=[_assessment(0), _assessment(1)])
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed, refusal=None))]
    )
    client = mocker.MagicMock()
    client.chat.completions.parse = mocker.AsyncMock(return_value=response)
    mocker.patch(
        "app.services.chat.agent.next_best_step.AsyncOpenAI", return_value=client
    )
    settings = cast(
        Settings,
        SimpleNamespace(
            openai_api_key="test-key",
            agent_next_step_model="gpt-5.6-luna",
        ),
    )

    decision = await evaluate_next_step(_state(), settings)

    assert decision.status == "selected"
    assert technician_response(decision) == (
        "Czy podczas próby podnoszenia wideł słychać pracę pompy?\n\n"
        "Możliwe odpowiedzi: Tak / Nie / Nie wiem"
    )
    call = client.chat.completions.parse.call_args.kwargs
    assert call["model"] == "gpt-5.6-luna"
    assert call["reasoning_effort"] == "none"
    assert call["response_format"] is GapEvaluation
    assert '"gap_index": 0' in call["messages"][1]["content"]
    assert '"rule_index": 4' in call["messages"][1]["content"]


async def test_should_retry_when_prompt_reveals_expected_value(mocker):
    state = _state()
    state.gaps[1].expected_value = "SLO"
    invalid = GapEvaluation(
        assessments=[
            _assessment(0),
            _assessment(
                1,
                technician_prompt="Czy na wyświetlaczu widać SLO?",
            ),
        ]
    )
    corrected = GapEvaluation(
        assessments=[
            _assessment(0),
            _assessment(
                1,
                method="observe",
                diagnostic_value=10,
                technician_prompt="Odczytaj komunikat widoczny na wyświetlaczu.",
            ),
        ]
    )
    responses = [
        SimpleNamespace(
            choices=[
                SimpleNamespace(message=SimpleNamespace(parsed=parsed, refusal=None))
            ]
        )
        for parsed in (invalid, corrected)
    ]
    client = mocker.MagicMock()
    client.chat.completions.parse = mocker.AsyncMock(side_effect=responses)
    mocker.patch(
        "app.services.chat.agent.next_best_step.AsyncOpenAI", return_value=client
    )
    settings = cast(
        Settings,
        SimpleNamespace(
            openai_api_key="test-key",
            agent_next_step_model="gpt-5.6-luna",
        ),
    )

    decision = await evaluate_next_step(state, settings)

    assert client.chat.completions.parse.await_count == 2
    assert decision.status == "selected"
    assert decision.selected is not None
    assert decision.selected.fact_key == "display_fault_code"
    assert decision.selected.technician_prompt == (
        "Odczytaj komunikat widoczny na wyświetlaczu."
    )
    retry_messages = client.chat.completions.parse.await_args.kwargs["messages"]
    assert "Backend validation rejected" in retry_messages[-1]["content"]
    assert "do not include any expected_value" in retry_messages[-1]["content"]
