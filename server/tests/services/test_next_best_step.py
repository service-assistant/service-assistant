import json
from types import SimpleNamespace

from app.config import Settings
from app.services.next_best_step import (
    ActionMetadata,
    DiagnosticAction,
    DiagnosticPlan,
    DiagnosticPlanStatus,
    FollowupDecision,
    build_followup_plan,
    calculate_score,
    extract_and_rank_actions,
    explicitly_confirms_resolution,
    rank_actions,
)


def _settings() -> Settings:
    return Settings.model_construct(
        openai_api_key="test",
        openai_chat_model="test-model",
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
        source_fragment_numbers=[1],
        metadata=ActionMetadata(**defaults),
        score=None,
    )


def _plan(problem: str, actions: list[DiagnosticAction]) -> DiagnosticPlan:
    return DiagnosticPlan(
        status=DiagnosticPlanStatus.actions,
        problem=problem,
        actions=actions,
    )


def test_should_rank_informative_check_before_expensive_replacement():
    check = _action("check_parameters")
    replacement = _action(
        "replace_module",
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

    assert [action.id for action in ranked] == ["check_parameters", "replace_module"]
    assert ranked[0].score == calculate_score(check.metadata)


def test_should_require_explicit_problem_resolution_confirmation():
    assert explicitly_confirms_resolution("Błąd zniknął, wszystko działa")
    assert explicitly_confirms_resolution("Problem jest rozwiązany")
    assert not explicitly_confirms_resolution("Wynik pomiaru jest prawidłowy")
    assert not explicitly_confirms_resolution("Nadal nie działa")


def test_should_recognize_diagnostic_signals_without_polish_characters():
    from app.services.next_best_step import (
        reports_negative_result,
        reports_only_problem_status,
    )

    assert reports_only_problem_status("Wystepuje nadal")
    assert reports_only_problem_status("Blad nie zniknal")
    assert reports_negative_result("Wynik jest nieprawidlowy")


def test_should_represent_diagnostic_plan_as_structured_data():
    plan = DiagnosticPlan(
        status=DiagnosticPlanStatus.actions,
        problem="Błąd 2:004",
        actions=rank_actions([_action("check_parameters")]),
    )

    data = plan.model_dump(mode="json")
    assert data["status"] == "actions"
    assert data["problem"] == "Błąd 2:004"
    assert data["actions"][0]["id"] == "check_parameters"
    assert data["actions"][0]["metadata"]["information_gain"] == 8
    assert data["actions"][0]["source_fragment_numbers"] == [1]


def test_should_keep_all_candidates_in_ranked_json_order():
    first = _action("measure_resistance", information_gain=9)
    second = _action("inspect_connections", information_gain=7)
    third = _action("update_software", information_gain=2)

    plan = DiagnosticPlan(
        status=DiagnosticPlanStatus.actions,
        problem="Błąd 2:010",
        actions=rank_actions([third, second, first]),
    )

    assert [action.id for action in plan.actions] == [
        "measure_resistance",
        "inspect_connections",
        "update_software",
    ]


def test_should_expose_only_current_action_to_response_generator():
    plan = _plan(
        "Błąd 2:010",
        [_action("measure_resistance"), _action("replace_module")],
    )

    response_plan = plan.current_action_only()

    assert [action.id for action in response_plan.actions] == ["measure_resistance"]
    assert [action.id for action in plan.actions] == [
        "measure_resistance",
        "replace_module",
    ]


async def test_should_advance_to_full_next_action_when_technician_asks_what_next(
    mocker,
):
    measure = _action("measure_can_resistance", information_gain=9)
    inspect = _action("inspect_can_harness", information_gain=7)
    classify = mocker.patch("app.services.next_best_step.classify_followup")

    is_result, next_plan = await build_followup_plan(
        _plan("Błąd 2:010", [measure, inspect]),
        "Zmierz rezystancję magistrali CAN.",
        "Co dalej?",
        _settings(),
    )

    assert is_result
    assert next_plan is not None
    assert next_plan.status == DiagnosticPlanStatus.actions
    assert [action.id for action in next_plan.actions] == ["inspect_can_harness"]
    classify.assert_not_awaited()


async def test_should_extract_actions_for_dynamic_problem_and_rank_them(mocker):
    payload = {
        "actions": [
            {
                **_action(
                    "replace_module", effort_cost=9, information_gain=2
                ).model_dump(),
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

    actions = await extract_and_rank_actions(
        ["|2:004|Sprawdź parametry|", "|2:004|Wymień moduł|"],
        "Błąd 2:004",
        _settings(),
    )

    assert [action.id for action in actions] == [
        "check_parameters",
        "replace_module",
    ]
    call = mock_client.chat.completions.create.call_args.kwargs
    assert call["temperature"] == 0
    assert call["response_format"]["type"] == "json_schema"
    action_schema = call["response_format"]["json_schema"]["schema"]["$defs"][
        "DiagnosticAction"
    ]
    assert "expected_information" not in action_schema["properties"]
    assert "Błąd 2:004" in call["messages"][-1]["content"]
    extraction_prompt = call["messages"][0]["content"]
    assert "Jedna akcja ma opisywać jedno logiczne sprawdzenie" in extraction_prompt
    assert "Nie pomijaj wcześniejszego pomiaru" in extraction_prompt


async def test_should_remove_completed_action_and_rank_followup(mocker):
    check = _action("check_parameters")
    correct = _action(
        "correct_parameters",
        information_gain=5,
        resolution_probability=9,
        prerequisites=["Parametry zostały sprawdzone i są nieprawidłowe"],
    )
    replace = _action(
        "replace_module",
        effort_cost=9,
        invasiveness=10,
        information_gain=2,
    )
    mocker.patch(
        "app.services.next_best_step.classify_followup",
        new=mocker.AsyncMock(
            return_value=FollowupDecision(
                is_action_result=True,
                observation_summary="Parametry są nieprawidłowe",
                diagnostic_complete=False,
            )
        ),
    )

    is_result, plan = await build_followup_plan(
        _plan("Widły nie podnoszą się", rank_actions([check, correct, replace])),
        "Sprawdź parametry",
        "Jeden parametr jest zły",
        _settings(),
    )

    assert is_result
    assert plan is not None
    assert plan.problem == "Widły nie podnoszą się"
    assert [action.id for action in plan.actions] == [
        "correct_parameters",
        "replace_module",
    ]
    assert plan.observation_summary == "Parametry są nieprawidłowe"


async def test_should_not_capture_unrelated_message_as_diagnostic_result(mocker):
    check = _action("check_parameters")
    mocker.patch(
        "app.services.next_best_step.classify_followup",
        new=mocker.AsyncMock(
            return_value=FollowupDecision(
                is_action_result=False,
                observation_summary="",
                diagnostic_complete=False,
            )
        ),
    )

    is_result, plan = await build_followup_plan(
        _plan("Błąd E-23", [check]),
        "Sprawdź parametry",
        "Jak wymienić koło?",
        _settings(),
    )

    assert not is_result
    assert plan is None


async def test_should_advance_when_only_problem_status_is_reported(mocker):
    measurement = _action("measure_can_resistance").model_copy(
        update={"instruction": "Zmierz rezystancję między X41:3 i X41:4"}
    )
    inspect = _action("inspect_connections")
    classify = mocker.patch(
        "app.services.next_best_step.classify_followup",
        new=mocker.AsyncMock(
            return_value=FollowupDecision(
                is_action_result=False,
                observation_summary="",
                diagnostic_complete=False,
            )
        ),
    )

    is_result, plan = await build_followup_plan(
        _plan("Błąd 2:010", [measurement, inspect]),
        "Zmierz rezystancję między X41:3 i X41:4.",
        "Występuje nadal",
        _settings(),
    )

    assert is_result
    assert plan is not None
    assert plan.status == DiagnosticPlanStatus.actions
    assert plan.problem == "Błąd 2:010"
    assert [action.id for action in plan.actions] == ["inspect_connections"]
    classify.assert_not_awaited()


async def test_should_advance_on_generic_negative_result(mocker):
    measurement = _action("measure_can_resistance", information_gain=9)
    inspect = _action("inspect_connections", information_gain=7)
    classify = mocker.patch("app.services.next_best_step.classify_followup")

    is_result, plan = await build_followup_plan(
        _plan("Błąd 2:010", [measurement, inspect]),
        "Wykonaj measure_can_resistance",
        "Wynik jest nieprawidłowy",
        _settings(),
    )

    assert is_result
    assert plan is not None
    assert [action.id for action in plan.actions] == ["inspect_connections"]
    classify.assert_not_awaited()


async def test_should_not_repeat_last_action_for_generic_negative_result(mocker):
    measurement = _action("measure_can_resistance")
    mocker.patch(
        "app.services.next_best_step.classify_followup",
        new=mocker.AsyncMock(
            return_value=FollowupDecision(
                is_action_result=True,
                observation_summary="Wynik określony tylko jako nieprawidłowy",
                diagnostic_complete=False,
            )
        ),
    )

    is_result, plan = await build_followup_plan(
        _plan("Błąd 2:010", [measurement]),
        "Zmierz rezystancję magistrali CAN.",
        "Wynik jest nieprawidłowy.",
        _settings(),
    )

    assert is_result
    assert plan is not None
    assert plan.status == DiagnosticPlanStatus.no_next_action
    assert plan.problem == "Błąd 2:010"
    assert plan.actions == []


async def test_should_not_finish_diagnostic_on_normal_measurement_alone(mocker):
    measured = _action("measure_resistance")
    inspect = _action("inspect_connector", information_gain=7)
    mocker.patch(
        "app.services.next_best_step.classify_followup",
        new=mocker.AsyncMock(
            return_value=FollowupDecision(
                is_action_result=True,
                observation_summary="Rezystancja wynosi 60 omów",
                diagnostic_complete=True,
            )
        ),
    )

    is_result, plan = await build_followup_plan(
        _plan("Błąd 2:010", rank_actions([measured, inspect])),
        "Zmierz rezystancję.",
        "Wynik to 60 omów.",
        _settings(),
    )

    assert is_result
    assert plan is not None
    assert plan.status == DiagnosticPlanStatus.actions
    assert [action.id for action in plan.actions] == ["inspect_connector"]
