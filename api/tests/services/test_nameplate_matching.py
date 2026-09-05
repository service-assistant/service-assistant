import pytest

from app.services.nameplate.matching import (
    normalize_identifier,
    rank_device_candidates,
    select_automatic_family_match,
    select_automatic_match,
)
from tests.routers.factories import make_device


def test_normalize_identifier_removes_layout_separators():
    assert normalize_identifier(" FD-25 T / 1D1 ") == "FD25T1D1"


def test_ranking_matches_series_code_contained_in_ocr_model():
    devices = [
        make_device(id=1, name="1D", model_serial_code="1D"),
        make_device(id=2, name="1D1", model_serial_code="1D1"),
        make_device(id=3, name="D1", model_serial_code="D1"),
    ]

    candidates = rank_device_candidates(
        devices,
        model="XXX1D1XXX",
        raw_text="MODEL XXX1D1XXX",
    )

    assert [candidate.id for candidate in candidates] == [2, 1, 3]
    match = select_automatic_match(candidates)
    assert match is not None
    assert match.id == 2


def test_automatic_match_requires_unique_candidate_when_identifiers_are_equal():
    devices = [
        make_device(id=1, name="Series A", model_serial_code="1D1"),
        make_device(id=2, name="Series B", model_serial_code="1D1"),
    ]

    candidates = rank_device_candidates(
        devices,
        model="1D1",
        raw_text="MODEL 1D1",
    )

    assert select_automatic_match(candidates) is None


def test_ocr_character_confusion_is_a_candidate_but_requires_confirmation():
    candidates = rank_device_candidates(
        [make_device(id=1, name="8FBEO", model_serial_code="8FBEO")],
        model="8FBE0",
        raw_text="MODEL 8FBE0",
    )

    assert candidates[0].id == 1
    assert select_automatic_match(candidates) is None


@pytest.mark.parametrize(
    ("stored_codes", "recognized_code"),
    [
        ("1D1/1D2", "1D2"),
        ("1D1, 1D2", "1D2"),
    ],
)
def test_grouped_model_codes_are_matched_separately(stored_codes, recognized_code):
    candidates = rank_device_candidates(
        [make_device(id=1, name="Series 1D", model_serial_code=stored_codes)],
        model=recognized_code,
        raw_text=f"MODEL {recognized_code}",
    )

    assert len(candidates) == 1
    assert candidates[0].matched_identifier == recognized_code
    assert candidates[0].score == 1
    assert select_automatic_match(candidates) is not None


def test_single_uncertain_character_is_a_candidate_but_requires_confirmation():
    candidates = rank_device_candidates(
        [make_device(id=1, name="Series 1D1", model_serial_code="1D1")],
        model="1DN",
        raw_text="MODEL 1DN",
    )

    assert len(candidates) == 1
    assert candidates[0].matched_identifier == "1D1"
    assert candidates[0].score < 0.84
    assert select_automatic_match(candidates) is None


def test_uncertain_code_returns_each_similar_model_for_confirmation():
    candidates = rank_device_candidates(
        [
            make_device(id=1, name="Series 1D1", model_serial_code="1D1"),
            make_device(id=2, name="Series 1D2", model_serial_code="1D2"),
        ],
        model="1DN",
        raw_text="MODEL 1DN",
    )

    assert {candidate.matched_identifier for candidate in candidates} == {
        "1D1",
        "1D2",
    }
    assert select_automatic_match(candidates) is None


def test_incomplete_model_code_is_a_candidate_but_requires_confirmation():
    candidates = rank_device_candidates(
        [make_device(id=1, name="Series 1D", model_serial_code="1D1/1D2")],
        model="1D",
        raw_text="MODEL 1D",
    )

    assert len(candidates) == 1
    assert candidates[0].matched_identifier == "1D1"
    assert select_automatic_match(candidates) is None


def test_longer_scanned_code_automatically_matches_catalog_family_prefix():
    candidates = rank_device_candidates(
        [make_device(id=1, name="FGE family", model_serial_code="FGE")],
        model="FGE35E2",
        raw_text="MODEL FGE35E2",
    )

    match = select_automatic_family_match(candidates, model="FGE35E2")

    assert match is not None
    assert match.id == 1


def test_exact_scanned_code_still_requires_confirmation():
    candidates = rank_device_candidates(
        [
            make_device(
                id=1,
                name="7FBEF15-20",
                model_serial_code="7FBEF15-20",
            )
        ],
        model="7FBEF15-20",
        raw_text="MODEL 7FBEF15-20",
    )

    assert select_automatic_family_match(candidates, model="7FBEF15-20") is None
