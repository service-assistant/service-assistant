import json
from typing import Any, cast

from app.config import Settings
from app.schemas import PhotoObservation
from openai import AsyncOpenAI

from .models import CaseUnderstandingResult, MachineContext

CASE_UNDERSTANDING_MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = """
You convert an industrial service technician's message into structured case context
and a small retrieval query plan. You do not diagnose the fault, recommend actions,
or answer the technician.

Case context rules:
- Write symptom.search_phrase as a concise technical English phrase suitable for
  searching a service manual. Preserve fault codes, identifiers, numbers, and units
  exactly. Describe only the reported symptom, never a suspected cause or the
  circumstances in which it started. Normalize colloquial wording to neutral
  service-manual terminology instead of translating it literally. For example,
  a truck that "drags", "crawls", or "moves very slowly" has reduced or creep
  travel speed; it is not a generic "not moving properly" symptom.
- Represent that symptom as one structured fact using symptom.fact_key,
  symptom.fact_value, and symptom.unit. Use a stable snake_case fact_key such as
  travel_speed_state, lifting_state, fault_code, or measured_voltage. Use a number
  for numeric values, a boolean for true/false states, and a string for labels.
- Add only observations explicitly stated by the technician or supplied as photo
  observations. Never infer that a sound, error code, measurement, component state,
  or previous repair is present or absent. Treat photo confidence below 0.8 or absent
  confidence as uncertain.
- Every observation must be one atomic fact with a stable snake_case key, a typed
  value, and an optional unit. Preserve explicit time, state, and relationship
  information as separate facts. Do not reduce a meaningful statement to generic
  component and object observations.
- Normalize a colloquial component name from its explicitly described function.
  A folding step on which the operator normally stands is an operator platform.
  This terminology normalization is not a diagnosis and must preserve what the
  technician actually reported.
- Example: for "after a 10-minute pause the truck moves very slowly; a box was on
  the folding step where I stand", use symptom fact
  travel_speed_state="reduced" and observations such as
  inactivity_duration=10 unit="minutes", operator_platform_loaded=true,
  platform_load_object="box", and platform_loaded_during_inactivity=true. Do not
  emit only component="operator platform" and object="box", because that loses the
  explicit relationship between them.
- Use certainty="certain" for direct unambiguous statements and
  certainty="uncertain" for hedged statements such as "probably" or "I think".
- Machine context is trusted system data. Use it to choose accurate terminology, but
  do not copy machine fields into observations and never modify its values.

Retrieval query rules:
- Write every item in base_queries and contextual_queries in English, regardless of
  the technician message or observation language. Translate ordinary language while
  preserving fault codes, identifiers, numbers, and units exactly.
- Return 1 or 2 base_queries. They must be independent variants of the main symptom
  and must not contain observations, assumptions, or proposed causes. When the
  technician explicitly asks how to restore, reset, deactivate, or return to normal
  operation, use one variant to search for that requested recovery outcome, for
  example "restore normal travel speed" or "deactivate creep speed mode".
- Return at most 1 item in contextual_queries. It may combine the symptom only with
  relevant explicit observations. Express temporal context as inactivity or
  standstill when the technician reports a pause. Prefer technical component names
  established in case context. For example: "creep speed after 10 minutes inactivity
  operator platform loaded".
- Never include the machine name, manufacturer, model, or serial number in any
  retrieval query.
- Keep every query short and technical. Prefer phrases found in service manuals.
- Avoid vague literal phrases such as "dragging" and "not moving properly" when the
  message supports a more precise functional symptom such as reduced travel speed.
- Make variants meaningfully different; do not return cosmetic paraphrases.
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
        model=CASE_UNDERSTANDING_MODEL,
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

    return parsed
