import json
import logging
import re
from enum import Enum
from typing import Any, Final, TypedDict, cast

from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, Field

from ..config import Settings

logger = logging.getLogger(__name__)

ERROR_CODE_RE = re.compile(
    r"(?<![\w])(?:[A-Za-z]{1,10}[-:.]\d[A-Za-z0-9.-]*|\d+[:.]\d+)(?![\w])",
    re.IGNORECASE,
)
EXPLICIT_MANIFESTATION_RE = re.compile(
    r"\b(?:wyj\w*|hałas\w*|głośn\w*|stuk\w*|piszcz\w*|"
    r"drg\w*|wibruj\w*|ciekn\w*|wyciek\w*|dym\w*|"
    r"przegrzew\w*|gorąc\w*|woln\w*|szarp\w*|zatrzym\w*)\b",
    re.IGNORECASE,
)


class RoutingHistoryMessage(TypedDict):
    id: int
    sender: str
    content: str
    has_chunks: bool


class MessageRoute(str, Enum):
    standard_query = "standard_query"
    needs_clarification = "needs_clarification"
    start_diagnostic = "start_diagnostic"
    diagnostic_followup = "diagnostic_followup"


class StandardMessageRoute(str, Enum):
    standard_query = "standard_query"
    needs_clarification = "needs_clarification"


class MissingInformation(str, Enum):
    subject = "subject"
    manifestation = "manifestation"


class RouteDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    route: MessageRoute
    confidence: float = Field(ge=0, le=1)
    recognized_problem: str | None = None
    diagnostic_message_id: int | None = None
    clarification_question: str | None = None
    missing_information: list[MissingInformation] = Field(default_factory=list)


class StandardRouteDecision(BaseModel):
    """Schema exposed to the model when diagnostic mode is disabled."""

    model_config = ConfigDict(extra="forbid")

    route: StandardMessageRoute
    confidence: float = Field(ge=0, le=1)
    clarification_question: str | None
    missing_information: list[MissingInformation]


class DiagnosticRouteDecision(BaseModel):
    """Schema exposed to the model only when diagnostic mode is enabled."""

    model_config = ConfigDict(extra="forbid")

    route: MessageRoute
    confidence: float = Field(ge=0, le=1)
    recognized_problem: str | None
    diagnostic_message_id: int | None
    clarification_question: str | None
    missing_information: list[MissingInformation]


