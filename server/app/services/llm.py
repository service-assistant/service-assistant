from collections.abc import AsyncGenerator
from typing import Final

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
# from sqlmodel import select

from ..config import Settings
from ..models import Message

SYSTEM_PROMPT: Final[str] = """
Jesteś pomocnym asystentem serwisowym.
Odpowiadaj na podstawie dostarczonych fragmentów dokumentacji.
Jeżeli dokumenty nie zawierają odpowiedzi, powiedz to wprost.
Nie domyślaj się procedur serwisowych z własnej wiedzy.
Odpowiadaj krótko i bezpośrednio, prodedury możesz podawać w ponumerowanych krokach.
Nie odpowiadaj na pytania spoza serwisu/naprawy urządzeń.
"""


def _build_context(chunks: list[str], max_chars: int = 12000) -> str:
    parts: list[str] = []
    total = 0
    for i, chunk in enumerate(chunks, start=1):
        text = chunk.strip()
        if not text:
            continue
        item = f"[Fragment {i}]\n{text}\n"
        if total + len(item) > max_chars:
            break
        parts.append(item)
        total += len(item)
    return "\n".join(parts) if parts else "No relevant context found."


async def _recent_thread_messages(
    session: AsyncSession, thread_id: int, limit: int
) -> list[Message]:
    return (
        await session.scalars(
            select(Message)
            .where(Message.thread_id == thread_id)
            .order_by(Message.created_at)
            .limit(limit)
        )
    ).all()


def _build_history_messages(
    messages: list[Message],
) -> list[ChatCompletionMessageParam]:
    return [{"role": m.sender, "content": m.content} for m in messages]


def _messages(
    question: str, context_text: str, history_messages: list[ChatCompletionMessageParam]
) -> list[ChatCompletionMessageParam]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history_messages,
        {
            "role": "user",
            "content": f"Context:\n{context_text}\n\nQuestion:\n{question}\n\nAnswer in Polish.",
        },
    ]


async def stream_query(
    session: AsyncSession,
    thread_id: int,
    question: str,
    chunks: list[str],
    settings: Settings,
) -> AsyncGenerator[str, None]:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    context_text = _build_context(chunks)

    recent_thread_messages = await _recent_thread_messages(session, thread_id, 16)
    history_messages = _build_history_messages(recent_thread_messages)
    messages = _messages(question, context_text, history_messages)

    print(messages)

    stream = await client.chat.completions.create(
        model=settings.openai_chat_model,
        stream=True,
        temperature=0.2,
        messages=messages,
    )

    async for event in stream:
        delta = event.choices[0].delta.content
        if delta:
            yield delta
