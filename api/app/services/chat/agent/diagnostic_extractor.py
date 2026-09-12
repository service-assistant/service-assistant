import json
from typing import Any, Literal, cast

from app.config import Settings
from openai import AsyncOpenAI
from pydantic import Field

from ..retrieval.embedding import RetrievedChunk
from .models import AgentModel, CaseContext, FactValue

SYSTEM_PROMPT = """
Extract diagnostic evidence from service-manual fragments. Do not answer the
technician and do not diagnose beyond the supplied fragments.

Return only rules that directly address the reported symptom or an explicit
observation, or could address it when their documented conditions are verified.
Ordinary-language paraphrases and translations are valid semantic links when their
functions and the rest of the case align.

Write every user-facing descriptive string in Polish, regardless of the source
document language. This applies to condition.text, actions, tests, constraints,
and evidence_gap. Preserve technical codes, measurements, symbols, official
feature names, and identifiers exactly when translating. Keep fact_key in stable
English snake_case and keep expected_value machine-readable; do not translate a
canonical symbolic value merely for display.

For every distinct relevant rule found:
- Put only explicitly documented information into conditions, actions, tests, and
  constraints. Do not fill fields by inference. Put an instruction in
  actions only when the cited fragment presents it as a remedy, recovery, reset, or
  safe next action for the reported symptom. A control sequence that activates,
  causes, or worsens the reported symptom belongs in conditions, not actions. Leave
  actions empty when the fragment documents the cause but no corrective action.
- Every condition is a machine-comparable predicate. Keep its exact documented
  meaning in text, identify the required fact with a stable snake_case fact_key,
  and select the matching operator and expected_value. Use operator "present"
  when only the presence of a value matters; expected_value must then be null.
  Never use "present" for a yes/no state such as a switch being fitted, a button
  being pressed, a sensor being active, or a truck being stopped; encode the
  documented positive state with operator "eq" and expected_value true so a false
  observation conflicts with the rule.
  A general relationship, capability, or documentation statement is explanatory
  context, not a case fact that a technician should be asked to confirm; never
  represent it as a condition or a standalone rule.
- A diagnosis or latent state is not itself an acquirable condition. Use the
  documented observable indicator, control history, measurement, or test result
  that establishes that state. When a fragment links a visible or readable
  indicator to the current state, represent that indicator as a condition when it
  is needed to confirm applicability.
- Reuse a fact_key from case_context whenever the condition describes an existing
  symptom or observation. Otherwise create a stable key for the missing fact that
  a technician could establish. Never infer or invent the current value of that
  fact. An unestablished documented condition is valid in a conditional rule: it
  is a diagnostic fact to check, not an unsupported assumption. Never copy it into
  a separate assumption merely because the case has not confirmed it yet.
- When fact_key_vocabulary is supplied, every condition fact_key must exactly match
  one item from that vocabulary. Use the semantically corresponding canonical key
  regardless of how the condition or future technician question is worded.
  Omit a rule when none of the supplied keys represents a required condition.
- Every explicitly documented, currently observable indicator needed to establish
  whether a rule applies must be represented as a condition. Do not omit such an
  indicator or preserve it only as explanatory prose.
- When required_condition_fact_keys is supplied, include every listed key as a
  condition in at least one rule when the supplied fragments support it. Do not
  invent unsupported conditions. If a required key is not supported, explain that
  limitation in evidence_gap.
- The supplied chunks were retrieved only from documents assigned to the selected
  device. Treat that device-document scope as trusted provenance. Do not add an
  assumption that the machine has the documented feature, component, parameter, or
  fault-code system merely because that fact is not repeated in the case text.
- Do not add new factual claims absent from both case context and the cited
  fragments. Omit a rule that requires such a claim.
- source_chunk_ids must contain only IDs supplied in the input.
- Treat consecutive chunks in each supplied contiguous_chunk_group as one document
  passage. A chunk beginning with a numbered step or referring to "the function"
  may continue the heading and setup in the preceding chunk. Merge conditions and
  recovery actions from such a passage into one coherent rule and cite every chunk
  used. Do not discard an actionable continuation merely because its heading is in
  the preceding chunk.
- Conditions describe facts needed to establish that the rule currently applies,
  not every historical step that may originally have activated the state. A
  documented observable indicator of an active state may be a condition when a
  technician can check it. Do not require the technician to reconstruct an earlier
  activation sequence when the documented current indicator resolves applicability.
- A shared symptom or indicator does not by itself distinguish competing causes.
  When two mechanisms can produce the same indicator or effect, include each
  mechanism's explicitly documented, observable distinguishing condition (for
  example whether its optional control is fitted or was used). Do not mark an
  action-bearing conditional rule as matched from the shared indicator alone.
- Keep actions atomic: each distinct alternative repair must be a separate list
  item in documentation order. Never combine alternatives with "or" in one action.

Return no rule merely because a fragment shares generic words with the question.
Context completeness is not required: a partial but actionable or testable rule is
valid evidence. Extract every distinct viable candidate that the supplied chunks
support; do not mention a supported candidate only in evidence_gap while omitting
its rule. If no candidate rule exists, explain the evidence gap briefly.
""".strip()


