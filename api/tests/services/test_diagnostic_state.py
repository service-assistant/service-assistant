from app.services.chat.agent.diagnostic_extractor import (
    DiagnosticCondition,
    DiagnosticExtraction,
    DiagnosticRule,
    ExtractedEvidenceGateResult,
)
from app.services.chat.agent.diagnostic_state import prepare_diagnostic_state
from app.services.chat.agent.gap_finder import enrich_with_gaps
from app.services.chat.agent.models import (
    CaseContext,
    MachineContext,
    Observation,
    Symptom,
)


def _case_context() -> CaseContext:
    return CaseContext(
        machine=MachineContext(device_id=7, name="LPE200"),
        symptom=Symptom(
            search_phrase="creep travel speed",
            fact_key="travel_speed_state",
            fact_value="reduced",
        ),
        observations=[
            Observation(
                key="inactivity_duration",
                value=10,
                unit="minutes",
                certainty="certain",
            ),
            Observation(
                key="operator_platform_loaded",
                value=True,
                certainty="certain",
            ),
            Observation(
                key="platform_load_object",
                value="box",
                certainty="certain",
            ),
            Observation(
                key="platform_loaded_during_inactivity",
                value=True,
                certainty="certain",
            ),
        ],
    )


def test_should_prepare_state_from_case_and_only_accepted_rules():
    extraction = DiagnosticExtraction(
        rules=[
            DiagnosticRule(
                conditions=[
                    DiagnosticCondition(
                        text="Platform loaded",
                        fact_key="operator_platform_loaded",
                        operator="eq",
                        expected_value=True,
                    ),
                    DiagnosticCondition(
                        text="No truck activity for 15 minutes",
                        fact_key="inactivity_duration",
                        operator="gte",
                        expected_value=15,
                        unit="minutes",
                    ),
                ],
                actions=["Cycle the platform"],
                source_chunk_ids=[11],
            ),
            DiagnosticRule(
                actions=["No action"],
                source_chunk_ids=[12],
            ),
        ]
    )
    gate = ExtractedEvidenceGateResult(
        decision="accept",
        reason="One rule passed.",
        accepted_rule_indexes=[0],
        accepted_source_chunk_ids=[11],
    )

    state = enrich_with_gaps(
        prepare_diagnostic_state(_case_context(), extraction, gate)
    )

    assert [fact.model_dump() for fact in state.facts] == [
        {
            "key": "travel_speed_state",
            "value": "reduced",
            "unit": None,
            "certainty": "certain",
            "source": "symptom",
        },
        {
            "key": "inactivity_duration",
            "value": 10.0,
            "unit": "minutes",
            "certainty": "certain",
            "source": "observation",
        },
        {
            "key": "operator_platform_loaded",
            "value": True,
            "unit": None,
            "certainty": "certain",
            "source": "observation",
        },
        {
            "key": "platform_load_object",
            "value": "box",
            "unit": None,
            "certainty": "certain",
            "source": "observation",
        },
        {
            "key": "platform_loaded_during_inactivity",
            "value": True,
            "unit": None,
            "certainty": "certain",
            "source": "observation",
        },
    ]
    assert state.accepted_rule_indexes == [0]
    assert state.rules == [extraction.rules[0]]
    assert state.source_chunk_ids == [11]
    assert state.rule_states[0].model_dump() == {
        "extraction_rule_index": 0,
        "status": "conflicting",
        "confirmed_conditions": ["Platform loaded"],
        "gaps": [
            {
                "fact_key": "inactivity_duration",
                "kind": "conflicting",
                "expected_value": 15.0,
                "operator": "gte",
                "unit": "minutes",
                "condition_text": "No truck activity for 15 minutes",
                "rule_indexes": [0],
            }
        ],
    }
    assert state.gaps == []
    assert state.status == "conflicting"


def test_should_prepare_insufficient_state_after_gate_refusal():
    state = enrich_with_gaps(
        prepare_diagnostic_state(
            _case_context(),
            DiagnosticExtraction(
                rules=[],
                evidence_gap="No relevant rule.",
            ),
            ExtractedEvidenceGateResult(
                decision="refuse",
                reason="No rules passed.",
            ),
        )
    )

    assert state.status == "insufficient_evidence"
    assert state.rules == []
    assert state.rule_states == []
    assert state.source_chunk_ids == []
    assert state.evidence_gap == "No relevant rule."


def test_should_not_mark_unverified_conditional_condition_as_confirmed():
    extraction = DiagnosticExtraction(
        rules=[
            DiagnosticRule(
                conditions=[
                    DiagnosticCondition(
                        text="Fault code 2:282 is active",
                        fact_key="fault_code",
                        operator="eq",
                        expected_value="2:282",
                    )
                ],
                actions=["Cycle the platform"],
                source_chunk_ids=[11],
            )
        ]
    )
    gate = ExtractedEvidenceGateResult(
        decision="accept",
        reason="Rule passed.",
        accepted_rule_indexes=[0],
        accepted_source_chunk_ids=[11],
    )

    state = enrich_with_gaps(
        prepare_diagnostic_state(_case_context(), extraction, gate)
    )

    assert state.rule_states[0].status == "partially_matched"
    assert state.rule_states[0].confirmed_conditions == []
    assert state.rule_states[0].gaps[0].model_dump() == {
        "fact_key": "fault_code",
        "kind": "missing",
        "expected_value": "2:282",
        "operator": "eq",
        "unit": None,
        "condition_text": "Fault code 2:282 is active",
        "rule_indexes": [0],
    }
    assert state.gaps == state.rule_states[0].gaps
    assert state.status == "needs_information"


