import json
import logging
import re
from typing import Any, Final, cast

from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, Field

from ..config import Settings

logger = logging.getLogger(__name__)

SUPPORTED_ERROR_CODE: Final[str] = "2:002"
ERROR_CODE_RE = re.compile(r"(?<!\d)2[:.]002(?!\d)")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ActionMetadata(StrictModel):
    effort_cost: float = Field(ge=0, le=10)
    time_cost: float = Field(ge=0, le=10)
    invasiveness: float = Field(ge=0, le=10)
    safety_risk: float = Field(ge=0, le=10)
    parts_cost: float = Field(ge=0, le=10)
    information_gain: float = Field(ge=0, le=10)
    resolution_probability: float = Field(ge=0, le=10)
    evidence_confidence: float = Field(ge=0, le=10)
    estimated_minutes: int = Field(ge=0)
    required_tools: list[str]
    prerequisites: list[str]


class DiagnosticAction(StrictModel):
    id: str = Field(pattern=r"^[a-z0-9_]+$")
    title: str
    instruction: str
    expected_information: str
    source_fragment_numbers: list[int]
    metadata: ActionMetadata
    # The extractor returns null; the deterministic ranker always overwrites it.
    score: float | None


class DiagnosticActions(StrictModel):
    error_code: str
    actions: list[DiagnosticAction]


class FollowupDecision(StrictModel):
    is_action_result: bool
    observation_summary: str
    completed_action_id: str | None
    applicable_action_ids: list[str]
    diagnostic_complete: bool


EXTRACTION_PROMPT: Final[str] = """
Jesteś analitykiem procedur serwisowych. Na podstawie wyłącznie podanych fragmentów
dokumentacji wyodrębnij możliwe działania technika dotyczące kodu błędu 2:002.

Nie dopisuj działań z wiedzy własnej. Rozdziel sprawdzenie, korektę ustawień i wymianę
części na osobne działania, jeśli dokumentacja je wymienia. Scal tekst jednego wiersza
tabeli, nawet jeśli został rozdzielony pomiędzy fragmenty.

Oceń każdą metrykę w skali 0-10:
- effort_cost: wysiłek i trudność wykonania,
- time_cost: koszt czasu,
- invasiveness: ingerencja w urządzenie,
- safety_risk: ryzyko dla technika lub urządzenia,
- parts_cost: koszt części i materiałów,
- information_gain: jak mocno wynik zawęża możliwe przyczyny,
- resolution_probability: szansa, że działanie bezpośrednio rozwiąże błąd,
- evidence_confidence: pewność, że działanie rzeczywiście wynika z fragmentów.

estimated_minutes, required_tools i prerequisites również oszacuj na podstawie tekstu.
Jeżeli dokumentacja nie podaje czasu lub narzędzi, podaj ostrożne oszacowanie i pustą
listę narzędzi, zamiast wymyślać konkretny przyrząd. prerequisites opisują działania,
które powinny być wykonane wcześniej. source_fragment_numbers zawiera numery fragmentów
stanowiących podstawę działania. Identyfikatory zapisuj po angielsku jako snake_case.
Pole score ustaw na null; wynik jest obliczany później przez backend.
"""

FOLLOWUP_PROMPT: Final[str] = """
Jesteś kontrolerem stanu diagnostyki kodu 2:002. Oceń, czy nowa wiadomość technika
jest wynikiem ostatnio zleconej czynności. Może być napisana swobodnym językiem,
np. "są dobre", "jeden jest zły" albo "nie mogę ich odczytać".

Jeżeli to nie jest wynik czynności, ustaw is_action_result=false i nie interpretuj
wiadomości jako obserwacji. Jeżeli to wynik:
- wskaż id zakończonej akcji,
- krótko podsumuj obserwację,
- wybierz identyfikatory działań, które nadal mają zastosowanie po tym wyniku,
- nie uwzględniaj ponownie zakończonej akcji,
- nie dodawaj nowych działań i nie zmieniaj ich metadanych,
- ustaw diagnostic_complete=true tylko wtedy, gdy odpowiedź technika potwierdza,
  że problem został rozwiązany i nie potrzeba następnej czynności.

Wybieraj wyłącznie spośród przekazanych akcji i opieraj się na dokumentacji zawartej
w ich instrukcjach. Nie zakładaj uszkodzenia ani konieczności wymiany części bez
wyniku, który to uzasadnia.
"""


def is_supported_question(question: str) -> bool:
    return ERROR_CODE_RE.search(question) is not None


def calculate_score(metadata: ActionMetadata) -> float:
    """Decision utility: diagnostic benefit minus execution burden and risk."""
    benefit = (
        0.35 * metadata.information_gain
        + 0.25 * metadata.resolution_probability
        + 0.15 * metadata.evidence_confidence
    )
    burden = (
        0.10 * metadata.effort_cost
        + 0.06 * metadata.time_cost
        + 0.05 * metadata.invasiveness
        + 0.03 * metadata.safety_risk
        + 0.01 * metadata.parts_cost
        + 0.25 * min(len(metadata.prerequisites), 4)
    )
    return round(benefit - burden, 3)


def rank_actions(actions: list[DiagnosticAction]) -> list[DiagnosticAction]:
    ranked = [
        action.model_copy(update={"score": calculate_score(action.metadata)})
        for action in actions
    ]
    return sorted(
        ranked,
        key=lambda action: (
            -(action.score or 0),
            action.metadata.invasiveness,
            action.metadata.effort_cost,
        ),
    )


