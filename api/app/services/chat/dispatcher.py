from app.config import Settings
from app.models import ChatThread
from app.schemas import ChatMode, MessageCreate
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from . import standard
from .agent import engine as agent
from .diagnostic import engine as diagnostic


async def stream_chat_message(
    thread: ChatThread,
    body: MessageCreate,
    settings: Settings,
    session: AsyncSession,
    organization_id: int,
    debug: bool,
) -> StreamingResponse:
    common = (thread, body, settings, session, organization_id, debug)

    match body.mode:
        case ChatMode.standard:
            engine = standard

        case ChatMode.diagnostic:
            engine = diagnostic

        case ChatMode.agent:
            engine = agent

    return await engine.stream_message(*common)
