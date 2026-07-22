import json
import logging
import re
import unicodedata
from collections import OrderedDict
from enum import Enum
from typing import Any, Final, cast

from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, Field

from ..config import Settings

logger = logging.getLogger(__name__)

_DIAGNOSTIC_PLAN_CACHE_LIMIT: Final[int] = 1000
_diagnostic_plan_cache: OrderedDict[str, "DiagnosticPlan"] = OrderedDict()

POLISH_ASCII_TRANSLATION: Final[dict[int, int]] = str.maketrans(
    "ąćęłńóśźż", "acelnoszz"
)

RESOLUTION_CONFIRMATION_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:problem (?:jest )?rozwiazany|blad zniknal|usterka (?:zostala )?usunieta|"
    r"dziala prawidlowo|naprawione)\b",
    re.IGNORECASE,
)
PROBLEM_STATUS_ONLY_RE: Final[re.Pattern[str]] = re.compile(
    r"^\s*(?:"
    r"(?:blad|problem)?\s*(?:nadal|dalej|wciaz)\s*(?:wystepuje|nie dziala)?|"
    r"wystepuje\s*(?:nadal|dalej|wciaz)|"
    r"bez zmian|"
    r"(?:blad|problem)\s*(?:nie zniknal|nie ustapil)"
    r")\s*[.!]?\s*$",
    re.IGNORECASE,
)
NEGATIVE_RESULT_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:wynik\s+(?:jest\s+)?nieprawidlowy|nieprawidlowy\s+wynik|poza\s+zakresem|"
    r"wartosc\s+(?:jest\s+)?(?:zla|nieprawidlowa)|wynik\s+(?:jest\s+)?zly)\b",
    re.IGNORECASE,
)
NEXT_ACTION_REQUEST_RE: Final[re.Pattern[str]] = re.compile(
    r"^\s*(?:co\s+dalej|dalej|nast[eę]pny\s+krok|poka[zż]\s+nast[eę]pny\s+krok)\s*[?!.]*\s*$",
    re.IGNORECASE,
)


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
    source_fragment_numbers: list[int]
    metadata: ActionMetadata
    # The extractor returns null; the deterministic ranker always overwrites it.
    score: float | None


class DiagnosticActions(StrictModel):
    actions: list[DiagnosticAction]


class DiagnosticPlanStatus(str, Enum):
    actions = "actions"
    complete = "complete"
    no_next_action = "no_next_action"


class DiagnosticPlan(StrictModel):
    status: DiagnosticPlanStatus
    problem: str
    actions: list[DiagnosticAction] = Field(default_factory=list)
    observation_summary: str = ""
    technician_response: str = ""
    completed_action_id: str | None = None

    def current_action_only(self) -> "DiagnosticPlan":
        return self.model_copy(update={"actions": self.actions[:1]})

    def has_next_action(self) -> bool:
        return self.status == DiagnosticPlanStatus.actions and len(self.actions) > 1


class FollowupDecision(StrictModel):
    is_action_result: bool
    observation_summary: str
    diagnostic_complete: bool


def cache_diagnostic_plan(key: str, plan: DiagnosticPlan) -> None:
    _diagnostic_plan_cache[key] = plan
    _diagnostic_plan_cache.move_to_end(key)
    while len(_diagnostic_plan_cache) > _DIAGNOSTIC_PLAN_CACHE_LIMIT:
        _diagnostic_plan_cache.popitem(last=False)


def get_cached_diagnostic_plan(key: str) -> DiagnosticPlan | None:
    plan = _diagnostic_plan_cache.get(key)
    if plan is not None:
        _diagnostic_plan_cache.move_to_end(key)
    return plan


