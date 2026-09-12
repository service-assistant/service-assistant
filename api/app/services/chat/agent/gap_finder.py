from typing import Literal

from .diagnostic_extractor import DiagnosticCondition
from .diagnostic_state import (
    DiagnosticFact,
    DiagnosticGap,
    DiagnosticRuleState,
    DiagnosticState,
)
from .fact_comparator import FactComparator, normalized_text
from .models import FactValue

ConditionResult = Literal["satisfied", "missing", "uncertain", "conflicting"]


def _evaluate_condition(
    condition: DiagnosticCondition,
    facts_by_key: dict[str, DiagnosticFact],
    comparator: FactComparator,
) -> ConditionResult:
    fact = facts_by_key.get(condition.fact_key)
    if fact is None:
        return "missing"
    if fact.certainty == "uncertain":
        return "uncertain"
    if condition.unit and normalized_text(fact.unit or "") != normalized_text(
        condition.unit
    ):
        return "conflicting"
    comparison = comparator.compare_condition(
        condition.fact_key,
        fact.value,
        condition.operator,
        condition.expected_value,
    )
    if comparison == "indeterminate":
        return "uncertain"
    return "satisfied" if comparison == "match" else "conflicting"


def _gap_key(gap: DiagnosticGap) -> tuple[str, str, str, str]:
    return (
        gap.fact_key,
        gap.operator,
        repr(gap.expected_value),
        normalized_text(gap.unit or ""),
    )


def enrich_with_gaps(state: DiagnosticState) -> DiagnosticState:
    """Recalculate rule states and diagnostic gaps from the current facts."""
    facts_by_key = {fact.key: fact for fact in state.facts}
    allowed_values_by_fact: dict[str, list[FactValue]] = {}
    for rule in state.rules:
        for condition in rule.conditions:
            if condition.expected_value is not None:
                allowed_values_by_fact.setdefault(condition.fact_key, []).append(
                    condition.expected_value
                )
    comparator = FactComparator(allowed_values_by_fact)
    gaps_by_key: dict[tuple[str, str, str, str], DiagnosticGap] = {}
    rule_states: list[DiagnosticRuleState] = []

    for extraction_index, rule in zip(
        state.accepted_rule_indexes, state.rules, strict=True
    ):
        confirmed_conditions: list[str] = []
        rule_gaps: list[DiagnosticGap] = []

        for condition in rule.conditions:
            result = _evaluate_condition(condition, facts_by_key, comparator)
            if result == "satisfied":
                confirmed_conditions.append(condition.text)
                continue

            candidate = DiagnosticGap(
                fact_key=condition.fact_key,
                kind=result,
                expected_value=condition.expected_value,
                operator=condition.operator,
                unit=condition.unit,
                condition_text=condition.text,
                rule_indexes=[extraction_index],
            )
            if result == "conflicting":
                rule_gaps.append(candidate)
                continue

            key = _gap_key(candidate)
            gap = gaps_by_key.get(key)
            if gap is None:
                gaps_by_key[key] = candidate
                gap = candidate
            elif extraction_index not in gap.rule_indexes:
                gap.rule_indexes.append(extraction_index)
            rule_gaps.append(gap)

        if any(gap.kind == "conflicting" for gap in rule_gaps):
            rule_status: Literal["matched", "partially_matched", "conflicting"] = (
                "conflicting"
            )
        elif rule_gaps:
            rule_status = "partially_matched"
        else:
            rule_status = "matched"

        rule_states.append(
            DiagnosticRuleState(
                extraction_rule_index=extraction_index,
                status=rule_status,
                confirmed_conditions=confirmed_conditions,
                gaps=rule_gaps,
            )
        )

    gaps = list(gaps_by_key.values())
    has_matched_rule = any(rule_state.status == "matched" for rule_state in rule_states)
    has_conflicting_rule = any(
        rule_state.status == "conflicting" for rule_state in rule_states
    )
    if not state.rules:
        status: Literal[
            "ready", "needs_information", "conflicting", "insufficient_evidence"
        ] = "insufficient_evidence"
    elif gaps:
        status = "needs_information"
    elif has_matched_rule:
        status = "ready"
    elif has_conflicting_rule:
        status = "conflicting"
    else:
        status = "ready"

    return state.model_copy(
        update={"status": status, "rule_states": rule_states, "gaps": gaps}
    )
