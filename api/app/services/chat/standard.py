from app.config import Settings
from app.models import ChatThread
from app.schemas import MessageCreate
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession


async def stream_message(
    thread: ChatThread,
    body: MessageCreate,
    settings: Settings,
    session: AsyncSession,
    organization_id: int,
    debug: bool,
) -> StreamingResponse:
    from .pipeline import stream_message as stream_pipeline

    return await stream_pipeline(
        thread,
        body,
        settings,
        session,
        organization_id,
        debug,
    )
