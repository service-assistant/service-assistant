from types import SimpleNamespace
from typing import cast

from app.config import Settings
from app.services.chat.agent.diagnostic_extractor import (
    SYSTEM_PROMPT,
    DiagnosticCondition,
    DiagnosticExtraction,
    DiagnosticRule,
    evaluate_extracted_evidence,
    extract_diagnostic_evidence,
)
from app.services.chat.agent.models import CaseContext, MachineContext, Symptom
from app.services.chat.retrieval.embedding import RetrievedChunk


def _case_context() -> CaseContext:
    return CaseContext(
        machine=MachineContext(device_id=7, name="LPE200"),
        symptom=Symptom(search_phrase="truck does not drive"),
    )


def _chunk() -> RetrievedChunk:
    return {
        "id": 11,
        "attachment_id": 3,
        "content": "If error 5:135 is shown, allow the truck to cool down.",
        "extra_metadata": {"page": 48},
    }


def test_should_accept_grounded_useful_rule():
    extraction = DiagnosticExtraction(
        rules=[
            DiagnosticRule(
                conditions=[
                    DiagnosticCondition(
                        text="error 5:135 is shown",
                        fact_key="display_fault_code",
                        operator="eq",
                        expected_value="5:135",
                    )
                ],
                actions=["allow the truck to cool down"],
                source_chunk_ids=[11],
            )
        ]
    )

    result = evaluate_extracted_evidence(extraction, [_chunk()])

    assert result.decision == "accept"
    assert result.accepted_rule_indexes == [0]
    assert result.accepted_source_chunk_ids == [11]


def test_should_accept_conditional_rule_with_unverified_documented_condition():
    extraction = DiagnosticExtraction(
        rules=[
            DiagnosticRule(
                conditions=[
                    DiagnosticCondition(
                        text="error 5:135 is shown",
                        fact_key="display_fault_code",
                        operator="eq",
                        expected_value="5:135",
                    )
                ],
                actions=["allow the truck to cool down"],
                source_chunk_ids=[11],
            )
        ]
    )

    result = evaluate_extracted_evidence(extraction, [_chunk()])

    assert result.decision == "accept"
    assert result.accepted_rule_indexes == [0]
    assert result.failures == []


def test_should_refuse_rule_with_invalid_source_chunk():
    extraction = DiagnosticExtraction(
        rules=[
            DiagnosticRule(
                actions=["inspect the steering system"],
                source_chunk_ids=[999],
            )
        ]
    )

    result = evaluate_extracted_evidence(extraction, [_chunk()])

    assert result.decision == "refuse"
    assert result.rule_evaluations[0].failures == ["invalid_source_chunk_ids"]
    assert [failure.attribute for failure in result.failures] == ["source_chunk_ids"]


def test_should_reject_only_rule_with_missing_comparison_value():
    extraction = DiagnosticExtraction(
        rules=[
            DiagnosticRule(
                conditions=[
                    DiagnosticCondition(
                        text="automatic shutoff threshold is below the limit",
                        fact_key="automatic_shutoff_threshold",
                        operator="lt",
                        expected_value=None,
                        unit="%",
                    )
                ],
                actions=["inspect the automatic shutoff threshold"],
                source_chunk_ids=[11],
            ),
            DiagnosticRule(
                actions=["allow the truck to cool down"],
                source_chunk_ids=[11],
            ),
        ]
    )

    result = evaluate_extracted_evidence(extraction, [_chunk()])

    assert result.decision == "accept"
    assert result.accepted_rule_indexes == [1]
    assert result.rule_evaluations[0].failures == ["missing_condition_value"]
    assert result.failures[0].attribute == "conditions.0.expected_value"


