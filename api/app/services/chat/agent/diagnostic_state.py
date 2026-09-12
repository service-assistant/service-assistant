from typing import Literal

from pydantic import Field

from .diagnostic_extractor import (
    DiagnosticExtraction,
    DiagnosticRule,
    ExtractedEvidenceGateResult,
)
from .models import AgentModel, CaseContext, FactValue


class DiagnosticFact(AgentModel):
    key: str
    value: FactValue
    unit: str | None = None
    certainty: Literal["certain", "uncertain"]
    source: Literal["symptom", "observation"]


class DiagnosticGap(AgentModel):
    fact_key: str
    kind: Literal["missing", "uncertain", "conflicting"]
    expected_value: FactValue | None = None
    operator: Literal["eq", "neq", "gt", "gte", "lt", "lte", "present"]
    unit: str | None = None
    condition_text: str
    rule_indexes: list[int] = Field(default_factory=list)


class DiagnosticRuleState(AgentModel):
    extraction_rule_index: int
    status: Literal["matched", "partially_matched", "conflicting"]
    confirmed_conditions: list[str] = Field(default_factory=list)
    gaps: list[DiagnosticGap] = Field(default_factory=list)


class DiagnosticState(AgentModel):
    status: Literal[
        "ready", "needs_information", "conflicting", "insufficient_evidence"
    ]
    case_context: CaseContext
    facts: list[DiagnosticFact] = Field(default_factory=list)
    accepted_rule_indexes: list[int] = Field(default_factory=list)
    rules: list[DiagnosticRule] = Field(default_factory=list)
    rule_states: list[DiagnosticRuleState] = Field(default_factory=list)
    gaps: list[DiagnosticGap] = Field(default_factory=list)
    evidence_gap: str | None = None
    source_chunk_ids: list[int] = Field(default_factory=list)


def _facts_from_case(case_context: CaseContext) -> list[DiagnosticFact]:
    return [
        DiagnosticFact(
            key=case_context.symptom.fact_key,
            value=(
                case_context.symptom.fact_value
                if case_context.symptom.fact_value is not None
                else case_context.symptom.search_phrase
            ),
            unit=case_context.symptom.unit,
            certainty="certain",
            source="symptom",
        ),
        *[
            DiagnosticFact(
                key=observation.key,
                value=observation.value,
                unit=observation.unit,
                certainty=observation.certainty,
                source="observation",
            )
            for observation in case_context.observations
        ],
    ]


def prepare_diagnostic_state(
    case_context: CaseContext,
    extraction: DiagnosticExtraction,
    evidence_gate: ExtractedEvidenceGateResult,
) -> DiagnosticState:
    accepted_indexes = [
        index
        for index in evidence_gate.accepted_rule_indexes
        if 0 <= index < len(extraction.rules)
    ]
    rules = [extraction.rules[index] for index in accepted_indexes]
    source_chunk_ids = sorted(
        {
            chunk_id
            for rule in rules
            for chunk_id in rule.source_chunk_ids
            if chunk_id in evidence_gate.accepted_source_chunk_ids
        }
    )
    return DiagnosticState(
        status="ready" if rules else "insufficient_evidence",
        case_context=case_context,
        facts=_facts_from_case(case_context),
        accepted_rule_indexes=accepted_indexes,
        rules=rules,
        evidence_gap=extraction.evidence_gap,
        source_chunk_ids=source_chunk_ids,
    )
