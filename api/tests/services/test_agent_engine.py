from types import SimpleNamespace

from app.models import ChatThread
from app.schemas import ChatMode, MessageCreate
from app.services.chat.agent.engine import stream_message
from app.services.chat.agent.models import (
    CaseUnderstandingResult,
    ExtractedCaseContext,
    RetrievalQueryPlan,
    Symptom,
)


async def test_should_build_machine_context_and_run_expanded_retrieval(
    mocker, settings
):
    repository = mocker.MagicMock()
    repository.get = mocker.AsyncMock(
        return_value=SimpleNamespace(
            id=123,
            name="Toyota 8FBE25",
            model_serial_code="8FBE25",
        )
    )
    mocker.patch(
        "app.services.chat.agent.engine.DeviceRepository", return_value=repository
    )
    understand = mocker.patch(
        "app.services.chat.agent.engine.understand_case",
        new_callable=mocker.AsyncMock,
        return_value=CaseUnderstandingResult(
            case_context=ExtractedCaseContext(
                symptom=Symptom(
                    raw="widły nie podnoszą",
                    search_phrase="forklift forks do not raise",
                )
            ),
            query_plan=RetrievalQueryPlan(
                base_queries=[
                    "lift function not operating",
                    "forklift forks do not raise",
                ],
                contextual_queries=["Toyota 8FBE25 mast does not lift"],
            ),
        ),
    )
    expected_response = object()
    pipeline = mocker.patch(
        "app.services.chat.pipeline.stream_message",
        new_callable=mocker.AsyncMock,
        return_value=expected_response,
    )
    thread = ChatThread(
        id=1,
        device_id=123,
        title="Test thread",
        nameplate_data={"manufacturer": "Toyota"},
    )
    body = MessageCreate(content="widły nie podnoszą", mode=ChatMode.agent)
    session = mocker.MagicMock()

    response = await stream_message(
        thread,
        body,
        settings,
        session,
        organization_id=7,
        debug=True,
    )

    assert response is expected_response
    repository.get.assert_awaited_once_with(123)
    understand.assert_awaited_once()
    assert understand.call_args.args[1].name == "Toyota 8FBE25"
    assert pipeline.call_args.kwargs["retrieval_queries"] == [
        "forklift forks do not raise",
        "lift function not operating",
        "Toyota 8FBE25 mast does not lift",
    ]
