import json
from enum import Enum
from typing import Any, Final, cast

from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, Field

from app.config import Settings


class VoiceQuerySelectorError(Exception):
    pass


class VoiceDecision(str, Enum):
    accept = "accept"
    ignore = "ignore"


class VoiceQuerySelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: VoiceDecision
    selected_text: str
    confidence: float = Field(ge=0, le=1)


SELECTOR_PROMPT: Final[str] = """
Jesteś selektorem pytania technika serwisowego z pełnej transkrypcji nagrania.
Nagrywanie zostało świadomie uruchomione, aby technik zadał asystentowi jedno pytanie
lub wydał polecenie. Transkrypcja może również zawierać rozmowy innych osób w tle.

Wybierz zamierzone pytanie lub polecenie technika. Nie odpowiadaj na nie. Pole
selected_text musi być dokładnym, ciągłym fragmentem wejściowej transkrypcji — kopiuj
znaki bez poprawiania słów, interpunkcji, kodów i liczb.

Wskazówki:
- spójna wypowiedź rozpoczęta blisko początku nagrania jest bardziej prawdopodobna
  niż późniejsza rozmowa poboczna,
- nie używaj list słów kluczowych i nie zakładaj, że techniczne słownictwo oznacza
  technika,
- zawsze wybierz najbardziej prawdopodobny ciągły fragment technika, nawet gdy jest
  krótki, częściowo ucięty albo pewność jest niska,
- jeśli transkrypcja zawiera wyłącznie tło, wybierz ignore.

Dla ignore ustaw selected_text na pusty tekst.
"""


def selected_text_or_full_transcript(
    transcript: str, selection: VoiceQuerySelection | None
) -> str:
    if selection is not None and selection.decision == VoiceDecision.accept:
        return selection.selected_text
    return transcript


async def select_technician_query(
    transcript: str, settings: Settings
) -> VoiceQuerySelection:
    transcript = transcript.strip()
    if not transcript:
        return VoiceQuerySelection(
            decision=VoiceDecision.ignore,
            selected_text="",
            confidence=1,
        )

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "voice_query_selection",
            "strict": True,
            "schema": VoiceQuerySelection.model_json_schema(),
        },
    }
    try:
        response = await client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=[
                {"role": "system", "content": SELECTOR_PROMPT},
                {"role": "user", "content": transcript},
            ],
            response_format=cast(Any, response_format),
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError("empty selector response")
        selection = VoiceQuerySelection.model_validate(json.loads(content))
    except Exception as exc:
        raise VoiceQuerySelectorError(f"Voice query selection failed: {exc}") from exc

    selected_text = selection.selected_text.strip()
    valid_exact_fragment = bool(selected_text) and selected_text in transcript
    if selection.decision != VoiceDecision.accept or not valid_exact_fragment:
        return VoiceQuerySelection(
            decision=VoiceDecision.ignore,
            selected_text="",
            confidence=selection.confidence,
        )

    return selection.model_copy(update={"selected_text": selected_text})
