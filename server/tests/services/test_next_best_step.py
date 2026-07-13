import json
from types import SimpleNamespace

from app.services.next_best_step import (
    ActionMetadata,
    DiagnosticAction,
    FollowupDecision,
    build_followup_plan,
    calculate_score,
    extract_and_rank_actions,
    format_ranked_actions,
    is_supported_question,
    rank_actions,
)


def _action(action_id: str, **metadata) -> DiagnosticAction:
    defaults = {
        "effort_cost": 1,
        "time_cost": 1,
        "invasiveness": 1,
        "safety_risk": 1,
        "parts_cost": 0,
        "information_gain": 8,
        "resolution_probability": 5,
        "evidence_confidence": 9,
        "estimated_minutes": 5,
        "required_tools": [],
        "prerequisites": [],
    }
    defaults.update(metadata)
    return DiagnosticAction(
        id=action_id,
        title=action_id,
        instruction=f"Wykonaj {action_id}",
        expected_information="Wynik testu",
        source_fragment_numbers=[1],
        metadata=ActionMetadata(**defaults),
        score=None,
    )


def test_should_recognize_only_supported_error_code():
    assert is_supported_question("Co oznacza błąd 2:002?")
    assert is_supported_question("Kod 2.002 pojawił się przy rozruchu")
    assert not is_supported_question("Co oznacza błąd 2:004?")


def test_should_rank_informative_check_before_expensive_replacement():
    check = _action("check_parameters")
    replacement = _action(
        "replace_a5",
        effort_cost=9,
        time_cost=9,
        invasiveness=10,
        safety_risk=5,
        parts_cost=9,
        information_gain=2,
        resolution_probability=6,
        evidence_confidence=8,
        estimated_minutes=90,
    )

    ranked = rank_actions([replacement, check])

    assert [action.id for action in ranked] == ["check_parameters", "replace_a5"]
    assert ranked[0].score == calculate_score(check.metadata)


def test_should_format_ranked_plan_with_metadata_for_answer_llm():
    plan = format_ranked_actions(rank_actions([_action("check_parameters")]))

    assert "PLAN DIAGNOSTYCZNY NEXT BEST STEP DLA 2:002" in plan
    assert "1. check_parameters" in plan
    assert "informacja=8.0" in plan
    assert "Źródła: 1" in plan


async def test_should_extract_metadata_with_llm_and_rank_actions(mocker):
    payload = {
        "error_code": "2:002",
        "actions": [
            {
                **_action("replace_a5", effort_cost=9, information_gain=2).model_dump(),
                "score": None,
            },
            {
                **_action("check_parameters").model_dump(),
                "score": None,
            },
        ],
    }
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))]
    )
    mock_client = mocker.MagicMock()
    mock_client.chat.completions.create = mocker.AsyncMock(return_value=response)
    mocker.patch("app.services.next_best_step.AsyncOpenAI", return_value=mock_client)
    settings = SimpleNamespace(openai_api_key="test", openai_chat_model="test-model")

    actions = await extract_and_rank_actions(
        ["|2:002|Sprawdź parametry|", "|2:002|Wymień A5|"], settings
    )

    assert [action.id for action in actions] == ["check_parameters", "replace_a5"]
    call = mock_client.chat.completions.create.call_args.kwargs
    assert call["temperature"] == 0
    assert call["response_format"]["type"] == "json_schema"


async def test_should_remove_completed_action_and_rank_followup(mocker):
    check = _action("check_parameters")
    correct = _action(
        "correct_parameters",
        information_gain=5,
        resolution_probability=9,
        prerequisites=["Parametry zostały sprawdzone i są nieprawidłowe"],
    )
    replace = _action(
        "replace_a5",
        effort_cost=9,
        invasiveness=10,
        information_gain=2,
    )
    mocker.patch(
        "app.services.next_best_step.extract_and_rank_actions",
        new=mocker.AsyncMock(return_value=rank_actions([check, correct, replace])),
    )
    mocker.patch(
        "app.services.next_best_step.classify_followup",
        new=mocker.AsyncMock(
            return_value=FollowupDecision(
                is_action_result=True,
                observation_summary="Parametry są nieprawidłowe",
                completed_action_id="check_parameters",
                applicable_action_ids=["correct_parameters"],
                diagnostic_complete=False,
            )
        ),
    )

    is_result, plan = await build_followup_plan(
        ["Dokumentacja"],
        "Sprawdź parametry",
        "Jeden parametr jest zły",
        SimpleNamespace(openai_api_key="test", openai_chat_model="test"),
    )

    assert is_result
    assert "1. correct_parameters" in plan
    assert "check_parameters" not in plan
    assert "replace_a5" not in plan
    assert "Parametry są nieprawidłowe" in plan


async def test_should_not_capture_unrelated_message_as_diagnostic_result(mocker):
    mocker.patch(
        "app.services.next_best_step.extract_and_rank_actions",
        new=mocker.AsyncMock(return_value=[_action("check_parameters")]),
    )
    mocker.patch(
        "app.services.next_best_step.classify_followup",
        new=mocker.AsyncMock(
            return_value=FollowupDecision(
                is_action_result=False,
                observation_summary="",
                completed_action_id=None,
                applicable_action_ids=[],
                diagnostic_complete=False,
            )
        ),
    )

    is_result, plan = await build_followup_plan(
        ["Dokumentacja"],
        "Sprawdź parametry",
        "Jak wymienić koło?",
        SimpleNamespace(openai_api_key="test", openai_chat_model="test"),
    )

    assert not is_result
    assert plan == ""
