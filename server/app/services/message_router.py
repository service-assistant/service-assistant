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


class RoutingHistoryMessage(TypedDict):
    id: int
    sender: str
    content: str
    has_chunks: bool


class MessageRoute(str, Enum):
    standard_query = "standard_query"
    start_diagnostic = "start_diagnostic"
    diagnostic_followup = "diagnostic_followup"


class RouteDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    route: MessageRoute
    confidence: float = Field(ge=0, le=1)
    recognized_problem: str | None
    diagnostic_message_id: int | None


ROUTING_PROMPT: Final[str] = """
Jesteś routerem wiadomości technika serwisowego. Nie odpowiadasz na pytanie i nie
proponujesz rozwiązania. Wybierasz wyłącznie ścieżkę obsługi wiadomości.

Dostępne ścieżki:
- standard_query: pytanie informacyjne, instrukcja obsługi, bezpieczeństwo,
  konserwacja, pytanie poboczne lub wiadomość niezwiązana z diagnostyką,
- start_diagnostic: technik zgłasza kod błędu, usterkę albo objaw i chce rozpocząć
  prowadzenie krok po kroku w celu znalezienia przyczyny,
- diagnostic_followup: wiadomość jest wynikiem, obserwacją, odmową wykonania albo
  informacją o wykonaniu wcześniejszej akcji diagnostycznej asystenta.

Historia zawiera ID wiadomości oraz informację has_chunks. Dla diagnostic_followup:
- znajdź w historii właściwą odpowiedź asystenta z akcją diagnostyczną,
- jeżeli wiadomość może odpowiadać na kilka akcji, wybierz najnowszą pasującą odpowiedź,
- ustaw diagnostic_message_id na jej dokładne ID,
- wybieraj wyłącznie wiadomość assistant, dla której has_chunks=true,
- ustaw recognized_problem na kod błędu, usterkę lub objaw diagnozowany w tej sesji.

Samo występowanie słów technicznych nie oznacza diagnostyki. Pytania typu
"jak bezpiecznie podnosić urządzenie?" albo "jak wymienić filtr?" są standard_query,
o ile nie stanowią odpowiedzi na wcześniejszą akcję diagnostyczną. Pytanie poboczne
nie zamyka wcześniejszej diagnostyki. Jeżeli historia pokazuje, że diagnostyka została
zakończona albo nie ma następnej akcji, nie klasyfikuj kolejnej wiadomości jako follow-up.

Dla standard_query i start_diagnostic ustaw diagnostic_message_id=null. Przy
niepewności wybierz standard_query i ustaw odpowiednio niższą pewność.
"""


def extract_error_code(message: str) -> str | None:
    match = ERROR_CODE_RE.search(message)
    return match.group(0) if match else None


def _standard_decision(confidence: float = 0) -> RouteDecision:
    return RouteDecision(
        route=MessageRoute.standard_query,
        confidence=confidence,
        recognized_problem=None,
        diagnostic_message_id=None,
    )


async def classify_message(
    message: str,
    settings: Settings,
    *,
    recent_messages: list[RoutingHistoryMessage],
) -> RouteDecision:
    """Choose a chat path and reconstruct diagnostic context from history."""
    error_code = extract_error_code(message)
    if error_code:
        return RouteDecision(
            route=MessageRoute.start_diagnostic,
            confidence=1,
            recognized_problem=error_code,
            diagnostic_message_id=None,
        )

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "message_route",
            "strict": True,
            "schema": RouteDecision.model_json_schema(),
        },
    }
    history_json = json.dumps(recent_messages, ensure_ascii=False)
    response = await client.chat.completions.create(
        model=settings.openai_chat_model,
        temperature=0,
        messages=[
            {"role": "system", "content": ROUTING_PROMPT},
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

    decision = RouteDecision.model_validate(json.loads(content))
    if decision.confidence < 0.6:
        return _standard_decision(decision.confidence)
    if decision.route == MessageRoute.start_diagnostic:
        if not decision.recognized_problem:
            return _standard_decision(decision.confidence)
        return decision.model_copy(update={"diagnostic_message_id": None})
    if decision.route == MessageRoute.diagnostic_followup:
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
        return decision
    return decision.model_copy(
        update={"recognized_problem": None, "diagnostic_message_id": None}
    )


async def route_message(
    message: str,
    settings: Settings,
    *,
    recent_messages: list[RoutingHistoryMessage],
) -> RouteDecision:
    """Return a conservative decision; provider failures use standard RAG."""
    try:
        return await classify_message(
            message,
            settings,
            recent_messages=recent_messages,
        )
    except Exception:
        logger.exception("Could not classify technician message")
        return _standard_decision()
