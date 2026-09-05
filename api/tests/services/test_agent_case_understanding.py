from types import SimpleNamespace

from app.schemas import PhotoObservation
from app.services.chat.agent.case_understanding import understand_case
from app.services.chat.agent.models import (
    CaseUnderstandingResult,
    ExtractedCaseContext,
    MachineContext,
    Observation,
    RetrievalQueryPlan,
    Symptom,
)


async def test_should_extract_case_and_preserve_raw_message(mocker, settings):
    parsed = CaseUnderstandingResult(
        case_context=ExtractedCaseContext(
            symptom=Symptom(
                raw="LLM changed the wording",
                search_phrase="forklift forks do not raise",
            ),
            observations=[
                Observation(
                    type="pump_sound",
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

    assert result.case_context.symptom.raw == "widły nie chcą iść do góry"
    call = mock_client.chat.completions.parse.call_args.kwargs
    assert call["response_format"] is CaseUnderstandingResult
    user_content = call["messages"][1]["content"]
    assert "Toyota 8FBE25" in user_content
    assert "P-100" in user_content