def _numbered_context(chunks: list[str], max_chars: int = 12000) -> str:
    parts: list[str] = []
    total = 0
    for index, chunk in enumerate(chunks, start=1):
        item = f"[Fragment {index}]\n{chunk.strip()}\n"
        if total + len(item) > max_chars:
            break
        parts.append(item)
        total += len(item)
    return "\n".join(parts)


async def extract_and_rank_actions(
    chunks: list[str], settings: Settings
) -> list[DiagnosticAction]:
    if not chunks:
        return []

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "diagnostic_actions",
            "strict": True,
            "schema": DiagnosticActions.model_json_schema(),
        },
    }
    response = await client.chat.completions.create(
        model=settings.openai_chat_model,
        temperature=0,
        messages=[
            {"role": "system", "content": EXTRACTION_PROMPT},
            {
                "role": "user",
                "content": (
                    "Fragmenty dokumentacji dla urządzenia:\n\n"
                    + _numbered_context(chunks)
                ),
            },
        ],
        response_format=cast(Any, response_format),
    )
    content = response.choices[0].message.content
    if not content:
        return []
    extracted = DiagnosticActions.model_validate(json.loads(content))
    if extracted.error_code.replace(".", ":") != SUPPORTED_ERROR_CODE:
        return []
    return rank_actions(extracted.actions)


async def classify_followup(
    actions: list[DiagnosticAction],
    previous_assistant_response: str,
    technician_response: str,
    settings: Settings,
) -> FollowupDecision:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "diagnostic_followup",
            "strict": True,
            "schema": FollowupDecision.model_json_schema(),
        },
    }
    action_data = [
        action.model_dump(exclude={"score"}, mode="json") for action in actions
    ]
    response = await client.chat.completions.create(
        model=settings.openai_chat_model,
        temperature=0,
        messages=[
            {"role": "system", "content": FOLLOWUP_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Ostatnia odpowiedź asystenta:\n{previous_assistant_response}\n\n"
                    f"Nowa wiadomość technika:\n{technician_response}\n\n"
                    f"Dostępne akcje:\n{json.dumps(action_data, ensure_ascii=False)}"
                ),
            },
        ],
        response_format=cast(Any, response_format),
    )
    content = response.choices[0].message.content
    if not content:
        return FollowupDecision(
            is_action_result=False,
            observation_summary="",
            completed_action_id=None,
            applicable_action_ids=[],
            diagnostic_complete=False,
        )
    return FollowupDecision.model_validate(json.loads(content))


def format_ranked_actions(
    actions: list[DiagnosticAction], observation_summary: str = ""
) -> str:
    if not actions:
        return ""

    lines = [
        "PLAN DIAGNOSTYCZNY NEXT BEST STEP DLA 2:002",
        "Akcje zostały posortowane deterministycznie według wartości diagnostycznej, kosztu i ryzyka.",
        "Technikowi pokaż teraz tylko akcję numer 1. Pozostałe są ukrytymi kandydatami na później.",
    ]
    if observation_summary:
        lines.append(f"Potwierdzona obserwacja technika: {observation_summary}")
    for index, action in enumerate(actions, start=1):
        m = action.metadata
        lines.extend(
            [
                f"{index}. {action.title} (score={action.score})",
                f"   Instrukcja: {action.instruction}",
                f"   Uzyskana informacja: {action.expected_information}",
                f"   Metadane 0-10: informacja={m.information_gain}, rozwiązanie={m.resolution_probability}, "
                f"pewność={m.evidence_confidence}, wysiłek={m.effort_cost}, czas={m.time_cost}, "
                f"inwazyjność={m.invasiveness}, ryzyko={m.safety_risk}, części={m.parts_cost}",
                f"   Szacowany czas: {m.estimated_minutes} min",
                f"   Wymagania wstępne: {', '.join(m.prerequisites) or 'brak'}",
                f"   Źródła: {', '.join(map(str, action.source_fragment_numbers))}",
            ]
        )
    return "\n".join(lines)


async def build_ranked_plan(chunks: list[str], settings: Settings) -> str:
    try:
        actions = await extract_and_rank_actions(chunks, settings)
        return format_ranked_actions(actions)
    except Exception:
        logger.exception("Could not build next-best-step plan for error 2:002")
        return ""


async def build_followup_plan(
    chunks: list[str],
    previous_assistant_response: str,
    technician_response: str,
    settings: Settings,
) -> tuple[bool, str]:
    """Return whether the message is an observation and the next ranked plan."""
    try:
        actions = await extract_and_rank_actions(chunks, settings)
        if not actions:
            return False, ""

        decision = await classify_followup(
            actions,
            previous_assistant_response,
            technician_response,
            settings,
        )
        if not decision.is_action_result:
            return False, ""
        if decision.diagnostic_complete:
            return True, (
                "WYNIK DIAGNOSTYKI 2:002\n"
                f"Potwierdzona obserwacja technika: {decision.observation_summary}\n"
                "Diagnostyka została zakończona; nie proponuj następnej akcji."
            )

        applicable_ids = set(decision.applicable_action_ids)
        remaining = [
            action
            for action in actions
            if action.id in applicable_ids
            and action.id != decision.completed_action_id
        ]
        if not remaining:
            return True, (
                "BRAK NASTĘPNEJ AKCJI DLA 2:002\n"
                f"Potwierdzona obserwacja technika: {decision.observation_summary}\n"
                "Dokumentacja nie uzasadnia żadnej następnej akcji."
            )
        return True, format_ranked_actions(
            rank_actions(remaining), decision.observation_summary
        )
    except Exception:
        logger.exception("Could not process next-best-step follow-up for error 2:002")
        return False, ""
