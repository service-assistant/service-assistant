from types import SimpleNamespace

from app.schemas import PhotoObservation
from app.services.chat.agent.case_understanding import (
    CASE_UNDERSTANDING_MODEL,
    SYSTEM_PROMPT,
    understand_case,
)
from app.services.chat.agent.models import (
    CaseUnderstandingResult,
    ExtractedCaseContext,
    MachineContext,
    Observation,
    RetrievalQueryPlan,
    Symptom,
)


async def test_should_extract_case_without_storing_raw_message(mocker, settings):
    parsed = CaseUnderstandingResult(
        case_context=ExtractedCaseContext(
            symptom=Symptom(
                search_phrase="forklift forks do not raise",
                fact_key="lifting_state",
                fact_value="not_operating",
            ),
            observations=[
                Observation(
                    key="pump_sound_state",
                    value="present",
                    certainty="certain",
                )
            ],
        ),
        query_plan=RetrievalQueryPlan(
            base_queries=["lift function not operating"],
            contextual_queries=["forks do not raise hydraulic pump operates"],
        ),
    )
    response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(parsed=parsed, refusal=None),
            )
        ]
    )
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.parse = mocker.AsyncMock(return_value=response)
    mocker.patch(
        "app.services.chat.agent.case_understanding.AsyncOpenAI",
        return_value=mock_client,
    )

    result = await understand_case(
        "  widły nie chcą iść do góry  ",
        MachineContext(device_id=123, name="Toyota 8FBE25"),
        settings,
        photo_observations=[
            PhotoObservation(
                component="pompa hydrauliczna",
                main_identifier="P-100",
                confidence=0.9,
            )
        ],
    )

    assert result.case_context.symptom.model_dump() == {
        "search_phrase": "forklift forks do not raise",
        "fact_key": "lifting_state",
        "fact_value": "not_operating",
        "unit": None,
    }
    call = mock_client.chat.completions.parse.call_args.kwargs
    assert call["model"] == CASE_UNDERSTANDING_MODEL == "gpt-4o-mini"
    assert call["response_format"] is CaseUnderstandingResult
    assert "reasoning_effort" not in call
    user_content = call["messages"][1]["content"]
    assert "Toyota 8FBE25" in user_content
    assert "P-100" in user_content
    assert "symptom.raw" not in SYSTEM_PROMPT
    assert (
        "every item in base_queries and contextual_queries in English" in SYSTEM_PROMPT
    )
    assert "reduced or creep\n  travel speed" in SYSTEM_PROMPT
    assert "folding step on which the operator normally stands" in SYSTEM_PROMPT
    assert "creep speed after 10 minutes inactivity" in SYSTEM_PROMPT
    assert 'Avoid vague literal phrases such as "dragging"' in SYSTEM_PROMPT
    assert "Every observation must be one atomic fact" in SYSTEM_PROMPT
    assert "platform_loaded_during_inactivity=true" in SYSTEM_PROMPT
    assert 'component="operator platform" and object="box"' in SYSTEM_PROMPT
    assert "machine name, manufacturer, model, or serial number" in SYSTEM_PROMPT
    assert "restore normal travel speed" in SYSTEM_PROMPT
    assert "machine model/manufacturer information" not in SYSTEM_PROMPT
    query_plan_schema = RetrievalQueryPlan.model_json_schema()["properties"]
    assert query_plan_schema["base_queries"]["maxItems"] == 2
    assert query_plan_schema["base_queries"]["description"].endswith("in English.")
    assert query_plan_schema["contextual_queries"]["maxItems"] == 1
    assert query_plan_schema["contextual_queries"]["description"].endswith(
        "in English."
    )
