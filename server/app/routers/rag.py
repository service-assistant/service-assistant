import json
from textwrap import dedent
from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings, get_settings
from ..database import get_session
from ..services import embedding, llm

router = APIRouter(prefix="", tags=["RAG"])


class AskQuestionRequest(BaseModel):
    question: str = Field(
        min_length=1,
        max_length=4096,
        description="The question to ask the assistant.",
        examples=["What is the maintenance procedure for the mast assembly?"],
    )


@router.post(
    "/questions",
    response_class=StreamingResponse,
    responses={
        status.HTTP_200_OK: {
            "description": "Streams LLM response tokens and metadata",
        },
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "description": "Request body validation failed"
        },
    },
    summary="Ask a question to the RAG assistant",
    description=dedent("""
Embeds the question, retrieves semantically close document chunks,
and streams the LLM answer token by token using Server-Sent Events (SSE).
"""),
)
async def ask_question(
    *,
    session: AsyncSession = Depends(get_session),
    settings: Annotated[Settings, Depends(get_settings)],
    body: AskQuestionRequest,
):
    embedded_question = await embedding.embed_question(body.question, settings)
    close_chunks = await embedding.get_close_chunks(session, embedded_question)
    context_chunks = [chunk["content"] for chunk in close_chunks]

    async def event_generator():
        for chunk in close_chunks:
            source_payload = {
                "attachment_id": chunk["id"],
                "file_name": chunk["document_name"],
                "page": chunk["page"],
            }
            yield f"event: source\ndata: {json.dumps(source_payload)}\n\n"

        async for token in llm.query(body.question, context_chunks, settings):
            yield f"event: token\ndata: {json.dumps(token)}\n\n"

        yield "event: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
