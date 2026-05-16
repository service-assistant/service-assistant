import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select
from typing import Annotated

from app.config import Settings, get_settings
from app.database import get_session
from app.models import ChatThread, ChunkMessage, Message, MessageSender
from app.services import embedding, llm

router = APIRouter()


class ThreadCreate(BaseModel):
    device_id: int = Field(
        description="ID of the device this chat thread is about.",
        examples=[1],
    )
    title: str = Field(
        description="Short descriptive title for the thread.",
        examples=["Mast won't lift under load"],
    )


class MessageCreate(BaseModel):
    content: str = Field(
        description="Text of the user message.",
        examples=["What does fault code E-23 mean and how do I clear it?"],
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=ChatThread,
    summary="Create a chat thread",
    description="Creates a new chat thread for a specific device. Each thread holds an independent conversation history.",
)
async def create_thread(
    body: ThreadCreate,
    session: AsyncSession = Depends(get_session),
):
    thread = ChatThread(**body.model_dump())
    session.add(thread)
    await session.commit()
    await session.refresh(thread)
    return thread


@router.get(
    "",
    response_model=list[ChatThread],
    summary="List chat threads",
    description="Returns all chat threads across all devices.",
)
async def list_threads(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(ChatThread))
    return result.scalars().all()


@router.delete(
    "/{thread_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a chat thread",
    description="Permanently deletes a thread and all its messages (cascade).",
    responses={404: {"description": "Thread not found"}},
)
async def delete_thread(thread_id: int, session: AsyncSession = Depends(get_session)):
    thread = await session.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    await session.delete(thread)
    await session.commit()


@router.post(
    "/{thread_id}/messages",
    summary="Send a message",
    description=(
        "Appends a user message to the thread, then runs a RAG pipeline: "
        "embeds the question, retrieves the most relevant document chunks for the thread's device, "
        "and streams the LLM reply via Server-Sent Events. "
        "Emits `chunk` events for each text fragment and a final `message` event "
        "with the persisted assistant Message as JSON."
    ),
    responses={
        200: {"description": "SSE stream of chunk and message events"},
        404: {"description": "Thread not found"},
    },
)
async def create_message(
    thread_id: int,
    body: MessageCreate,
    settings: Annotated[Settings, Depends(get_settings)],
    session: AsyncSession = Depends(get_session),
):
    thread = await session.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    device_id = thread.device_id

    user_message = Message(
        content=body.content,
        thread_id=thread_id,
        sender=MessageSender.user,
    )
    session.add(user_message)
    await session.commit()

    embedded_question = await embedding.embed_question(body.content, settings)
    close_chunks = await embedding.get_close_chunks(
        session, embedded_question, device_id=device_id
    )
    context_chunks = [chunk["content"] for chunk in close_chunks]

    async def event_stream():
        answer_parts: list[str] = []

        async for chunk in llm.stream_query(body.content, context_chunks, settings):
            answer_parts.append(chunk)
            yield f"event: chunk\ndata: {json.dumps(chunk)}\n\n"

        answer = "".join(answer_parts)
        system_message = Message(
            content=answer,
            thread_id=thread_id,
            sender=MessageSender.system,
        )
        session.add(system_message)
        await session.commit()
        await session.refresh(system_message)

        assert system_message.id is not None
        for chunk in close_chunks:
            session.add(
                ChunkMessage(message_id=system_message.id, chunk_id=chunk["id"])
            )
        await session.commit()
        await session.refresh(system_message)

        yield f"event: message\ndata: {system_message.model_dump_json()}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get(
    "/{thread_id}/messages",
    response_model=list[Message],
    summary="List messages in a thread",
    description="Returns all messages in a thread ordered chronologically (oldest first).",
    responses={404: {"description": "Thread not found"}},
)
async def list_messages(thread_id: int, session: AsyncSession = Depends(get_session)):
    thread = await session.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    result = await session.execute(
        select(Message)
        .where(Message.thread_id == thread_id)
        .order_by(col(Message.created_at))
    )
    return result.scalars().all()
