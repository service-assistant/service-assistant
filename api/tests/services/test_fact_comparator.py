from app.services.chat.agent.fact_comparator import FactComparator


def test_should_normalize_symbol_separators_and_case():
    comparator = FactComparator()

    assert (
        comparator.compare_values(
            "machine_state",
            "Raised-Braked",
            "raised_braked",
        )
        == "match"
    )


def test_should_match_single_typo_within_values_for_one_fact():
    comparator = FactComparator(
        {"machine_state": ["raised_braked", "lowered_released"]}
    )

    assert (
        comparator.compare_values(
            "machine_state",
            "raised_braked",
            "raised_b braked",
        )
        == "match"
    )


def test_should_not_fuzzily_match_an_exact_alternative_value():
    comparator = FactComparator({"machine_state": ["travel_braked", "travel_brakes"]})

    assert (
        comparator.compare_values(
            "machine_state",
            "travel_brakes",
            "travel_braked",
        )
        == "mismatch"
    )


def test_should_return_indeterminate_for_ambiguous_typo():
    comparator = FactComparator({"machine_state": ["travel_braked", "travel_brakes"]})

    assert (
        comparator.compare_values(
            "machine_state",
            "travel_brake",
            "travel_braked",
        )
        == "indeterminate"
    )


def test_should_not_compare_values_with_incompatible_types_as_conflict():
    comparator = FactComparator()

    assert comparator.compare_values("switch_state", True, "true") == "indeterminate"
    assert (
        comparator.compare_condition("pressure", "high", "gte", 10) == "indeterminate"
    )
