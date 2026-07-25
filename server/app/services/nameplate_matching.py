import re
import unicodedata
from collections.abc import Iterable

from app.models import Device
from app.schemas import NameplateDeviceCandidate


_SEPARATOR_PATTERN = re.compile(r"[^A-Z0-9]+")
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
        values.append(device.model_serial_code)
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
