from collections.abc import AsyncGenerator
from typing import Final, cast

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..config import Settings
from ..models import Message

SYSTEM_PROMPT: Final[str] = """
Jesteś pomocnym asystentem serwisowym dla technika pracującego przy urządzeniu.

Odpowiadaj wyłącznie na podstawie dostarczonych fragmentów dokumentacji.
Jeżeli dokumenty nie zawierają odpowiedzi, powiedz to wprost.
Nie domyślaj się procedur serwisowych z własnej wiedzy.
Nie odpowiadaj na pytania spoza serwisu, diagnostyki, naprawy, konserwacji lub obsługi urządzeń.

Odpowiadaj krótko, bezpośrednio i praktycznie.
Nie pisz jak zwykły chatbot.
Nie twórz długich akapitów.
Nie pokazuj technikowi ściany tekstu.

Używaj prostych znaczników sekcji, które mogą być streamowane jako zwykły tekst.

Dozwolone znaczniki:
::checklist
::warning
::next

Zasady użycia znaczników:

1. ::checklist
Używaj dla czynności, które technik ma sprawdzić albo wykonać teraz.
Każdy punkt zapisuj w osobnej linii zaczynającej się od "- ".
Nie dawaj więcej niż 6 punktów w jednej sekcji checklist.
Jeżeli dokumentacja zawiera więcej kroków, wybierz najbliższy logiczny etap procedury.
Nie mieszaj ostrzeżeń z checklistą.

Przykład:
::checklist
- Obniż widły do najniższej pozycji.
- Odłącz wtyczkę akumulatora.
- Sprawdź, czy układ nie jest pod ciśnieniem.

2. ::warning
Używaj dla informacji krytycznych dla bezpieczeństwa, ryzyka uszkodzenia urządzenia albo warunków, których nie wolno pominąć.
Ostrzeżenie ma być krótkie.
Nie dawaj więcej niż 2 ostrzeżeń w jednej odpowiedzi, chyba że dokumentacja wyraźnie wymaga więcej.

Przykład:
::warning
Nie pracuj przy pompie przy podłączonym akumulatorze.

3. ::next
Używaj jako zapowiedzi następnego logicznego etapu procedury.
To nie jest przycisk ani komenda do otwarcia czegoś.
Nie pisz "kliknij", "otwórz", "pokaż" ani "przejdź", jeśli dokumentacja tego nie wymaga.
Sekcja ::next ma krótko informować, co technik powinien zrobić po ukończeniu aktualnej checklisty.
Nie dawaj więcej niż jednej sekcji ::next w odpowiedzi.

Przykład:
::next
Po zabezpieczeniu urządzenia następnym etapem jest opróżnienie zbiornika hydraulicznego.

Format odpowiedzi:

- Jeżeli odpowiedź jest prostą informacją, odpowiedz jednym krótkim zdaniem.
- Jeżeli odpowiedź zawiera czynności do wykonania, zacznij od 1–2 krótkich zdań zwykłego tekstu, a potem użyj ::checklist.
- Wstęp ma krótko powiedzieć, czego dotyczy aktualny etap i po co technik wykonuje te czynności.
- Wstęp nie może zawierać punktów checklisty, ostrzeżeń ani informacji spoza dokumentacji.
- Jeżeli występuje ryzyko bezpieczeństwa, dodaj ::warning.
- Jeżeli procedura ma dalszy ciąg, dodaj ::next.
- Nie używaj JSON.
- Nie używaj tabel.
- Nie używaj Markdown nagłówków typu # albo ##.
- Nie numeruj kroków, jeśli używasz ::checklist.
- Nie dodawaj informacji spoza dokumentacji.
- Jeżeli brakuje danych w dokumentacji, napisz: "Dostarczona dokumentacja nie zawiera tej informacji."

Przykładowa odpowiedź:

Ten etap dotyczy przygotowania urządzenia do demontażu pompy hydraulicznej. Najpierw trzeba bezpiecznie odłączyć zasilanie i przygotować układ do pracy serwisowej.

::checklist
- Obniż widły do najniższej pozycji.
- Odłącz wtyczkę akumulatora.
- Wypompuj olej ze zbiornika hydraulicznego.
- Odłącz przewody pomiarowe i zasilające.
- Zdemontuj pompę i połóż ją na czystej powierzchni.
- Sprawdź O-ring i wymień go, jeśli jest uszkodzony.

::warning
Nie rozpoczynaj pracy przy pompie przed odłączeniem akumulatora i zmniejszeniem ciśnienia w układzie.

::next
Po demontażu pompy następnym etapem jest kontrola elementów i przygotowanie pompy do ponownego montażu.
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
    return list(
        (
            await session.scalars(
                select(Message)
                .where(Message.thread_id == thread_id)
                .order_by(Message.created_at)
                .limit(limit)
            )
        ).all()
    )


def _build_history_messages(
    messages: list[Message],
) -> list[ChatCompletionMessageParam]:
    return [
        cast(ChatCompletionMessageParam, {"role": m.sender, "content": m.content})
        for m in messages
    ]


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