def test_should_deduplicate_uncertain_gap_shared_by_multiple_rules():
    case_context = _case_context().model_copy(
        update={
            "observations": [
                *_case_context().observations,
                Observation(
                    key="pump_operating",
                    value=True,
                    certainty="uncertain",
                ),
            ]
        }
    )
    condition = DiagnosticCondition(
        text="Pump operates during lifting",
        fact_key="pump_operating",
        operator="eq",
        expected_value=True,
    )
    extraction = DiagnosticExtraction(
        rules=[
            DiagnosticRule(
                conditions=[condition],
                tests=["Listen for the pump"],
                source_chunk_ids=[11],
            ),
            DiagnosticRule(
                conditions=[condition],
                actions=["Inspect the hydraulic circuit"],
                source_chunk_ids=[12],
            ),
        ]
    )
    gate = ExtractedEvidenceGateResult(
        decision="accept",
        reason="Both rules passed.",
        accepted_rule_indexes=[0, 1],
        accepted_source_chunk_ids=[11, 12],
    )

    state = enrich_with_gaps(prepare_diagnostic_state(case_context, extraction, gate))

    assert len(state.gaps) == 1
    assert state.gaps[0].kind == "uncertain"
    assert state.gaps[0].rule_indexes == [0, 1]
    assert state.rule_states[0].gaps[0] == state.rule_states[1].gaps[0]
    assert state.status == "needs_information"


def test_certain_conflict_should_eliminate_rule_without_creating_bns_gap():
    extraction = DiagnosticExtraction(
        rules=[
            DiagnosticRule(
                conditions=[
                    DiagnosticCondition(
                        text="Platform is loaded",
                        fact_key="operator_platform_loaded",
                        operator="eq",
                        expected_value=True,
                    )
                ],
                actions=["Cycle the platform"],
                source_chunk_ids=[11],
            ),
            DiagnosticRule(
                conditions=[
                    DiagnosticCondition(
                        text="Platform is empty",
                        fact_key="operator_platform_loaded",
                        operator="eq",
                        expected_value=False,
                    )
                ],
                actions=["Inspect another subsystem"],
                source_chunk_ids=[12],
            ),
        ]
    )
    gate = ExtractedEvidenceGateResult(
        decision="accept",
        reason="Both rules passed.",
        accepted_rule_indexes=[0, 1],
        accepted_source_chunk_ids=[11, 12],
    )

    state = enrich_with_gaps(
        prepare_diagnostic_state(_case_context(), extraction, gate)
    )

    assert [rule.status for rule in state.rule_states] == ["matched", "conflicting"]
    assert state.rule_states[1].gaps[0].kind == "conflicting"
    assert state.gaps == []
    assert state.status == "ready"


def test_should_match_conditional_rule_after_all_conditions_are_satisfied():
    extraction = DiagnosticExtraction(
        rules=[
            DiagnosticRule(
                conditions=[
                    DiagnosticCondition(
                        text="Platform loaded",
                        fact_key="operator_platform_loaded",
                        operator="eq",
                        expected_value=True,
                    )
                ],
                actions=["Cycle the platform"],
                source_chunk_ids=[11],
            )
        ]
    )
    gate = ExtractedEvidenceGateResult(
        decision="accept",
        reason="Rule passed.",
        accepted_rule_indexes=[0],
        accepted_source_chunk_ids=[11],
    )

    state = enrich_with_gaps(
        prepare_diagnostic_state(_case_context(), extraction, gate)
    )

    assert state.rule_states[0].status == "matched"
    assert state.rule_states[0].gaps == []
    assert state.status == "ready"


def test_should_match_rule_when_expected_symbol_contains_a_single_typo():
    case_context = _case_context().model_copy(
        update={
            "observations": [
                *_case_context().observations,
                Observation(
                    key="control_arm_position",
                    value="raised_braked",
                    certainty="certain",
                ),
            ]
        }
    )
    extraction = DiagnosticExtraction(
        rules=[
            DiagnosticRule(
                conditions=[
                    DiagnosticCondition(
                        text="Control arm is raised and braked",
                        fact_key="control_arm_position",
                        operator="eq",
                        expected_value="raised_b braked",
                    )
                ],
                actions=["Continue diagnosis"],
                source_chunk_ids=[11],
            )
        ]
    )
    gate = ExtractedEvidenceGateResult(
        decision="accept",
        reason="Rule passed.",
        accepted_rule_indexes=[0],
        accepted_source_chunk_ids=[11],
    )

    state = enrich_with_gaps(prepare_diagnostic_state(case_context, extraction, gate))

    assert state.rule_states[0].status == "matched"
    assert state.status == "ready"
