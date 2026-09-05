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
