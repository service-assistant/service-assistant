import json
import logging
from enum import Enum
from typing import Any, Final, cast

from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict

from ..config import Settings
from .embedding import RetrievedChunk

logger = logging.getLogger(__name__)


class ContextSupport(str, Enum):
    direct_support = "direct_support"
    related_only = "related_only"
    no_support = "no_support"


class ContextSupportDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    support: ContextSupport
    direct_chunk_ids: list[int]


SUPPORT_PROMPT: Final[str] = """
Jesteś rygorystycznym kontrolerem źródeł w systemie RAG dla technika serwisowego.
Nie odpowiadasz na pytanie i nie tworzysz procedury. Oceniasz, czy dostarczone
fragmenty dokumentacji bezpośrednio wspierają odpowiedź na konkretne pytanie lub
zgłoszony objaw.

Klasy:
- direct_support: co najmniej jeden fragment bezpośrednio opisuje ten sam objaw,
  pytanie, przyczynę tego objawu albo procedurę wyraźnie przeznaczoną dla tego
  przypadku,
- related_only: fragmenty dotyczą tego samego podzespołu lub układu, ale opisują inny
  objaw, inną operację, konserwację, montaż, test po naprawie albo tylko ogólną zasadę,
- no_support: fragmenty nie zawierają informacji przydatnej dla pytania.

Zasady:
- zgodność nazwy podzespołu nie wystarcza do direct_support,
- nie wolno przenosić procedury z innego objawu na bieżący objaw,
- nie wolno traktować instrukcji montażu, demontażu lub testu po montażu jako
  diagnostyki, jeśli pytanie nie dotyczy tego etapu,
- nie wolno łączyć kilku luźno powiązanych fragmentów w nową procedurę,
- ogólna informacja o możliwych awariach podzespołu nie wspiera konkretnej przyczyny,
  jeśli dokumentacja nie łączy jej ze zgłoszonym objawem,
- direct_chunk_ids ma zawierać wyłącznie ID fragmentów zapewniających bezpośrednie
  wsparcie; dla related_only i no_support zwróć pustą listę,
- jeśli masz wątpliwość między direct_support i related_only, wybierz related_only.

Przykład: pytanie o głośne wycie pompy nie ma direct_support w fragmentach dotyczących
zanieczyszczenia oleju, małej prędkości cylindra, montażu pompy lub testu pompy po
montażu, o ile fragmenty nie wiążą tych informacji bezpośrednio z hałasem pompy.
""".strip()


def _candidate_payload(chunks: list[RetrievedChunk]) -> list[dict[str, object]]:
    return [
        {
            "id": chunk["id"],
            "content": chunk["content"],
            "metadata": chunk.get("extra_metadata") or {},
        }
        for chunk in chunks
    ]


def decide_from_reranker_scores(
    chunks: list[RetrievedChunk], settings: Settings
) -> ContextSupportDecision | None:
    """Resolve confident reranker results; return None for the uncertain band."""
    scored_chunks = [chunk for chunk in chunks if "reranker_score" in chunk]
    if not scored_chunks:
        return None

    highest_score = max(chunk["reranker_score"] for chunk in scored_chunks)
    if highest_score < settings.reranker_no_support_threshold:
        return ContextSupportDecision(
            support=ContextSupport.no_support,
            direct_chunk_ids=[],
        )
    if highest_score >= settings.reranker_direct_support_threshold:
        return ContextSupportDecision(
            support=ContextSupport.direct_support,
            direct_chunk_ids=[
                chunk["id"]
                for chunk in scored_chunks
                if chunk["reranker_score"]
                >= settings.reranker_direct_support_threshold
            ],
        )
    return None


async def classify_context_support(
    question: str,
    chunks: list[RetrievedChunk],
    settings: Settings,
) -> ContextSupportDecision:
    if not chunks:
        return ContextSupportDecision(
            support=ContextSupport.no_support,
            direct_chunk_ids=[],
        )

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "context_support",
            "strict": True,
            "schema": ContextSupportDecision.model_json_schema(),
        },
    }
    response = await client.chat.completions.create(
        model=settings.openai_context_support_model,
        reasoning_effort="none",
        messages=[
            {"role": "system", "content": SUPPORT_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Pytanie lub zgłoszenie technika:\n{question}\n\n"
                    "Kandydaci z dokumentacji:\n"
                    f"{json.dumps(_candidate_payload(chunks), ensure_ascii=False)}"
                ),
            },
        ],
        response_format=cast(Any, response_format),
    )
    content = response.choices[0].message.content
    if not content:
        raise ValueError("Context support classifier returned no content")

    decision = ContextSupportDecision.model_validate_json(content)
    available_ids = {chunk["id"] for chunk in chunks}
    direct_ids = list(dict.fromkeys(decision.direct_chunk_ids))
    if decision.support != ContextSupport.direct_support:
        return decision.model_copy(update={"direct_chunk_ids": []})
    if not direct_ids or any(chunk_id not in available_ids for chunk_id in direct_ids):
        return ContextSupportDecision(
            support=ContextSupport.related_only,
            direct_chunk_ids=[],
        )
    return decision.model_copy(update={"direct_chunk_ids": direct_ids})


async def evaluate_context_support(
    question: str,
    chunks: list[RetrievedChunk],
    settings: Settings,
) -> ContextSupportDecision:
    """Fail closed so unrelated context cannot become a fabricated procedure."""
    try:
        return await classify_context_support(question, chunks, settings)
    except Exception:
        logger.exception("Could not evaluate retrieved context support")
        return ContextSupportDecision(
            support=ContextSupport.no_support,
            direct_chunk_ids=[],
        )
