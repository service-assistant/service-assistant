from app.services.nameplate_matching import (
    normalize_identifier,
    rank_device_candidates,
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