def test_should_reject_rule_using_fact_key_outside_benchmark_vocabulary():
    extraction = DiagnosticExtraction(
        rules=[
            DiagnosticRule(
                conditions=[
                    DiagnosticCondition(
                        text="the lever is neutral",
                        fact_key="invented_lever_state",
                        operator="eq",
                        expected_value=True,
                    )
                ],
                actions=["allow the truck to cool down"],
                source_chunk_ids=[11],
            )
        ]
    )

    result = evaluate_extracted_evidence(
        extraction,
        [_chunk()],
        allowed_fact_keys={"travel_control_neutral"},
    )

    assert result.decision == "refuse"
    assert result.rule_evaluations[0].failures == ["unsupported_condition_fact_key"]
    assert result.failures[0].attribute == "conditions.0.fact_key"


def test_should_explain_refusal_when_extractor_returns_no_rules():
    result = evaluate_extracted_evidence(
        DiagnosticExtraction(rules=[], evidence_gap="No relevant manual rule."),
        [_chunk()],
    )

    assert result.decision == "refuse"
    assert result.rule_evaluations == []
    assert result.failures[0].model_dump() == {
        "rule_index": None,
        "attribute": "rules",
        "code": "no_rules_extracted",
        "message": "Extractor nie zwrócił żadnej kandydackiej reguły do walidacji.",
    }


async def test_should_use_luna_without_reasoning_and_structured_output(mocker):
    parsed = DiagnosticExtraction(rules=[], evidence_gap="No matching rule.")
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed, refusal=None))]
    )
    client = mocker.MagicMock()
    client.chat.completions.parse = mocker.AsyncMock(return_value=response)
    mocker.patch(
        "app.services.chat.agent.diagnostic_extractor.AsyncOpenAI",
        return_value=client,
    )

    settings = cast(
        Settings,
        SimpleNamespace(
            openai_api_key="test-key",
            agent_diagnostic_extractor_model="gpt-5.6-luna",
        ),
    )
    result = await extract_diagnostic_evidence(
        _case_context(),
        [_chunk()],
        settings,
        fact_key_vocabulary=["display_fault_code"],
    )

    assert result == parsed
    call = client.chat.completions.parse.call_args.kwargs
    assert call["model"] == "gpt-5.6-luna"
    assert call["reasoning_effort"] == "none"
    assert call["response_format"] is DiagnosticExtraction
    assert '"id": 11' in call["messages"][1]["content"]
    assert '"output_language": "pl-PL"' in call["messages"][1]["content"]
    assert '"device_scoped": true' in call["messages"][1]["content"]
    assert '"contiguous_chunk_groups": []' in call["messages"][1]["content"]
    assert (
        '"fact_key_vocabulary": ["display_fault_code"]'
        in call["messages"][1]["content"]
    )
    assert '"required_condition_fact_keys": null' in call["messages"][1]["content"]
    assert 'operator "present"' in SYSTEM_PROMPT
    assert "Reuse a fact_key from case_context" in SYSTEM_PROMPT
    assert "Do not add new factual claims" in SYSTEM_PROMPT
    assert "Treat that device-document scope as trusted provenance" in SYSTEM_PROMPT
    assert "Write every user-facing descriptive string in Polish" in SYSTEM_PROMPT
    assert "keep expected_value machine-readable" in SYSTEM_PROMPT
    assert "When fact_key_vocabulary is supplied" in SYSTEM_PROMPT
    assert "activates,\n  causes, or worsens" in SYSTEM_PROMPT
    assert "is explanatory\n  context, not a case fact" in SYSTEM_PROMPT
    assert "Merge conditions and\n  recovery actions" in SYSTEM_PROMPT
    assert "A diagnosis or latent state is not itself an" in SYSTEM_PROMPT
    assert "Click-2-Creep" not in SYSTEM_PROMPT
    assert "SLO" not in SYSTEM_PROMPT
    assert "Extract every distinct viable candidate" in SYSTEM_PROMPT
    assert 'Never use "present" for a yes/no state' in SYSTEM_PROMPT
    assert "shared symptom or indicator does not by itself distinguish" in SYSTEM_PROMPT


