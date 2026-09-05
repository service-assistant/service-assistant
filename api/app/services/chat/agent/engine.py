"""Entry point for the multi-step agent chat engine."""

import time

from app.config import Settings
from app.models import ChatThread
from app.repositories import DeviceRepository
from app.schemas import MessageCreate
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .case_understanding import understand_case
from .models import CaseContext, MachineContext, RetrievalQueryPlan


def _retrieval_queries(
    case_context: CaseContext, query_plan: RetrievalQueryPlan
) -> list[str]:
    candidates = [
        case_context.symptom.search_phrase,
        *query_plan.base_queries,
        *query_plan.contextual_queries,
    ]
    queries: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        query = candidate.strip()
        key = query.casefold()
        if query and key not in seen:
            queries.append(query)
            seen.add(key)
    return queries


async def stream_message(
    thread: ChatThread,
    body: MessageCreate,
    settings: Settings,
    session: AsyncSession,
    organization_id: int,
    debug: bool,
) -> StreamingResponse:
    from ..pipeline import stream_message as stream_pipeline

    started_at = time.perf_counter()
    device = await DeviceRepository(session, organization_id).get(thread.device_id)
    if device is None:
        raise RuntimeError(f"Device {thread.device_id} for chat thread was not found")

    machine = MachineContext(
        device_id=device.id,
        name=device.name,
        model_serial_code=device.model_serial_code,
        nameplate_data=thread.nameplate_data,
    )
    understanding = await understand_case(
        body.content,
        machine,
        settings,
        photo_observations=body.photo_context,
    )
    case_context = CaseContext(
        machine=machine,
        symptom=understanding.case_context.symptom,
        observations=understanding.case_context.observations,
    )
    queries = _retrieval_queries(case_context, understanding.query_plan)

    return await stream_pipeline(
        thread,
        body,
        settings,
        session,
        organization_id,
        debug,
        retrieval_queries=queries,
        preprocessing_debug={
            "step": "case_understanding",
            "label": "Case Context i Query Rewrite",
            "duration_ms": round((time.perf_counter() - started_at) * 1000),
            "data": {
                "case_context": case_context.model_dump(mode="json"),
                "query_plan": understanding.query_plan.model_dump(mode="json"),
                "retrieval_queries": queries,
            },
        },
    )
