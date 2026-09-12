import re
import unicodedata
from collections.abc import Iterable, Mapping
from typing import Literal

from .models import FactValue

ComparisonResult = Literal["match", "mismatch", "indeterminate"]

_SYMBOLIC_VALUE_PATTERN = re.compile(r"^[a-z][a-z0-9 _-]*$", re.IGNORECASE)
_SYMBOL_SEPARATOR_PATTERN = re.compile(r"[\s_-]+")


def normalized_text(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).strip().casefold()


def _normalized_symbol(value: str) -> str | None:
    normalized = normalized_text(value)
    if not _SYMBOLIC_VALUE_PATTERN.fullmatch(normalized):
        return None
    return _SYMBOL_SEPARATOR_PATTERN.sub("", normalized)


def _within_one_edit(left: str, right: str) -> bool:
    """Return true for one insertion, deletion, replacement, or transposition."""
    if left == right:
        return True
    if abs(len(left) - len(right)) > 1:
        return False

    if len(left) == len(right):
        differences = [
            index for index, pair in enumerate(zip(left, right)) if pair[0] != pair[1]
        ]
        if len(differences) == 1:
            return True
        return (
            len(differences) == 2
            and differences[1] == differences[0] + 1
            and left[differences[0]] == right[differences[1]]
            and left[differences[1]] == right[differences[0]]
        )

    shorter, longer = (left, right) if len(left) < len(right) else (right, left)
    short_index = 0
    long_index = 0
    skipped = False
    while short_index < len(shorter) and long_index < len(longer):
        if shorter[short_index] == longer[long_index]:
            short_index += 1
            long_index += 1
            continue
        if skipped:
            return False
        skipped = True
        long_index += 1
    return True


def _resolve_symbol(
    value: str,
    allowed_symbols: set[str],
) -> tuple[str | None, bool]:
    if value in allowed_symbols:
        return value, False
    nearby_symbols = {
        symbol for symbol in allowed_symbols if _within_one_edit(value, symbol)
    }
    if len(nearby_symbols) == 1:
        return nearby_symbols.pop(), False
    if len(nearby_symbols) > 1:
        return None, True
    return value, False


class FactComparator:
    """Compare typed facts, using fuzzy matching only inside one fact's value set."""

    def __init__(
        self,
        allowed_values_by_fact: Mapping[str, Iterable[FactValue]] | None = None,
    ) -> None:
        self._allowed_values_by_fact = {
            fact_key: tuple(values)
            for fact_key, values in (allowed_values_by_fact or {}).items()
        }

    def compare_values(
        self,
        fact_key: str,
        actual: FactValue,
        expected: FactValue | None,
    ) -> ComparisonResult:
        if expected is None:
            return "match" if actual is None else "mismatch"
        if isinstance(actual, bool) or isinstance(expected, bool):
            if type(actual) is not type(expected):
                return "indeterminate"
            return "match" if actual == expected else "mismatch"
        if isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
            return "match" if float(actual) == float(expected) else "mismatch"
        if not isinstance(actual, str) or not isinstance(expected, str):
            return "indeterminate"

        if normalized_text(actual) == normalized_text(expected):
            return "match"

        actual_symbol = _normalized_symbol(actual)
        expected_symbol = _normalized_symbol(expected)
        if actual_symbol is None or expected_symbol is None:
            return "mismatch"
        if actual_symbol == expected_symbol:
            return "match"
        if min(len(actual_symbol), len(expected_symbol)) < 5:
            return "mismatch"

        allowed_symbols = {
            symbol
            for value in self._allowed_values_by_fact.get(fact_key, ())
            if isinstance(value, str)
            and (symbol := _normalized_symbol(value)) is not None
        }
        if not allowed_symbols:
            allowed_symbols.add(expected_symbol)
        resolved_actual, actual_is_ambiguous = _resolve_symbol(
            actual_symbol, allowed_symbols
        )
        resolved_expected, expected_is_ambiguous = _resolve_symbol(
            expected_symbol, allowed_symbols
        )
        if actual_is_ambiguous or expected_is_ambiguous:
            return "indeterminate"
        return "match" if resolved_actual == resolved_expected else "mismatch"

    def compare_condition(
        self,
        fact_key: str,
        actual: FactValue,
        operator: str,
        expected: FactValue | None,
    ) -> ComparisonResult:
        if operator == "present":
            return "match"
        if operator in {"eq", "neq"}:
            equality = self.compare_values(fact_key, actual, expected)
            if operator == "eq" or equality == "indeterminate":
                return equality
            return "match" if equality == "mismatch" else "mismatch"
        if (
            isinstance(actual, bool)
            or isinstance(expected, bool)
            or not isinstance(actual, (int, float))
            or not isinstance(expected, (int, float))
        ):
            return "indeterminate"

        actual_number = float(actual)
        expected_number = float(expected)
        comparisons = {
            "gt": actual_number > expected_number,
            "gte": actual_number >= expected_number,
            "lt": actual_number < expected_number,
            "lte": actual_number <= expected_number,
        }
        result = comparisons.get(operator)
        if result is None:
            return "indeterminate"
        return "match" if result else "mismatch"