async def test_should_retry_fact_keys_outside_supplied_vocabulary(mocker):
    invalid = DiagnosticExtraction(
        rules=[
            DiagnosticRule(
                conditions=[
                    DiagnosticCondition(
                        text="SLO is displayed.",
                        fact_key="display_slo",
                        operator="eq",
                        expected_value=True,
                    )
                ],
                actions=["Restore normal travel speed."],
                source_chunk_ids=[11],
            )
        ]
    )
    corrected = invalid.model_copy(deep=True)
    corrected.rules[0].conditions[0].fact_key = "display_message"
    corrected.rules[0].conditions[0].expected_value = "SLO"
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
        "app.services.chat.agent.diagnostic_extractor.AsyncOpenAI",
        return_value=client,
    )
    settings = cast(
        Settings,
        SimpleNamespace(
            openai_api_key="test-key",
            agent_diagnostic_extractor_model="gpt-5.6-luna",
        ),
    )

    result = await extract_diagnostic_evidence(
        _case_context(),
        [_chunk()],
        settings,
        fact_key_vocabulary=["display_message", "displayed_message"],
    )

    assert client.chat.completions.parse.await_count == 2
    assert result.rules[0].conditions[0].fact_key == "display_message"
    retry_messages = client.chat.completions.parse.await_args.kwargs["messages"]
    assert "display_slo" in retry_messages[-1]["content"]
    assert "no new key may be created" in retry_messages[-1]["content"]


async def test_should_retry_when_required_condition_is_omitted(mocker):
    omitted = DiagnosticExtraction(
        rules=[
            DiagnosticRule(
                conditions=[
                    DiagnosticCondition(
                        text="The reported symptom is present.",
                        fact_key="reported_symptom",
                        operator="present",
                    )
                ],
                actions=["Perform the documented recovery action."],
                source_chunk_ids=[11],
            )
        ]
    )
    corrected = omitted.model_copy(deep=True)
    corrected.rules[0].conditions.append(
        DiagnosticCondition(
            text="A fault code is displayed.",
            fact_key="display_fault_code",
            operator="present",
        )
    )
    responses = [
        SimpleNamespace(
            choices=[
                SimpleNamespace(message=SimpleNamespace(parsed=parsed, refusal=None))
            ]
        )
        for parsed in (omitted, corrected)
    ]
    client = mocker.MagicMock()
    client.chat.completions.parse = mocker.AsyncMock(side_effect=responses)
    mocker.patch(
        "app.services.chat.agent.diagnostic_extractor.AsyncOpenAI",
        return_value=client,
    )
    settings = cast(
        Settings,
        SimpleNamespace(
            openai_api_key="test-key",
            agent_diagnostic_extractor_model="gpt-5.6-luna",
        ),
    )

    result = await extract_diagnostic_evidence(
        _case_context(),
        [_chunk()],
        settings,
        fact_key_vocabulary=["reported_symptom", "display_fault_code"],
        required_condition_fact_keys=["display_fault_code"],
    )

    assert client.chat.completions.parse.await_count == 2
    assert {condition.fact_key for condition in result.rules[0].conditions} == {
        "reported_symptom",
        "display_fault_code",
    }
    retry_messages = client.chat.completions.parse.await_args.kwargs["messages"]
    assert (
        "Missing required keys: ['display_fault_code']"
        in (retry_messages[-1]["content"])
    )


def test_should_identify_contiguous_chunks_from_the_same_attachment():
    from app.services.chat.agent.diagnostic_extractor import _contiguous_chunk_groups

    chunks: list[RetrievedChunk] = [
        {"id": 12, "attachment_id": 3, "content": "action", "extra_metadata": None},
        {"id": 10, "attachment_id": 3, "content": "heading", "extra_metadata": None},
        {"id": 11, "attachment_id": 3, "content": "setup", "extra_metadata": None},
        {"id": 13, "attachment_id": 4, "content": "other", "extra_metadata": None},
    ]

    assert _contiguous_chunk_groups(chunks) == [
        {"attachment_id": 3, "chunk_ids": [10, 11, 12]}
    ]