EXTRACTION_PROMPT: Final[str] = """
Jesteś analitykiem procedur serwisowych. Na podstawie wyłącznie podanych fragmentów
dokumentacji wyodrębnij możliwe działania technika dotyczące problemu wskazanego przez
użytkownika. Problem może być kodem błędu, usterką albo opisem objawu.

Nie dopisuj działań z wiedzy własnej. Pomiń działania niezwiązane z problemem.
Rozdziel sprawdzenie, korektę ustawień i wymianę części na osobne działania, jeżeli
dokumentacja je wymienia. Scal tekst jednego wiersza tabeli, nawet jeśli został
rozdzielony pomiędzy fragmenty.

Jedna akcja ma opisywać jedno logiczne sprawdzenie diagnostyczne dające jeden wynik
technika. Może zawierać kilka ściśle powiązanych czynności dotyczących tego samego
elementu, jeżeli razem potwierdzają jeden stan. Nie rozbijaj osobno przygotowania,
oględzin i pomiaru należących do tej samej kontroli. Nie twórz jednak zbiorczej akcji
typu "sprawdź magistralę CAN", jeżeli dokumentacja wymienia pod nią niezależne kontrole.
Dla przykładu rozdziel:
- pomiar rezystancji między X41:3 i X41:4 wraz z zakresem 54–66 omów jako jedną akcję,
- kontrolę przecięcia wiązki oraz powiązany pomiar między podwoziem a stykiem CAN
  z granicą 24 kiloomów jako drugą, wspólną akcję,
- odłączanie i ponowne podłączanie modułów opcjonalnych jako kolejną akcję.
Nie pomijaj wcześniejszego pomiaru tylko dlatego, że późniejszy fragment zawiera kolejną
kontrolę. Jeżeli następna akcja powinna nastąpić po poprzedniej, wpisz id poprzedniej
akcji w prerequisites.

Nie twórz kilku równoważnych działań sprawdzających ten sam element w ten sam sposób.
Wszystkie wartości, zakresy i jednostki potrzebne do wykonania czynności umieść bezpośrednio
w polu instruction. Nie twórz osobnego pola opisującego oczekiwaną odpowiedź technika.

Oceń każdą metrykę w skali 0-10:
- effort_cost: wysiłek i trudność wykonania,
- time_cost: koszt czasu,
- invasiveness: ingerencja w urządzenie,
- safety_risk: ryzyko dla technika lub urządzenia,
- parts_cost: koszt części i materiałów,
- information_gain: jak mocno wynik zawęża możliwe przyczyny,
- resolution_probability: szansa, że działanie bezpośrednio rozwiąże problem,
- evidence_confidence: pewność, że działanie rzeczywiście wynika z fragmentów.

estimated_minutes, required_tools i prerequisites również oszacuj na podstawie tekstu.
Jeżeli dokumentacja nie podaje czasu lub narzędzi, podaj ostrożne oszacowanie i pustą
listę narzędzi, zamiast wymyślać konkretny przyrząd. prerequisites opisują działania,
które powinny być wykonane wcześniej. source_fragment_numbers zawiera numery fragmentów
stanowiących podstawę działania. Identyfikatory zapisuj po angielsku jako snake_case.
Pole score ustaw na null; wynik jest obliczany później przez backend.
"""

FOLLOWUP_PROMPT: Final[str] = """
Jesteś kontrolerem stanu diagnostyki wskazanego problemu. Oceń, czy nowa wiadomość
technika dotyczy ostatnio zleconej czynności albo informuje o stanie problemu. Może być
napisana swobodnym językiem, np. "zrobione", "jest dobrze", "jeden jest zły", "bez zmian"
albo "nie mogę tego sprawdzić".

Nie wymagaj konkretnej wartości, jednostki, formatu ani szczegółowego opisu obserwacji.
Nie zadawaj pytań uzupełniających. Jeśli wiadomość odnosi się do wykonania, wyniku,
niemożności wykonania lub dalszego występowania problemu, ustaw is_action_result=true,
krótko podsumuj przekazaną informację i pozwól przejść do kolejnej akcji.

Jeżeli wiadomość nie dotyczy bieżącej czynności ani stanu diagnozowanego problemu, ustaw
is_action_result=false i nie interpretuj jej jako obserwacji.

Ustaw diagnostic_complete=true tylko wtedy, gdy technik wprost potwierdza, że błąd zniknął,
problem został rozwiązany albo urządzenie działa prawidłowo. Prawidłowy wynik pojedynczego
testu nie oznacza zakończenia diagnostyki.
"""


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


def explicitly_confirms_resolution(message: str) -> bool:
    return RESOLUTION_CONFIRMATION_RE.search(_fold_text(message)) is not None


def _fold_text(message: str) -> str:
    normalized = unicodedata.normalize(
        "NFKD", message.casefold().translate(POLISH_ASCII_TRANSLATION)
    )
    return "".join(
        character for character in normalized if not unicodedata.combining(character)
    )


def reports_only_problem_status(message: str) -> bool:
    return PROBLEM_STATUS_ONLY_RE.search(_fold_text(message)) is not None


def reports_negative_result(message: str) -> bool:
    return NEGATIVE_RESULT_RE.search(_fold_text(message)) is not None


def requests_next_action(message: str) -> bool:
    return NEXT_ACTION_REQUEST_RE.search(message) is not None


def _current_action_from_response(
    actions: list[DiagnosticAction], previous_assistant_response: str
) -> DiagnosticAction:
    response_tokens = {
        token
        for token in re.findall(r"[\w:()-]+", previous_assistant_response.casefold())
        if len(token) >= 4
    }

    def overlap(action: DiagnosticAction) -> int:
        action_text = " ".join([action.title, action.instruction]).casefold()
        action_tokens = {
            token for token in re.findall(r"[\w:()-]+", action_text) if len(token) >= 4
        }
        return len(response_tokens & action_tokens)

    return max(actions, key=overlap)


def _actions_after_current(
    actions: list[DiagnosticAction], current_action: DiagnosticAction
) -> list[DiagnosticAction]:
    current_index = next(
        index for index, action in enumerate(actions) if action.id == current_action.id
    )
    return actions[current_index + 1 :]


