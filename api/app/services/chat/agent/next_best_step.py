import json
import logging
from typing import Any, Literal, cast

from app.config import Settings
from openai import AsyncOpenAI
from pydantic import Field, model_validator

from .diagnostic_state import DiagnosticGap, DiagnosticState
from .models import AgentModel

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
Evaluate the diagnostic value of resolving each supplied gap. Do not diagnose the
fault, invent facts, introduce new gaps, or propose undocumented service work.

Return exactly one assessment for every indexed gap:
- gap_index must reference the supplied gap.
- method is ask when the technician can directly report the value, observe when a
  simple non-invasive observation establishes it, and documented_test only when an
  accepted rule contains an explicit test that establishes it.
- For every feasible method, technician_prompt must be in Polish. For ask, write
  exactly one concise, neutral question ending in a question mark. For observe,
  write one concise imperative without a question mark. For documented_test,
  faithfully translate the referenced test into one concise Polish imperative;
  do not add, remove, or alter any action. Keep prompts on one line, do not use
  formatting markers, reveal expected_value, suggest the answer, or mention a
  suspected cause. When feasible is false, technician_prompt must be null.
- For documented_test, set rule_index and test_index to the supplied indexes of that
  exact test. Preserve the documented action, but if the test names the expected
  result, rephrase it as a neutral check of the actual result without naming that
  expected value. For ask and observe, both indexes must be null. The backend
  attaches documented constraints and standard binary answers when applicable.
- feasible is false when the accepted evidence provides no safe way to establish
  the fact. Do not invent tools, measurements, procedures, or safety precautions.
- A plainly visible or readable state such as a display message, indicator, switch
  position, or control position has a grounded observe method when the gap itself
  asks for that state. Reading it directly is not an invented diagnostic procedure
  and does not require an explicit rule test.
- Estimate three metrics from 0 to 10. diagnostic_value measures how much resolving
  the gap narrows or separates viable rules. effort_cost measures the technician's
  total time and burden. safety_risk measures potential harm; treat undocumented
  safety as uncertain and do not give it an artificially low value.