class DiagnosticCondition(AgentModel):
    text: str = Field(description="Polish user-facing description of the condition.")
    fact_key: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    operator: Literal["eq", "neq", "gt", "gte", "lt", "lte", "present"]
    expected_value: FactValue | None = None
    unit: str | None = None


class DiagnosticRule(AgentModel):
    conditions: list[DiagnosticCondition] = Field(default_factory=list)
    actions: list[str] = Field(
        default_factory=list,
        description="Documented actions translated into Polish.",
    )
    tests: list[str] = Field(
        default_factory=list,
        description="Documented diagnostic tests translated into Polish.",
    )
    constraints: list[str] = Field(
        default_factory=list,
        description="Documented constraints and warnings translated into Polish.",
    )
    source_chunk_ids: list[int] = Field(default_factory=list)


class DiagnosticExtraction(AgentModel):
    rules: list[DiagnosticRule] = Field(default_factory=list)
    evidence_gap: str | None = Field(
        default=None,
        description="Polish explanation used when relevant evidence is missing.",
    )


class RuleGateEvaluation(AgentModel):
    rule_index: int
    accepted: bool
    failures: list[str] = Field(default_factory=list)


class EvidenceGateFailure(AgentModel):
    rule_index: int | None = None
    attribute: str
    code: str
    message: str


class ExtractedEvidenceGateResult(AgentModel):
    decision: Literal["accept", "refuse"]
    reason: str
    accepted_rule_indexes: list[int] = Field(default_factory=list)
    accepted_source_chunk_ids: list[int] = Field(default_factory=list)
    rule_evaluations: list[RuleGateEvaluation] = Field(default_factory=list)
    failures: list[EvidenceGateFailure] = Field(default_factory=list)


class DiagnosticExtractionError(RuntimeError):
    pass


def empty_extraction(reason: str) -> DiagnosticExtraction:
    return DiagnosticExtraction(rules=[], evidence_gap=reason)


def _contiguous_chunk_groups(chunks: list[RetrievedChunk]) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    ordered = sorted(chunks, key=lambda chunk: (chunk["attachment_id"], chunk["id"]))
    for chunk in ordered:
        if (
            groups
            and groups[-1]["attachment_id"] == chunk["attachment_id"]
            and groups[-1]["chunk_ids"][-1] + 1 == chunk["id"]
        ):
            groups[-1]["chunk_ids"].append(chunk["id"])
        else:
            groups.append(
                {
                    "attachment_id": chunk["attachment_id"],
                    "chunk_ids": [chunk["id"]],
                }
            )
    return [group for group in groups if len(group["chunk_ids"]) > 1]


async def extract_diagnostic_evidence(
    case_context: CaseContext,
    chunks: list[RetrievedChunk],
    settings: Settings,
    fact_key_vocabulary: list[str] | None = None,
    required_condition_fact_keys: list[str] | None = None,
) -> DiagnosticExtraction:
    if not chunks:
        return empty_extraction("Retrieval did not provide fragments for extraction.")

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    payload = {
        "case_context": case_context.model_dump(mode="json"),
        "output_language": "pl-PL",
        "retrieval_scope": {
            "device_scoped": True,
            "description": (
                "Every chunk comes from a document assigned to the selected device."
            ),
        },
        "fact_key_vocabulary": fact_key_vocabulary,
        "required_condition_fact_keys": required_condition_fact_keys,
        "contiguous_chunk_groups": _contiguous_chunk_groups(chunks),
        "chunks": [
            {
                "id": chunk["id"],
                "content": chunk["content"],
                "metadata": chunk.get("extra_metadata") or {},
            }
            for chunk in chunks
        ],
    }
    messages: list[dict[str, str]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]
    allowed_fact_keys = set(fact_key_vocabulary or [])
    required_fact_keys = set(required_condition_fact_keys or [])
    for attempt in range(2):
        response = await client.chat.completions.parse(
            model=settings.agent_diagnostic_extractor_model,
            reasoning_effort="none",
            response_format=DiagnosticExtraction,
            messages=cast(Any, messages),
        )
        message = response.choices[0].message
        if message.refusal:
            raise DiagnosticExtractionError(
                f"OpenAI refused diagnostic extraction: {message.refusal}"
            )
        if message.parsed is None:
            raise DiagnosticExtractionError("OpenAI returned no diagnostic extraction")

        unknown_fact_keys = sorted(
            {
                condition.fact_key
                for rule in message.parsed.rules
                for condition in rule.conditions
                if allowed_fact_keys and condition.fact_key not in allowed_fact_keys
            }
        )
        extracted_fact_keys = {
            condition.fact_key
            for rule in message.parsed.rules
            for condition in rule.conditions
        }
        missing_required_keys = sorted(required_fact_keys - extracted_fact_keys)
        if not unknown_fact_keys and not missing_required_keys:
            return message.parsed
        if attempt == 1:
            raise DiagnosticExtractionError(
                "Extractor repeatedly violated the condition fact-key contract: "
                f"unknown={unknown_fact_keys}, missing_required={missing_required_keys}"
            )
        messages.extend(
            [
                {
                    "role": "assistant",
                    "content": message.parsed.model_dump_json(),
                },
                {
                    "role": "user",
                    "content": (
                        "Backend validation rejected the condition fact-key contract. "
                        f"Unknown keys: {unknown_fact_keys}. Missing required keys: "
                        f"{missing_required_keys}. Regenerate the complete extraction. "
                        "Every condition fact_key must exactly match one supplied "
                        "fact_key_vocabulary value, every supported required key must "
                        "occur as a condition, and no new key may be created."
                    ),
                },
            ]
        )

    raise DiagnosticExtractionError("Diagnostic extraction did not complete")


