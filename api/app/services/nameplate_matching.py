import re
import unicodedata
from collections.abc import Iterable

from app.models import Device
from app.schemas import NameplateDeviceCandidate


_SEPARATOR_PATTERN = re.compile(r"[^A-Z0-9]+")
_MODEL_CODE_SEPARATOR_PATTERN = re.compile(r"[,/]+")
_MODEL_TOKEN_PATTERN = re.compile(r"[A-Z0-9]*\d[A-Z0-9]*")
_OCR_CONFUSIONS = str.maketrans({"O": "0", "I": "1", "L": "1"})


def normalize_identifier(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(
        character for character in normalized if not unicodedata.combining(character)
    )
    return _SEPARATOR_PATTERN.sub("", ascii_value.upper())


def _device_identifiers(device: Device) -> list[str]:
    values: list[str] = []
    if device.model_serial_code:
        values.extend(
            identifier.strip()
            for identifier in _MODEL_CODE_SEPARATOR_PATTERN.split(
                device.model_serial_code
            )
            if identifier.strip()
        )
    else:
        values.append(device.name)
        values.extend(_MODEL_TOKEN_PATTERN.findall(device.name.upper()))

    unique: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = normalize_identifier(value)
        if len(normalized) < 2 or normalized in seen:
            continue
        seen.add(normalized)
        unique.append(value)
    return unique


def _is_at_most_one_edit_apart(left: str, right: str) -> bool:
    if abs(len(left) - len(right)) > 1:
        return False
    if len(left) > len(right):
        left, right = right, left

    left_index = 0
    right_index = 0
    differences = 0
    while left_index < len(left) and right_index < len(right):
        if left[left_index] == right[right_index]:
            left_index += 1
            right_index += 1
            continue

        differences += 1
        if differences > 1:
            return False
        if len(left) == len(right):
            left_index += 1
        right_index += 1

    return differences + (len(right) - right_index) <= 1


def _has_single_edit_model_match(identifier: str, model: str) -> bool:
    if len(identifier) < 3 or len(model) < 2:
        return False

    minimum_window = max(2, len(identifier) - 1)
    maximum_window = min(len(model), len(identifier) + 1)
    for window_length in range(minimum_window, maximum_window + 1):
        for start in range(len(model) - window_length + 1):
            if _is_at_most_one_edit_apart(
                identifier,
                model[start : start + window_length],
            ):
                return True
    return False


def _identifier_score(
    identifier: str,
    normalized_model: str,
    normalized_raw_text: str,
) -> float:
    normalized_identifier = normalize_identifier(identifier)
    length_bonus = min(len(normalized_identifier), 20) * 0.004

    if normalized_identifier == normalized_model:
        return 1.0
    if normalized_identifier in normalized_model:
        return min(0.96, 0.86 + length_bonus)
    if len(normalized_model) >= 3 and normalized_model in normalized_identifier:
        return min(0.9, 0.8 + min(len(normalized_model), 20) * 0.004)
    if normalized_identifier in normalized_raw_text:
        return min(0.84, 0.7 + length_bonus)

    confused_identifier = normalized_identifier.translate(_OCR_CONFUSIONS)
    confused_model = normalized_model.translate(_OCR_CONFUSIONS)
    confused_raw_text = normalized_raw_text.translate(_OCR_CONFUSIONS)
    if confused_identifier == confused_model:
        return 0.82
    if confused_identifier in confused_model:
        return min(0.81, 0.75 + length_bonus)
    if confused_identifier in confused_raw_text:
        return min(0.76, 0.68 + length_bonus)
    if _has_single_edit_model_match(normalized_identifier, normalized_model):
        return min(0.8, 0.77 + length_bonus)
    return 0


def rank_device_candidates(
    devices: Iterable[Device],
    *,
    model: str,
    raw_text: str,
    limit: int = 3,
) -> list[NameplateDeviceCandidate]:
    normalized_model = normalize_identifier(model)
    normalized_raw_text = normalize_identifier(raw_text)
    candidates: list[NameplateDeviceCandidate] = []

    for device in devices:
        scored_identifiers = [
            (
                _identifier_score(identifier, normalized_model, normalized_raw_text),
                len(normalize_identifier(identifier)),
                identifier,
            )
            for identifier in _device_identifiers(device)
        ]
        best_score, _, best_identifier = max(
            scored_identifiers,
            key=lambda scored_identifier: scored_identifier[:2],
            default=(0.0, 0, ""),
        )
        if best_score <= 0:
            continue
        candidates.append(
            NameplateDeviceCandidate(
                id=device.id,
                name=device.name,
                model_serial_code=device.model_serial_code,
                score=round(best_score, 3),
                matched_identifier=best_identifier,
            )
        )

    candidates.sort(
        key=lambda candidate: (
            candidate.score,
            len(normalize_identifier(candidate.matched_identifier)),
        ),
        reverse=True,
    )
    return candidates[:limit]


def select_automatic_match(
    candidates: list[NameplateDeviceCandidate],
    *,
    minimum_score: float = 0.84,
    minimum_margin: float = 0.035,
) -> NameplateDeviceCandidate | None:
    if not candidates or candidates[0].score < minimum_score:
        return None
    if (
        len(candidates) > 1
        and candidates[0].score - candidates[1].score < minimum_margin
    ):
        first_identifier = normalize_identifier(candidates[0].matched_identifier)
        second_identifier = normalize_identifier(candidates[1].matched_identifier)
        if not (
            len(first_identifier) > len(second_identifier)
            and second_identifier in first_identifier
        ):
            return None
    return candidates[0]


def select_automatic_family_match(
    candidates: list[NameplateDeviceCandidate],
    *,
    model: str,
) -> NameplateDeviceCandidate | None:
    candidate = select_automatic_match(candidates)
    if candidate is None:
        return None

    normalized_model = normalize_identifier(model)
    normalized_identifier = normalize_identifier(candidate.matched_identifier)
    if (
        len(normalized_identifier) >= 3
        and len(normalized_model) > len(normalized_identifier)
        and normalized_model.startswith(normalized_identifier)
    ):
        return candidate
    return None
