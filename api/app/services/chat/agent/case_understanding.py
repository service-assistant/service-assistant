import json
from typing import Any, cast

from app.config import Settings
from app.schemas import PhotoObservation
from openai import AsyncOpenAI

from .models import CaseUnderstandingResult, MachineContext

SYSTEM_PROMPT = """
You convert an industrial service technician's message into structured case context
and a small retrieval query plan. You do not diagnose the fault, recommend actions,
or answer the technician.

Case context rules:
- Copy symptom.raw from the technician message without translating or normalizing it.
- Write symptom.search_phrase as a concise technical English phrase suitable for
  searching a service manual. Preserve fault codes, identifiers, numbers, and units
  exactly. Describe only the reported symptom, never a suspected cause.
- Add only observations explicitly stated by the technician or supplied as photo
  observations. Never infer that a sound, error code, measurement, component state,
  or previous repair is present or absent. Treat photo confidence below 0.8 or absent
  confidence as uncertain.
- Use certainty="certain" for direct unambiguous statements and
  certainty="uncertain" for hedged statements such as "probably" or "I think".
- Machine context is trusted system data. Use it to choose accurate terminology, but
  do not copy machine fields into observations and never modify its values.

Retrieval query rules:
- Return 1 to 3 base_queries. They must be independent variants of the main symptom
  and must not contain observations, assumptions, or proposed causes.
- Return at most 3 contextual_queries. They may combine the symptom with relevant
  explicit observations and machine model/manufacturer information.
- Keep every query short and technical. Prefer phrases found in service manuals.
- Make variants meaningfully different; do not return cosmetic paraphrases.
- Preserve all explicit technical identifiers exactly.
""".strip()


class CaseUnderstandingError(RuntimeError):
    pass


async def understand_case(
    message: str,
    machine: MachineContext,
    settings: Settings,
    *,
    photo_observations: list[PhotoObservation] | None = None,
) -> CaseUnderstandingResult:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    photo_context = [
        observation.model_dump(mode="json")
        for observation in (photo_observations or [])
    ]

    response = await client.chat.completions.parse(
        model=settings.openai_chat_model,
        response_format=CaseUnderstandingResult,
        messages=cast(
            Any,
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Technician message:\n{message}\n\n"
                        f"Machine context:\n{machine.model_dump_json(indent=2)}\n\n"
                        "Photo observations:\n"
                        f"{json.dumps(photo_context, ensure_ascii=False, indent=2)}"
                    ),
                },
            ],
        ),
    )

    response_message = response.choices[0].message
    if response_message.refusal:
        raise CaseUnderstandingError(
            f"OpenAI refused case understanding: {response_message.refusal}"
        )

    parsed = response_message.parsed
    if parsed is None:
        raise CaseUnderstandingError("OpenAI returned no case understanding")

    # `raw` is source data, so enforce it deterministically instead of trusting the
    # model to reproduce whitespace and punctuation exactly.
    symptom = parsed.case_context.symptom.model_copy(update={"raw": message.strip()})
    extracted_context = parsed.case_context.model_copy(update={"symptom": symptom})
    return parsed.model_copy(update={"case_context": extracted_context})