def _advance_to_next_action_plan(
    actions: list[DiagnosticAction],
    problem: str,
    current_action: DiagnosticAction,
    technician_response: str,
    observation_summary: str | None = None,
) -> DiagnosticPlan:
    remaining = _actions_after_current(actions, current_action)
    observation = observation_summary or (
        f"Bieżące sprawdzenie nie usunęło problemu: {technician_response.strip()}"
    )
    if not remaining:
        return DiagnosticPlan(
            status=DiagnosticPlanStatus.no_next_action,
            problem=problem,
            observation_summary=observation,
            completed_action_id=current_action.id,
        )
    return DiagnosticPlan(
        status=DiagnosticPlanStatus.actions,
        problem=problem,
        actions=remaining,
        observation_summary=observation,
        completed_action_id=current_action.id,
    )


def _numbered_context(chunks: list[str], max_chars: int = 12000) -> str:
    parts: list[str] = []
    total = 0
    for index, chunk in enumerate(chunks, start=1):
        text = chunk.strip()
        if not text:
            continue
        item = f"[Fragment {index}]\n{text}\n"
        if total + len(item) > max_chars:
            break
        parts.append(item)
        total += len(item)
    return "\n".join(parts)


async def extract_and_rank_actions(
    chunks: list[str], problem: str, settings: Settings
) -> list[DiagnosticAction]:
    if not chunks or not problem.strip():
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
                    f"Diagnozowany problem:\n{problem}\n\n"
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
    return rank_actions(extracted.actions)


async def classify_followup(
    current_action: DiagnosticAction,
    problem: str,
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
    action_data = current_action.model_dump(exclude={"score"}, mode="json")
    response = await client.chat.completions.create(
        model=settings.openai_chat_model,
        temperature=0,
        messages=[
            {"role": "system", "content": FOLLOWUP_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Diagnozowany problem:\n{problem}\n\n"
                    f"Ostatnia odpowiedź asystenta:\n{previous_assistant_response}\n\n"
                    f"Nowa wiadomość technika:\n{technician_response}\n\n"
                    f"Bieżąca akcja:\n{json.dumps(action_data, ensure_ascii=False)}"
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
            diagnostic_complete=False,
        )
    return FollowupDecision.model_validate(json.loads(content))


async def build_diagnostic_plan(
    chunks: list[str], problem: str, settings: Settings
) -> DiagnosticPlan | None:
    try:
        actions = await extract_and_rank_actions(chunks, problem, settings)
        if not actions:
            return None
        return DiagnosticPlan(
            status=DiagnosticPlanStatus.actions,
            problem=problem,
            actions=actions,
        )
    except Exception:
        logger.exception("Could not build next-best-step plan for %s", problem)
        return None


async def build_followup_plan(
    current_plan: DiagnosticPlan,
    previous_assistant_response: str,
    technician_response: str,
    settings: Settings,
) -> tuple[bool, DiagnosticPlan | None]:
    """Return whether the message is an observation and the next ranked plan."""
    problem = current_plan.problem
    try:
        actions = current_plan.actions
        if current_plan.status != DiagnosticPlanStatus.actions or not actions:
            return False, None

        current_action = next(
            (
                action
                for action in actions
                if action.id == current_plan.completed_action_id
            ),
            _current_action_from_response(actions, previous_assistant_response),
        )

        if requests_next_action(technician_response):
            return True, _advance_to_next_action_plan(
                actions,
                problem,
                current_action,
                technician_response,
                "Technik poprosił o kolejny krok bez podania wyniku bieżącej akcji.",
            )

        if reports_only_problem_status(technician_response) or reports_negative_result(
            technician_response
        ):
            return True, _advance_to_next_action_plan(
                actions,
                problem,
                current_action,
                technician_response,
            )

        decision = await classify_followup(
            current_action,
            problem,
            previous_assistant_response,
            technician_response,
            settings,
        )
        if not decision.is_action_result:
            return False, None
        resolution_confirmed = explicitly_confirms_resolution(technician_response)
        if decision.diagnostic_complete and resolution_confirmed:
            return True, DiagnosticPlan(
                status=DiagnosticPlanStatus.complete,
                problem=problem,
                observation_summary=decision.observation_summary,
                completed_action_id=current_action.id,
            )

        actions_after_completed = _actions_after_current(actions, current_action)
        remaining = actions_after_completed
        if not remaining:
            return True, DiagnosticPlan(
                status=DiagnosticPlanStatus.no_next_action,
                problem=problem,
                observation_summary=decision.observation_summary,
                completed_action_id=current_action.id,
            )
        return True, DiagnosticPlan(
            status=DiagnosticPlanStatus.actions,
            problem=problem,
            actions=rank_actions(remaining),
            observation_summary=decision.observation_summary,
            completed_action_id=current_action.id,
        )
    except Exception:
        logger.exception("Could not process next-best-step follow-up for %s", problem)
        return False, None
