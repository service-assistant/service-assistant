from typing import Final

from openai import AsyncOpenAI

from ..config import Settings

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


async def query(question: str, chunks: list[str], settings: Settings) -> str:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    context_text = _build_context(chunks)

    response = await client.chat.completions.create(
        model=settings.openai_chat_model,
        stream=False,
        temperature=0.2,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Context:\n{context_text}\n\nQuestion:\n{question}\n\nAnswer in Polish.",
            },
        ],
    )

    return response.choices[0].message.content or ""