CLARIFICATION_PROMPT: Final[str] = """
Jesteś routerem wiadomości technika serwisowego. Nie odpowiadasz na pytanie i nie
proponujesz rozwiązania. Oceniasz, czy wiadomość zawiera wystarczająco dużo danych,
aby wyszukać właściwy fragment dokumentacji dla urządzenia przypisanego do rozmowy.

Dostępne ścieżki:
- standard_query: można bezpiecznie przejść do wyszukania odpowiedzi,
- needs_clarification: brakuje kluczowej informacji, bez której wyszukiwanie byłoby
  przypadkowe, np. technik pisze tylko „nie działa” albo „jak to naprawić?”, a historia
  nie wyjaśnia, czego dotyczy wiadomość.

Najpierw wyznacz missing_information. Dozwolone braki:
- subject: nie wiadomo, którego elementu, funkcji lub zdarzenia dotyczy problem,
- manifestation: znana jest funkcja, ale opis jest tylko ogólny, np. „nie działa” lub
  „nie odpala”, i brakuje obserwacji rozróżniającej różne ścieżki dokumentacji.

Ustaw needs_clarification tylko wtedy, gdy missing_information nie jest puste.
Jeżeli subject oraz manifestation są już znane z nowej wiadomości i historii, ustaw
missing_information=[] i wybierz standard_query. Nie zbieraj przed wyszukiwaniem
przyczyny, wyników pomiarów, konfiguracji ani wszystkich parametrów technicznych.
Nietypowy dźwięk, wycie, stukanie, drgania, wyciek, przegrzewanie albo zbyt wolna
praca są już manifestation. Pytania o moment rozpoczęcia, narastanie lub dokładny
charakter takiego objawu mogą być częścią późniejszej diagnostyki, ale nie mogą
blokować pierwszego wyszukiwania.

Dla needs_clarification ustaw clarification_question na jedno krótkie i konkretne
pytanie po polsku. Jeśli to pomaga, podaj 2–4 najbardziej naturalne możliwości.
Nie pytaj ponownie o informację, która znajduje się w historii. Nie uznawaj wiadomości
za niejasną tylko dlatego, że jest krótka: „tak”, „nie”, wynik pomiaru lub „co dalej?”
mogą być pełną odpowiedzią na poprzednią wiadomość. Zdjęcia i identyfikacja urządzenia
są obsługiwane poza routerem. Dla standard_query ustaw clarification_question=null.
Przy niepewności wybierz standard_query z odpowiednio niższą pewnością. Dla
standard_query zawsze ustaw missing_information=[].

Pytanie musi dotyczyć wyłącznie informacji, której naprawdę brakuje. Jeżeli technik
nazwał już element lub funkcję, nie pytaj ponownie, czego dotyczy problem ani nie
proponuj innych funkcji urządzenia. Przykład: dla „Nie działa podnoszenie wideł” możesz
zapytać „Czy widły nie ruszają wcale, podnoszą się zbyt wolno, czy zatrzymują się na
określonej wysokości?”. Nie pytaj wtedy, czy chodzi o podnoszenie, opuszczanie lub inną
funkcję, ponieważ podnoszenie zostało już wskazane.

Przykłady:
- „Wózek nie odpala” -> missing_information=["manifestation"] i można zapytać,
  czy nie ma reakcji, słychać kliknięcie, czy silnik kręci bez uruchomienia.
- „Wózek nie odpala, nie ma jakiejkolwiek reakcji” -> missing_information=[] oraz
  standard_query; nie zadawaj kolejnego pytania.
- „Podnoszą się zbyt wolno” po pytaniu o podnoszenie wideł ->
  missing_information=[] oraz standard_query.
- „Pompa hydrauliczna mocno wyje podczas pracy” -> missing_information=[] oraz
  standard_query; nie pytaj przed wyszukiwaniem, kiedy wycie się zaczyna lub narasta.
"""


