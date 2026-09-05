from app.config import Settings
from app.models import ChatThread, Message, MessageSender
from app.schemas import MessageCreate
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..common import diagnostic_plan_cache_key
from . import next_best_step, router


async def resolve_route(
    body: MessageCreate,
    settings: Settings,
    recent_messages: list[Message],
    routing_history: list[router.RoutingHistoryMessage],
) -> router.RouteDecision:
    decision = await router.route_message(
        body.content,
        settings,
        recent_messages=routing_history,
    )

    if not next_best_step.requests_next_action(body.content):
        return decision

    cached_message_and_plan = next(
        (
            (message, plan)
            for message in recent_messages
            if message.sender == MessageSender.assistant
            and message.chunks
            and (
                plan := next_best_step.get_cached_diagnostic_plan(
                    diagnostic_plan_cache_key(message)
                )
            )
        ),
        None,
    )

    if cached_message_and_plan is None:
        return decision

    cached_message, cached_plan = cached_message_and_plan
    return router.RouteDecision(
        route=router.MessageRoute.diagnostic_followup,
        confidence=1,
        recognized_problem=cached_plan.problem,
        diagnostic_message_id=cached_message.id,
    )


async def stream_message(
    thread: ChatThread,
    body: MessageCreate,
    settings: Settings,
    session: AsyncSession,
    organization_id: int,
    debug: bool,
) -> StreamingResponse:
    from ..pipeline import stream_message as stream_pipeline

    return await stream_pipeline(
        thread,
        body,
        settings,
        session,
        organization_id,
        debug,
        route_resolver=resolve_route,
    )