Do not select the winner. The backend validates references, calculates scores, and
selects the next step.
""".strip()


class GapAssessment(AgentModel):
    gap_index: int = Field(ge=0)
    feasible: bool
    method: Literal["ask", "observe", "documented_test"]
    diagnostic_value: float = Field(ge=0, le=10)
    effort_cost: float = Field(ge=0, le=10)
    safety_risk: float = Field(ge=0, le=10)
    rule_index: int | None = None
    test_index: int | None = None
    technician_prompt: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def validate_test_reference(self) -> "GapAssessment":
        if not self.feasible:
            if (
                self.rule_index is not None
                or self.test_index is not None
                or self.technician_prompt is not None
            ):
                raise ValueError("infeasible assessments cannot provide a step")
            return self
        if self.method == "documented_test":
            if self.rule_index is None or self.test_index is None:
                raise ValueError("documented_test requires rule_index and test_index")
        elif self.rule_index is not None or self.test_index is not None:
            raise ValueError("only documented_test may reference a rule test")

        if not self.technician_prompt:
            raise ValueError("feasible assessments require technician_prompt")

        prompt = self.technician_prompt or ""
        if "\n" in prompt or "::" in prompt:
            raise ValueError("technician_prompt must be one unformatted line")
        if self.method == "ask" and (
            not prompt.endswith("?") or prompt.count("?") != 1
        ):
            raise ValueError("ask requires exactly one question")
        if self.method in {"observe", "documented_test"} and "?" in prompt:
            raise ValueError("observe and documented_test require an imperative")
        return self


class GapEvaluation(AgentModel):
    assessments: list[GapAssessment]


class RankedGapAssessment(GapAssessment):
    score: float


class SelectedAgentStep(AgentModel):
    gap_index: int
    fact_key: str
    gap_kind: Literal["missing", "uncertain", "conflicting"]
    method: Literal["ask", "observe", "documented_test"]
    condition_text: str
    operator: Literal["eq", "neq", "gt", "gte", "lt", "lte", "present"]
    expected_value: str | float | bool | None = None
    unit: str | None = None
    rule_indexes: list[int] = Field(default_factory=list)
    technician_prompt: str
    instruction: str | None = None
    constraints: list[str] = Field(default_factory=list)
    source_chunk_ids: list[int] = Field(default_factory=list)
    score: float


class AgentNextStepDecision(AgentModel):
    status: Literal["selected", "no_gaps", "no_valid_step", "evaluation_failed"]
    assessments: list[RankedGapAssessment] = Field(default_factory=list)
    selected: SelectedAgentStep | None = None
    reason: str


class GapEvaluationError(RuntimeError):
    pass


def calculate_gap_score(assessment: GapAssessment) -> float:
    return round(
        assessment.diagnostic_value
        - 0.2 * assessment.effort_cost
        - 0.4 * assessment.safety_risk,
        3,
    )


def _rule_position(state: DiagnosticState, extraction_rule_index: int) -> int | None:
    try:
        return state.accepted_rule_indexes.index(extraction_rule_index)
    except ValueError:
        return None


def _validated_assessments(
    state: DiagnosticState, evaluation: GapEvaluation
) -> list[RankedGapAssessment]:
    if len(evaluation.assessments) != len(state.gaps):
        raise GapEvaluationError("The evaluator did not assess every diagnostic gap")

    by_gap_index: dict[int, RankedGapAssessment] = {}
    for assessment in evaluation.assessments:
        if assessment.gap_index >= len(state.gaps):
            raise GapEvaluationError("The evaluator referenced an unknown gap")
        if assessment.gap_index in by_gap_index:
            raise GapEvaluationError("The evaluator assessed one gap more than once")

        gap = state.gaps[assessment.gap_index]
        prompt = assessment.technician_prompt or ""
        expected = gap.expected_value
        if (
            prompt
            and expected is not None
            and not isinstance(expected, bool)
            and str(expected).casefold() in prompt.casefold()
        ):
            raise GapEvaluationError(
                "The technician prompt reveals the expected diagnostic value"
            )
        if assessment.method == "documented_test":
            rule_index = cast(int, assessment.rule_index)
            test_index = cast(int, assessment.test_index)
            if rule_index not in gap.rule_indexes:
                raise GapEvaluationError(
                    "The selected test belongs to an unrelated rule"
                )
            rule_position = _rule_position(state, rule_index)
            if rule_position is None or not (
                0 <= test_index < len(state.rules[rule_position].tests)
            ):
                raise GapEvaluationError(
                    "The evaluator referenced an unknown rule test"
                )
        by_gap_index[assessment.gap_index] = RankedGapAssessment(
            **assessment.model_dump(),
            score=calculate_gap_score(assessment),
        )

    if set(by_gap_index) != set(range(len(state.gaps))):
        raise GapEvaluationError("The evaluator did not assess every diagnostic gap")
    return [by_gap_index[index] for index in range(len(state.gaps))]


def _selected_step(
    state: DiagnosticState,
    gap: DiagnosticGap,
    assessment: RankedGapAssessment,
) -> SelectedAgentStep:
    instruction: str | None = None
    constraints: list[str] = []
    source_chunk_ids: list[int] = []
    if assessment.method == "documented_test":
        rule_index = cast(int, assessment.rule_index)
        test_index = cast(int, assessment.test_index)
        rule_position = cast(int, _rule_position(state, rule_index))
        rule = state.rules[rule_position]
        instruction = rule.tests[test_index]
        constraints = rule.constraints
        source_chunk_ids = rule.source_chunk_ids

    return SelectedAgentStep(
        gap_index=assessment.gap_index,
        fact_key=gap.fact_key,
        gap_kind=gap.kind,
        method=assessment.method,
        condition_text=gap.condition_text,
        operator=gap.operator,
        expected_value=gap.expected_value,
        unit=gap.unit,
        rule_indexes=gap.rule_indexes,
        technician_prompt=assessment.technician_prompt or "",
        instruction=instruction,
        constraints=constraints,
        source_chunk_ids=source_chunk_ids,
        score=assessment.score,
    )


def technician_response(decision: AgentNextStepDecision) -> str | None:
    if decision.status in {"no_valid_step", "evaluation_failed"}:
        return (
            "Na podstawie zaakceptowanych danych nie można bezpiecznie wybrać "
            "następnego sprawdzenia."
        )
    if decision.status != "selected" or decision.selected is None:
        return None

    selected = decision.selected
    if selected.method == "ask":
        if not isinstance(selected.expected_value, bool):
            return selected.technician_prompt
        return (
            f"{selected.technician_prompt}\n\nMożliwe odpowiedzi: Tak / Nie / Nie wiem"
        )
    if selected.method == "observe":
        return f"::checklist\n- {selected.technician_prompt}"

    sections: list[str] = []
    if selected.constraints:
        sections.append(f"::warning\n{' '.join(selected.constraints)}")
    sections.append(f"::checklist\n- {selected.technician_prompt}")
    return "\n\n".join(sections)


def select_from_evaluation(
    state: DiagnosticState, evaluation: GapEvaluation
) -> AgentNextStepDecision:
    assessments = _validated_assessments(state, evaluation)
    feasible = [assessment for assessment in assessments if assessment.feasible]
    if not feasible:
        return AgentNextStepDecision(
            status="no_valid_step",
            assessments=assessments,
            reason="No supplied gap has a grounded and feasible acquisition method.",
        )

    selected_assessment = min(
        feasible,
        key=lambda assessment: (
            -assessment.score,
            assessment.safety_risk,
            assessment.effort_cost,
            assessment.gap_index,
        ),
    )
    return AgentNextStepDecision(
        status="selected",
        assessments=assessments,
        selected=_selected_step(
            state,
            state.gaps[selected_assessment.gap_index],
            selected_assessment,
        ),
        reason="Selected the highest-value validated diagnostic gap.",
    )


def _evaluation_payload(state: DiagnosticState) -> dict[str, object]:
    return {
        "facts": [fact.model_dump(mode="json") for fact in state.facts],
        "gaps": [
            {"gap_index": index, **gap.model_dump(mode="json")}
            for index, gap in enumerate(state.gaps)
        ],
        "accepted_rules": [
            {
                "rule_index": extraction_index,
                "conditions": [
                    condition.model_dump(mode="json") for condition in rule.conditions
                ],
                "actions": rule.actions,
                "tests": [
                    {"test_index": test_index, "instruction": instruction}
                    for test_index, instruction in enumerate(rule.tests)
                ],
                "constraints": rule.constraints,
                "source_chunk_ids": rule.source_chunk_ids,
            }
            for extraction_index, rule in zip(
                state.accepted_rule_indexes, state.rules, strict=True
            )
        ],
        "rule_states": [
            rule_state.model_dump(mode="json") for rule_state in state.rule_states
        ],
    }


async def evaluate_next_step(
    state: DiagnosticState, settings: Settings
) -> AgentNextStepDecision:
    if state.status == "insufficient_evidence":
        return AgentNextStepDecision(
            status="no_valid_step",
            reason=(
                state.evidence_gap
                or "Accepted evidence is insufficient to select a diagnostic step."
            ),
        )
    if not state.gaps:
        return AgentNextStepDecision(
            status="no_gaps",
            reason="The diagnostic state contains no unresolved gaps.",
        )

    try:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        messages: list[dict[str, str]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(_evaluation_payload(state), ensure_ascii=False),
            },
        ]
        for attempt in range(2):
            response = await client.chat.completions.parse(
                model=settings.agent_next_step_model,
                reasoning_effort="none",
                response_format=GapEvaluation,
                messages=cast(Any, messages),
            )
            message = response.choices[0].message
            if message.refusal:
                raise GapEvaluationError(
                    f"OpenAI refused gap evaluation: {message.refusal}"
                )
            if message.parsed is None:
                raise GapEvaluationError("OpenAI returned no gap evaluation")
            try:
                return select_from_evaluation(state, message.parsed)
            except GapEvaluationError as error:
                if attempt == 1:
                    raise
                messages.extend(
                    [
                        {
                            "role": "assistant",
                            "content": message.parsed.model_dump_json(),
                        },
                        {
                            "role": "user",
                            "content": (
                                "Backend validation rejected that evaluation: "
                                f"{error}. Regenerate the complete evaluation and "
                                "correct the rejected field. Keep every technician "
                                "prompt neutral and do not include any expected_value "
                                "in the prompt."
                            ),
                        },
                    ]
                )
        raise GapEvaluationError("Gap evaluation did not complete")
    except Exception as error:
        logger.exception("Could not evaluate the agent's next best step")
        return AgentNextStepDecision(
            status="evaluation_failed",
            reason=str(error),
        )