DIAGNOSTIC_PROMPT: Final[str] = """
Jesteś routerem wiadomości technika serwisowego. Nie odpowiadasz na pytanie i nie
proponujesz rozwiązania. Wybierasz wyłącznie ścieżkę obsługi wiadomości.

Dostępne ścieżki:
- standard_query: pytanie informacyjne, instrukcja obsługi, bezpieczeństwo,
  konserwacja, pytanie poboczne lub wiadomość niezwiązana z diagnostyką,
- needs_clarification: brakuje kluczowej informacji, bez której nie da się wybrać
  właściwego obszaru dokumentacji ani rozpoznać zgłaszanego objawu,
- start_diagnostic: technik zgłasza kod błędu, usterkę albo objaw i chce rozpocząć
  prowadzenie krok po kroku w celu znalezienia przyczyny,
- diagnostic_followup: wiadomość jest wynikiem, obserwacją, odmową wykonania albo
  informacją o wykonaniu wcześniejszej akcji diagnostycznej asystenta.

Najpierw wyznacz missing_information. Dozwolone braki:
- subject: nie wiadomo, którego elementu, funkcji lub zdarzenia dotyczy problem,
- manifestation: znana jest funkcja, ale opis jest tylko ogólny, np. „nie działa” lub
  „nie odpala”, i brakuje obserwacji rozróżniającej różne ścieżki dokumentacji.

Ustaw needs_clarification tylko wtedy, gdy missing_information nie jest puste.
Jeżeli subject oraz manifestation są już znane z nowej wiadomości i historii, ustaw
missing_information=[] i wybierz odpowiednią inną ścieżkę. Nie zbieraj przed
wyszukiwaniem przyczyny, wyników pomiarów, konfiguracji ani wszystkich parametrów.
Nietypowy dźwięk, wycie, stukanie, drgania, wyciek, przegrzewanie albo zbyt wolna
praca są już manifestation. Pytania o moment rozpoczęcia, narastanie lub dokładny
charakter takiego objawu należą do dalszej diagnostyki i nie mogą blokować jej startu.

Historia zawiera ID wiadomości oraz informację has_chunks. Dla diagnostic_followup:
- znajdź w historii właściwą odpowiedź asystenta z akcją diagnostyczną,
- jeżeli wiadomość może odpowiadać na kilka akcji, wybierz najnowszą pasującą odpowiedź,
- ustaw diagnostic_message_id na jej dokładne ID,
- wybieraj wyłącznie wiadomość assistant, dla której has_chunks=true,
- ustaw recognized_problem na kod błędu, usterkę lub objaw diagnozowany w tej sesji.

Samo występowanie słów technicznych nie oznacza diagnostyki. Pytania typu
„jak bezpiecznie podnosić urządzenie?” albo „jak wymienić filtr?” są standard_query,
o ile nie stanowią odpowiedzi na wcześniejszą akcję diagnostyczną. Pytanie poboczne
nie zamyka wcześniejszej diagnostyki. Jeżeli historia pokazuje, że diagnostyka została
zakończona albo nie ma następnej akcji, nie klasyfikuj kolejnej wiadomości jako follow-up.

Dla needs_clarification ustaw clarification_question na jedno krótkie, konkretne
pytanie po polsku. Nie pytaj o dane obecne w historii. Krótka odpowiedź, wynik pomiaru
lub prośba „co dalej?” mogą być pełnym diagnostic_followup. Dla pozostałych ścieżek
ustaw clarification_question=null.

Pytanie musi dotyczyć wyłącznie informacji, której naprawdę brakuje. Jeżeli technik
nazwał już element lub funkcję, nie pytaj ponownie, czego dotyczy problem ani nie
proponuj innych funkcji urządzenia. Przykład: dla „Nie działa podnoszenie wideł” możesz
zapytać „Czy widły nie ruszają wcale, podnoszą się zbyt wolno, czy zatrzymują się na
określonej wysokości?”. Nie pytaj wtedy, czy chodzi o podnoszenie, opuszczanie lub inną
funkcję, ponieważ podnoszenie zostało już wskazane.

Przykłady:
- „Wózek nie odpala” -> missing_information=["manifestation"] i można zapytać,
  czy nie ma reakcji, słychać kliknięcie, czy silnik kręci bez uruchomienia.
- „Wózek nie odpala, nie ma jakiejkolwiek reakcji” -> missing_information=[] oraz
  start_diagnostic; nie zadawaj kolejnego pytania.
- „Podnoszą się zbyt wolno” po pytaniu o podnoszenie wideł ->
  missing_information=[] i nie wybieraj needs_clarification.
- „Pompa hydrauliczna mocno wyje podczas pracy” -> missing_information=[] oraz
  start_diagnostic; nie pytaj przed startem, kiedy wycie się zaczyna lub narasta.

Dla standard_query i start_diagnostic ustaw diagnostic_message_id=null. Przy
niepewności wybierz standard_query i ustaw odpowiednio niższą pewność. Dla każdej
ścieżki innej niż needs_clarification ustaw missing_information=[].
"""


def extract_error_code(message: str) -> str | None:
    match = ERROR_CODE_RE.search(message)
    return match.group(0) if match else None


def has_explicit_manifestation(message: str) -> bool:
    return EXPLICIT_MANIFESTATION_RE.search(message) is not None


def _standard_decision(confidence: float = 0) -> RouteDecision:
    return RouteDecision(
        route=MessageRoute.standard_query,
        confidence=confidence,
    )


def _normalize_standard_decision(decision: StandardRouteDecision) -> RouteDecision:
    return RouteDecision(
        route=MessageRoute(decision.route.value),
        confidence=decision.confidence,
        clarification_question=decision.clarification_question,
        missing_information=decision.missing_information,
    )