def evaluate_extracted_evidence(
    extraction: DiagnosticExtraction,
    chunks: list[RetrievedChunk],
    allowed_fact_keys: set[str] | None = None,
) -> ExtractedEvidenceGateResult:
    chunks_by_id = {chunk["id"]: chunk for chunk in chunks}
    evaluations: list[RuleGateEvaluation] = []
    gate_failures: list[EvidenceGateFailure] = []
    accepted_indexes: list[int] = []
    accepted_source_ids: set[int] = set()

    for index, rule in enumerate(extraction.rules):
        failures: list[str] = []

        def fail(attribute: str, code: str, message: str) -> None:
            failures.append(code)
            gate_failures.append(
                EvidenceGateFailure(
                    rule_index=index,
                    attribute=attribute,
                    code=code,
                    message=message,
                )
            )

        if not (rule.actions or rule.tests):
            fail(
                "actions/tests",
                "not_diagnostically_useful",
                "Reguła nie zawiera działania ani testu diagnostycznego.",
            )
        for condition_index, condition in enumerate(rule.conditions):
            if (
                allowed_fact_keys is not None
                and condition.fact_key not in allowed_fact_keys
            ):
                fail(
                    f"conditions.{condition_index}.fact_key",
                    "unsupported_condition_fact_key",
                    "Klucz warunku nie występuje w słowniku faktów tego benchmarku.",
                )
            if condition.operator == "present" and condition.expected_value is not None:
                fail(
                    f"conditions.{condition_index}.expected_value",
                    "unexpected_condition_value",
                    "Warunek present nie może zawierać wartości expected_value.",
                )
            elif condition.operator != "present" and condition.expected_value is None:
                fail(
                    f"conditions.{condition_index}.expected_value",
                    "missing_condition_value",
                    f"Warunek {condition.operator} wymaga wartości expected_value.",
                )

        valid_ids = [
            chunk_id for chunk_id in rule.source_chunk_ids if chunk_id in chunks_by_id
        ]
        if not valid_ids or len(valid_ids) != len(rule.source_chunk_ids):
            fail(
                "source_chunk_ids",
                "invalid_source_chunk_ids",
                "Co najmniej jeden wskazany chunk nie istnieje w wejściu extractora.",
            )
        accepted = not failures
        if accepted:
            accepted_indexes.append(index)
            accepted_source_ids.update(valid_ids)
        evaluations.append(
            RuleGateEvaluation(
                rule_index=index,
                accepted=accepted,
                failures=failures,
            )
        )

    if accepted_indexes:
        return ExtractedEvidenceGateResult(
            decision="accept",
            reason=(
                "At least one cited, structurally valid and diagnostically useful "
                "rule passed."
            ),
            accepted_rule_indexes=accepted_indexes,
            accepted_source_chunk_ids=sorted(accepted_source_ids),
            rule_evaluations=evaluations,
            failures=gate_failures,
        )
    if not extraction.rules:
        gate_failures.append(
            EvidenceGateFailure(
                attribute="rules",
                code="no_rules_extracted",
                message="Extractor nie zwrócił żadnej kandydackiej reguły do walidacji.",
            )
        )
    return ExtractedEvidenceGateResult(
        decision="refuse",
        reason=extraction.evidence_gap
        or "No extracted rule passed the evidence checks.",
        rule_evaluations=evaluations,
        failures=gate_failures,
    )
