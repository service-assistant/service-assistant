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
            "description": "Streams LLM response tokens as plain text chunks.",
        },
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "description": "Request body validation failed"
        },
    },
    summary="Ask a question to the RAG assistant",
    description=dedent("""
Embeds the question, retrieves semantically close document chunks,
and streams the LLM answer token by token using Server-Sent Events (SSE).

To consume the stream on the client side:

```
const response = await fetch("<url>", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "<question>" })
});
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const token = decoder.decode(value);
    appendToUI(token);
}
```
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

    async def event_generator():
        async for token in llm.query(body.question, close_chunks, settings):
            yield f"data: {json.dumps(token)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