async def classify_message(
    message: str,
    settings: Settings,
    *,
    recent_messages: list[RoutingHistoryMessage],
    diagnostic_mode_enabled: bool = False,
) -> RouteDecision:
    """Choose a chat path using a schema scoped to the active application mode."""
    error_code = extract_error_code(message)
    if error_code:
        if diagnostic_mode_enabled:
            return RouteDecision(
                route=MessageRoute.start_diagnostic,
                confidence=1,
                recognized_problem=error_code,
            )
        return RouteDecision(
            route=MessageRoute.standard_query,
            confidence=1,
        )

    decision_model: type[StandardRouteDecision] | type[DiagnosticRouteDecision]
    if diagnostic_mode_enabled:
        decision_model = DiagnosticRouteDecision
        prompt = DIAGNOSTIC_PROMPT
    else:
        decision_model = StandardRouteDecision
        prompt = CLARIFICATION_PROMPT

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "message_route",
            "strict": True,
            "schema": decision_model.model_json_schema(),
        },
    }
    history_json = json.dumps(recent_messages, ensure_ascii=False)
    response = await client.chat.completions.create(
        model=settings.openai_router_model,
        reasoning_effort="none",
        messages=[
            {"role": "system", "content": prompt},
            {
                "role": "user",
                "content": (
                    f"Historia rozmowy:\n{history_json}\n\n"
                    f"Nowa wiadomość technika:\n{message}"
                ),
            },
        ],
        response_format=cast(Any, response_format),
    )
    content = response.choices[0].message.content
    if not content:
        return _standard_decision()

    if diagnostic_mode_enabled:
        decision = RouteDecision.model_validate_json(content)
    else:
        standard_decision = StandardRouteDecision.model_validate_json(content)
        decision = _normalize_standard_decision(standard_decision)

    if decision.confidence < 0.6:
        return _standard_decision(decision.confidence)
    if decision.route == MessageRoute.needs_clarification:
        if not decision.clarification_question or not decision.missing_information:
            return _standard_decision(decision.confidence)
        if (
            decision.missing_information == [MissingInformation.manifestation]
            and has_explicit_manifestation(message)
        ):
            if diagnostic_mode_enabled:
                return RouteDecision(
                    route=MessageRoute.start_diagnostic,
                    confidence=decision.confidence,
                    recognized_problem=message,
                )
            return _standard_decision(decision.confidence)
        return decision.model_copy(
            update={"recognized_problem": None, "diagnostic_message_id": None}
        )
    if decision.route == MessageRoute.start_diagnostic:
        if not diagnostic_mode_enabled or not decision.recognized_problem:
            return _standard_decision(decision.confidence)
        return decision.model_copy(
            update={
                "diagnostic_message_id": None,
                "clarification_question": None,
                "missing_information": [],
            }
        )
    if decision.route == MessageRoute.diagnostic_followup:
        if not diagnostic_mode_enabled:
            return _standard_decision(decision.confidence)
        valid_message_ids = {
            item["id"]
            for item in recent_messages
            if item["sender"] == "assistant" and item["has_chunks"]
        }
        if (
            not decision.recognized_problem
            or decision.diagnostic_message_id not in valid_message_ids
        ):
            return _standard_decision(decision.confidence)
        return decision.model_copy(
            update={"clarification_question": None, "missing_information": []}
        )
    return decision.model_copy(
        update={
            "recognized_problem": None,
            "diagnostic_message_id": None,
            "clarification_question": None,
            "missing_information": [],
        }
    )


async def route_message(
    message: str,
    settings: Settings,
    *,
    recent_messages: list[RoutingHistoryMessage],
    diagnostic_mode_enabled: bool = False,
) -> RouteDecision:
    """Return a conservative decision; provider failures use standard RAG."""
    try:
        return await classify_message(
            message,
            settings,
            recent_messages=recent_messages,
            diagnostic_mode_enabled=diagnostic_mode_enabled,
        )
    except Exception:
        logger.exception("Could not classify technician message")
        return _standard_decision()
