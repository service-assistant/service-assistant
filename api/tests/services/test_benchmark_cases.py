from app.benchmarks.dataset import load_benchmark_dataset
from app.schemas import ChatMode


def test_fault_2002_case_should_preserve_input_and_expected_normalization():
    dataset = load_benchmark_dataset()
    case = next(item for item in dataset.cases if item.id == "fault_2002_without_colon")

    assert case.question == "mam błąd 2002"
    assert case.canonical_fault_code == "2:002"
    assert case.expected_route == "standard_query"
    assert case.mode == ChatMode.standard
    assert len(case.required_behaviors) == 1
    assert "nie zadaje pytania doprecyzowującego" in case.required_behaviors[0]
    assert "natychmiast wymienić A5" in case.forbidden_claims[0]
    assert case.source.filename == "LPE200 - nowy model - kody błędów.pdf"


def test_fault_2504_case_should_use_standard_mode_and_full_reference_criteria():
    dataset = load_benchmark_dataset()
    case = next(item for item in dataset.cases if item.id == "fault_2504_without_colon")

    assert case.question == "mam blad 2504"
    assert case.canonical_fault_code == "2:504"
    assert case.expected_route == "standard_query"
    assert case.mode == ChatMode.standard
    assert len(case.required_facts) == 8
    assert len(case.required_behaviors) == 1
    assert "nie zadaje pytania doprecyzowującego" in case.required_behaviors[0]
    assert any("16,0 V" in fact for fact in case.required_facts)
    assert any("+XX" in claim for claim in case.forbidden_claims)
    assert case.source.locator == "wiersz tabeli dla kodu 2:504"


def test_battery_replacement_case_should_cover_full_safety_procedure():
    dataset = load_benchmark_dataset()
    case = next(
        item for item in dataset.cases if item.id == "battery_replacement_procedure"
    )

    assert case.question == "jak wymienić akumulator?"
    assert case.category == "maintenance_procedure"
    assert case.canonical_fault_code is None
    assert case.expected_route == "standard_query"
    assert case.mode == ChatMode.standard
    assert len(case.required_facts) == 10
    assert any("taką samą masę" in fact for fact in case.required_facts)
    assert any("zatwierdzonego urządzenia" in claim for claim in case.forbidden_claims)
    assert case.source.filename == (
        "LPE200, LPE220, LPE250 - podręcznik operatora PL.pdf"
    )
    assert case.source.locator == "rozdział 8.1.4 „Wymiana akumulatora”"


def test_pre_operation_case_should_cover_checks_before_and_after_power_on():
    dataset = load_benchmark_dataset()
    case = next(item for item in dataset.cases if item.id == "pre_operation_inspection")

    assert case.question == "co powinienem sprawdzić przed rozpoczęciem pracy wózkiem?"
    assert case.category == "general_operation"
    assert case.canonical_fault_code is None
    assert case.expected_route == "standard_query"
    assert case.mode == ChatMode.standard
    assert len(case.required_facts) == 10
    assert any("początku każdego dnia" in fact for fact in case.required_facts)
    assert any("dużą prędkością" in claim for claim in case.forbidden_claims)
    assert case.source.filename == (
        "LPE200, LPE220, LPE250 - podręcznik operatora PL.pdf"
    )
    assert "7.1.2" in case.source.locator


def test_forks_not_lifting_case_should_require_clarifying_questions():
    dataset = load_benchmark_dataset()
    case = next(
        item for item in dataset.cases if item.id == "forks_not_lifting_low_battery"
    )

    assert case.question == "widły się nie podnoszą"
    assert case.category == "symptom_troubleshooting"
    assert case.canonical_fault_code is None
    assert case.expected_route == "standard_query"
    assert case.mode == ChatMode.standard
    assert len(case.required_facts) == 1
    assert "nie pozwala jeszcze wskazać jednej przyczyny" in case.required_facts[0]
    assert len(case.required_behaviors) == 2
    assert any("co dokładnie oznacza" in item for item in case.required_behaviors)
    assert any("poziom naładowania" in item for item in case.required_behaviors)
    assert any("hydrauliki lub pompy" in claim for claim in case.forbidden_claims)
    assert "widły w ogóle nie reagują" in case.reference_answer
    assert "czy słychać pracę pompy" in case.reference_answer
    assert case.source.filename == (
        "LPE200, LPE220, LPE250 - podręcznik operatora PL.pdf"
    )
    assert "6.3" in case.source.locator
    assert "7.6.5" in case.source.locator
    assert "kody błędów.pdf" in case.source.locator


def test_click_2_creep_case_should_use_agent_mode_for_indirect_description():
    dataset = load_benchmark_dataset()
    case = next(
        item for item in dataset.cases if item.id == "click_2_creep_colloquial_controls"
    )

    assert case.mode == ChatMode.agent
    assert case.category == "diagnostic_resolution"
    assert case.expected_route == "standard_query"
    assert case.canonical_fault_code is None
    assert len(case.required_facts) == 1
    assert any("Click-2-Creep" in fact for fact in case.required_facts)
    assert case.agent_goal is not None
    assert case.agent_goal.required_evidence_fact_keys == ["display_message"]
    assert case.agent_goal.min_primary_actions == 1
    assert case.agent_goal.max_primary_actions == 1
    assert case.simulation_facts["shock_sensor_stopped_truck"].value is False
    assert (
        "shock_sensor_stop"
        in case.simulation_facts["shock_sensor_stopped_truck"].aliases
    )
    assert any("dokładnie jedną" in behavior for behavior in case.required_behaviors)
    assert case.source.filename == (
        "LPE200, LPE220, LPE250 - podręcznik operatora PL.pdf"
    )
    assert "7.6.3" in case.source.locator


def test_click_2_creep_standard_case_should_remain_a_direct_answer_control():
    dataset = load_benchmark_dataset()
    standard = next(
        item
        for item in dataset.cases
        if item.id == "click_2_creep_colloquial_controls_standard"
    )
    agent = next(
        item for item in dataset.cases if item.id == "click_2_creep_colloquial_controls"
    )

    assert standard.mode == ChatMode.standard
    assert standard.question == agent.question
    assert len(standard.required_facts) > len(agent.required_facts)
    assert standard.agent_goal is None
    assert agent.agent_goal is not None
    assert standard.source == agent.source
    assert standard.simulation_facts == {}


def test_click_2_creep_counterfactual_should_reject_a_lucky_fix():
    case = next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_without_slo_counterfactual"
    )

    assert case.question == next(
        item.question
        for item in load_benchmark_dataset().cases
        if item.id == "click_2_creep_colloquial_controls"
    )
    assert case.simulation_facts["display_message"].value == "BRAK"
    assert case.simulation_facts["click_2_creep_active"].value is False
    assert case.agent_goal is not None
    assert case.agent_goal.required_evidence_fact_keys == ["display_message"]
    assert case.agent_goal.min_primary_actions == 0
    assert case.agent_goal.max_primary_actions == 0
    assert case.simulation_facts["shock_sensor_stopped_truck"].value is False


def test_platform_sensor_case_should_use_agent_mode_and_reject_heat_diagnosis():
    dataset = load_benchmark_dataset()
    case = next(
        item for item in dataset.cases if item.id == "platform_sensor_creep_after_break"
    )

    assert case.mode == ChatMode.agent
    assert case.category == "indirect_symptom"
    assert case.expected_route == "standard_query"
    assert case.canonical_fault_code == "2:282"
    assert len(case.required_facts) == 4
    assert any("ponad 5 minut" in fact for fact in case.required_facts)
    assert any("podnieść i opuścić platformę" in fact for fact in case.required_facts)
    assert any("5:135 lub 5:326" in claim for claim in case.forbidden_claims)
    assert any("przegrzanie" in claim for claim in case.forbidden_claims)
    assert case.source.filename == (
        "LPE200, LPE220, LPE250 - podręcznik operatora PL.pdf"
    )
    assert case.source.page == 70
    assert "2:282" in case.source.locator


def test_charger_plug_case_should_use_agent_mode_for_indirect_description():
    dataset = load_benchmark_dataset()
    case = next(
        item
        for item in dataset.cases
        if item.id == "charger_plug_left_outside_sensor_holder"
    )

    assert case.mode == ChatMode.agent
    assert case.category == "indirect_symptom"
    assert case.expected_route == "standard_query"
    assert case.canonical_fault_code is None
    assert len(case.required_facts) == 4
    assert any("wsporniku czujnika" in fact for fact in case.required_facts)
    assert any("komunikat Plug" in fact for fact in case.required_facts)
    assert any("uszkodzony akumulator" in claim for claim in case.forbidden_claims)
    assert case.source.filename == (
        "LPE200, LPE220, LPE250 - podręcznik operatora PL.pdf"
    )
    assert case.source.page == 28
    assert "Plug" in case.source.locator


def test_every_agent_case_should_define_structured_simulation_facts():
    dataset = load_benchmark_dataset()
    agent_cases = [case for case in dataset.cases if case.mode == ChatMode.agent]

    assert agent_cases
    assert all(case.simulation_facts for case in agent_cases)
    assert all(
        fact.technician_reply
        for case in agent_cases
        for fact in case.simulation_facts.values()
    )
    assert all(
        not fact.technician_reply.casefold().startswith(("tak,", "nie,"))
        for case in agent_cases
        for fact in case.simulation_facts.values()
    )


def test_every_agent_case_should_define_source_grounded_assumptions():
    agent_cases = [
        case for case in load_benchmark_dataset().cases if case.mode == ChatMode.agent
    ]

    assert all(case.assumptions for case in agent_cases)
    assert all(
        assumption.source_page > 0
        and assumption.source_locator
        and assumption.statement
        for case in agent_cases
        for assumption in case.assumptions
    )
    assumptions = {
        case.id: {assumption.key for assumption in case.assumptions}
        for case in agent_cases
    }
    assert (
        "click_2_creep_still_active" in assumptions["click_2_creep_colloquial_controls"]
    )
    assert "fault_2_282_applies" in assumptions["platform_sensor_creep_after_break"]
    assert (
        "plug_sensor_feature_available"
        in assumptions["charger_plug_left_outside_sensor_holder"]
    )


def test_agent_simulation_facts_should_cover_expected_scenario_outcomes():
    dataset = load_benchmark_dataset()
    cases = {case.id: case for case in dataset.cases}

    click = cases["click_2_creep_colloquial_controls"].simulation_facts
    assert click["control_arm_position"].value == "raised_braked"
    assert click["display_message"].value == "SLO"
    assert click["travel_control_lever_opposite_direction"].value is False
    assert click["low_speed_button_option_fitted"].value is False
    assert click["low_speed_button_pressed_once"].value is False
    assert click["travel_control_lever_released"].value is True
    assert click["normal_operation_restored"].value is False

    platform = cases["platform_sensor_creep_after_break"].simulation_facts
    assert platform["platform_sensor_active_duration_minutes"].value == 10
    assert platform["display_fault_code"].value == "2:282"

    charger = cases["charger_plug_left_outside_sensor_holder"].simulation_facts
    assert charger["charger_plug_in_sensor_holder"].value is False
    assert charger["display_message"].value == "Plug"
