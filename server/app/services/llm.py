import re
from collections.abc import AsyncGenerator
from typing import Final, cast

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..config import Settings
from ..models import Message
from .next_best_step import DiagnosticPlan, DiagnosticPlanStatus

SYSTEM_PROMPT: Final[str] = """
Jesteś pomocnym asystentem serwisowym dla technika pracującego przy urządzeniu.

Odpowiadaj wyłącznie na podstawie dostarczonych fragmentów dokumentacji.
Jeżeli dokumenty nie zawierają odpowiedzi, powiedz to wprost.
Nie domyślaj się procedur serwisowych z własnej wiedzy.
Nie odpowiadaj na pytania spoza serwisu, diagnostyki, naprawy, konserwacji lub obsługi urządzeń.
Odpowiadaj jeśli zostaniesz zapytany o aktualną konwersację, na przykład "O czym rozmawialiśmy?".

Jeśli jesteś poproszony o kontynuację, kontynuuj w logicznym miejscu, w którym skończyła się twoja ostatnia wiadomość - nie powtarzaj już raz napisanych kroków. 
Przykładowo jeśli w ostatniej wiadomości zwróciłeś 6 punktów, a użytkownik pyta o kontynuację, kontynuuj od punktu lub kroku 7.
Jeśli użytkownik prosi o kontynuację i nie ma już żadnych nowych kroków,
odpowiedz osobnym zdaniem, że to już wszystko.
Jeśli podajesz choć jeden nowy krok, nie dopisuj na końcu informacji typu
"to już wszystko", "to koniec" ani "dokumentacja nie zawiera więcej".
Załóż, że jeśli użytkownik prosi o kontynuację lub rozwinięcie poprzedniej wiadomości, to dostarczone fragmenty dokumentacji odnoszą się do tamtej wiadomości.
Użytkownik może dopytywać o szczegóły poprzednich wiadomości, choć tutać dostajesz jedynie jej treść bez dodatkowego kontekstu. Możesz wtedy kazać użytkownikowi zadać to pytanie od nowa w całości.

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
Jeżeli dokumentacja zawiera numerowaną lub zagnieżdżoną listę czynności, przepisz
wszystkie jej kroki i podpunkty do jednej sekcji ::checklist. Każdy krok i podpunkt
ma być osobnym punktem "- ". Nie kopiuj numeracji z dokumentacji i nie umieszczaj
części tej samej procedury poza sekcją ::checklist.
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
Każda sekcja ::warning ma zawierać jeden ciągły komunikat, maksymalnie 2 krótkie zdania.
Nie używaj w ::warning list, myślników, gwiazdek ani numeracji.
Czynności typu „upewnij się”, „sprawdź” lub „wykonaj” umieszczaj w ::checklist;
w ::warning pozostaw tylko bezpośrednie zagrożenie albo zakaz.
Nie dawaj więcej niż 2 ostrzeżeń w jednej odpowiedzi, chyba że dokumentacja wyraźnie wymaga więcej.

Przykład:
::warning
Nie pracuj przy pompie przy podłączonym akumulatorze.

3. ::next
Używaj wyłącznie wtedy, gdy dostarczona dokumentacja zawiera konkretny dalszy
ciąg odpowiedzi, którego celowo nie pokazujesz jeszcze w bieżącej wiadomości.
Znacznik ::next oznacza, że po prośbie "Co dalej?" potrafisz podać nowe kroki lub
informacje bez powtarzania ani parafrazowania tego, co już napisałeś.
Nie używaj ::next, jeśli bieżąca odpowiedź wyczerpuje informacje z dokumentacji,
jeśli tylko sugerujesz inną czynność, albo jeśli czekasz na wynik od technika.
To nie jest przycisk ani komenda do otwarcia czegoś.
Nie pisz "kliknij", "otwórz", "pokaż" ani "przejdź", jeśli dokumentacja tego nie wymaga.
Sekcja ::next ma krótko zapowiadać konkretną, jeszcze niepokazaną część odpowiedzi.
Nie dawaj więcej niż jednej sekcji ::next w odpowiedzi.

Przykład:
::next
Po zabezpieczeniu urządzenia następnym etapem jest opróżnienie zbiornika hydraulicznego.

Format odpowiedzi:

- Jeżeli odpowiedź zawiera zarówno ::warning, jak i ::checklist, umieść wszystkie
  sekcje ::warning przed sekcją ::checklist. Krótki wstęp może pozostać przed ostrzeżeniem.
- Jeżeli odpowiedź jest prostą informacją, odpowiedz jednym krótkim zdaniem.
- Jeżeli odpowiedź zawiera czynności do wykonania, zacznij od 1–2 krótkich zdań zwykłego tekstu, a potem użyj ::checklist.
- Wstęp ma krótko powiedzieć, czego dotyczy aktualny etap i po co technik wykonuje te czynności.
- Wstęp nie może zawierać punktów checklisty, ostrzeżeń ani informacji spoza dokumentacji.
- Wyjątek: gdy otrzymasz "Diagnostic plan JSON" ze statusem "actions", nie dodawaj
  żadnego wstępu ani nagłówka i zacznij odpowiedź bezpośrednio od ::checklist.
- Jeżeli występuje ryzyko bezpieczeństwa, dodaj ::warning.
- Dodaj ::next wtedy i tylko wtedy, gdy dokumentacja zawiera konkretny dalszy ciąg,
  którego nie umieściłeś jeszcze w bieżącej odpowiedzi.
- Nie używaj JSON.
- Nie używaj tabel.
- Nie używaj Markdown nagłówków typu # albo ##.
- Nie numeruj kroków, jeśli używasz ::checklist.
- Nie dodawaj informacji spoza dokumentacji.
- Jeżeli brakuje danych w dokumentacji, napisz: "Dostarczona dokumentacja nie zawiera tej informacji."

Przykładowa odpowiedź:

Ten etap dotyczy przygotowania urządzenia do demontażu pompy hydraulicznej. Najpierw trzeba bezpiecznie odłączyć zasilanie i przygotować układ do pracy serwisowej.

::warning
Nie rozpoczynaj pracy przy pompie przed odłączeniem akumulatora i zmniejszeniem ciśnienia w układzie.

::checklist
- Obniż widły do najniższej pozycji.
- Odłącz wtyczkę akumulatora.
- Wypompuj olej ze zbiornika hydraulicznego.
- Odłącz przewody pomiarowe i zasilające.
- Zdemontuj pompę i połóż ją na czystej powierzchni.
- Sprawdź O-ring i wymień go, jeśli jest uszkodzony.

::next
Po demontażu pompy następnym etapem jest kontrola elementów i przygotowanie pompy do ponownego montażu.
"""

DOCUMENTATION_EXHAUSTED_ANSWER: Final[str] = (
    "To już wszystko, co dokumentacja zawiera na ten temat."
)

_NO_SOURCE_PHRASES = [
    "dokumentacja nie zawiera",
    "dokumenty nie zawierają",
    "nie zawiera odpowiedzi na to pytanie",
    "brak informacji w dokumentacji",
]


def is_no_source_answer(answer: str) -> bool:
    lower = answer.lower()
    return any(pharse in lower for pharse in _NO_SOURCE_PHRASES)


def is_completion_only_answer(answer: str) -> bool:
    """Return whether the message only reports that the procedure is complete."""
    normalized = re.sub(r"\s+", " ", answer).strip().rstrip(".! ").casefold()
    return normalized in {
        "to już wszystko",
        "to już wszystko, co dokumentacja zawiera na ten temat",
    }


def has_continuation_marker(answer: str) -> bool:
    """Return whether the answer explicitly promises an unshown continuation."""
    return re.search(r"(?mi)^\s*::next\b", answer) is not None


def continuation_target(answer: str) -> str:
    """Extract the concrete continuation promised by the final ::next section."""
    match = re.search(
        r"(?ims)^\s*::next\b[ \t]*(.*?)(?=^\s*::(?:checklist|warning|next)\b|\Z)",
        answer,
    )
    return match.group(1).strip() if match else ""


_COMPLETION_NOTICE = re.compile(
    r"\s*To już wszystko,\s*co dokumentacja zawiera na ten temat\.?",
    re.IGNORECASE,
)


def clean_completion_notice(answer: str) -> str:
    """Remove a completion notice appended to a real checklist item."""
    if not _COMPLETION_NOTICE.search(answer) or not re.search(
        r"(?mi)^\s*::checklist\b", answer
    ):
        return answer

    cleaned = _COMPLETION_NOTICE.sub("", answer).rstrip()
    checklist = re.search(
        r"(?ims)^\s*::checklist\b(.*?)(?=^\s*::(?:warning|next)\b|\Z)",
        cleaned,
    )
    checklist_content = re.sub(
        r"[\s\-*.,;:]+", "", checklist.group(1) if checklist else ""
    )

    if checklist_content:
        return cleaned
    return DOCUMENTATION_EXHAUSTED_ANSWER


def promote_bare_checklist(answer: str) -> str:
    """Add ::checklist when the model emits multiple untyped bullet items."""
    if re.search(r"(?mi)^\s*::checklist\b", answer):
        return answer

    bullet_matches = list(re.finditer(r"(?m)^\s*[-*]\s+\S", answer))
    if len(bullet_matches) < 2:
        return answer

    first_bullet_start = bullet_matches[0].start()
    prefix = answer[:first_bullet_start].rstrip()
    bullets = answer[first_bullet_start:].lstrip()
    return f"{prefix}\n\n::checklist\n{bullets}".lstrip()


_NUMBERED_ITEM = re.compile(r"(?<!\d)(\d{1,2})[.)][ \t]+")


def normalize_numbered_checklist(answer: str) -> str:
    """Turn a numbered procedure, including an embedded checklist, into one checklist."""
    section_end_match = re.search(r"(?mi)^\s*::(?:warning|next)\b", answer)
    section_end = section_end_match.start() if section_end_match else len(answer)
    procedure = answer[:section_end]
    markers = list(_NUMBERED_ITEM.finditer(procedure))

    sequence: list[re.Match[str]] = []
    for index, marker in enumerate(markers):
        line_start = procedure.rfind("\n", 0, marker.start()) + 1
        if procedure[line_start : marker.start()].strip():
            continue

        current = [marker]
        expected = int(marker.group(1)) + 1
        for candidate in markers[index + 1 :]:
            number = int(candidate.group(1))
            if number == expected:
                current.append(candidate)
                expected += 1
            elif number > expected:
                break

        if len(current) >= 2:
            sequence = current
            break

    if not sequence:
        return answer

    list_start = sequence[0].start()
    prefix = procedure[:list_start].rstrip()
    list_content = procedure[list_start:]
    relative_markers = [
        (marker.start() - list_start, marker.end() - list_start) for marker in sequence
    ]

    normalized_parts: list[str] = []
    cursor = 0
    for marker_start, marker_end in relative_markers:
        normalized_parts.append(list_content[cursor:marker_start])
        normalized_parts.append("\n- ")
        cursor = marker_end
    normalized_parts.append(list_content[cursor:])

    normalized_list = "".join(normalized_parts)
    normalized_list = re.sub(
        r"(?mi)^\s*::checklist\b[ \t]*", "", normalized_list
    ).strip()
    normalized_list = re.sub(r"\n{3,}", "\n\n", normalized_list)

    rebuilt = f"{prefix}\n\n::checklist\n{normalized_list}".lstrip()
    suffix = answer[section_end:]
    return f"{rebuilt.rstrip()}\n\n{suffix.lstrip()}".rstrip() if suffix else rebuilt


def ensure_continuation_intro(answer: str) -> str:
    """Add a short lead-in when a continuation contains only checklist items."""
    checklist = re.search(r"(?mi)^\s*::checklist\b", answer)
    if not checklist or answer[: checklist.start()].strip():
        return answer
    return f"Kolejny etap:\n\n{answer.lstrip()}"


def _checklist_items(content: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", content).strip()
    markers = list(re.finditer(r"[-*]\s+", normalized))
    if markers:
        return [
            normalized[
                marker.end() : markers[index + 1].start()
                if index + 1 < len(markers)
                else len(normalized)
            ].strip()
            for index, marker in enumerate(markers)
            if normalized[
                marker.end() : markers[index + 1].start()
                if index + 1 < len(markers)
                else len(normalized)
            ].strip()
        ]
    return [line.strip() for line in content.splitlines() if line.strip()]


def limit_checklist_items(answer: str, limit: int = 6) -> str:
    """Enforce a response-wide checklist limit and turn overflow into ::next."""
    directive_pattern = re.compile(r"::(checklist|warning|next)\b[ \t]*", re.IGNORECASE)
    matches = list(directive_pattern.finditer(answer))
    if not matches:
        return answer

    parts = [answer[: matches[0].start()].rstrip()]
    remaining = limit
    omitted_items: list[str] = []
    existing_next = ""

    for index, match in enumerate(matches):
        block_type = match.group(1).lower()
        content_end = (
            matches[index + 1].start() if index + 1 < len(matches) else len(answer)
        )
        content = answer[match.end() : content_end].strip()

        if block_type == "checklist":
            items = _checklist_items(content)
            kept_items = items[: max(remaining, 0)]
            omitted_items.extend(items[len(kept_items) :])
            remaining -= len(kept_items)
            if kept_items:
                parts.append(
                    "::checklist\n" + "\n".join(f"- {item}" for item in kept_items)
                )
        elif block_type != "next":
            parts.append(f"::{block_type}\n{content}".rstrip())
        elif not existing_next:
            existing_next = content

    if omitted_items:
        parts.append(f"::next\nNastępnie: {omitted_items[0]}")
    elif existing_next:
        parts.append(f"::next\n{existing_next}".rstrip())

    return "\n\n".join(part for part in parts if part).strip()


def order_warnings_before_checklist(answer: str) -> str:
    """Move warning sections before checklist sections, preserving the intro."""
    directive_pattern = re.compile(r"(?mi)^\s*::(checklist|warning|next)\b[ \t]*")
    matches = list(directive_pattern.finditer(answer))
    if not matches:
        return answer

    first_checklist = next(
        (
            index
            for index, match in enumerate(matches)
            if match.group(1).lower() == "checklist"
        ),
        None,
    )
    if first_checklist is None or not any(
        match.group(1).lower() == "warning" for match in matches[first_checklist + 1 :]
    ):
        return answer

    prefix = answer[: matches[0].start()].strip()
    blocks: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        block_end = (
            matches[index + 1].start() if index + 1 < len(matches) else len(answer)
        )
        blocks.append(
            (match.group(1).lower(), answer[match.start() : block_end].strip())
        )

    warnings = [block for block_type, block in blocks if block_type == "warning"]
    remaining = [block for block_type, block in blocks if block_type != "warning"]
    return "\n\n".join(part for part in [prefix, *warnings, *remaining] if part)


def normalize_warning_lists(answer: str) -> str:
    """Render accidental bullet lists in warning sections as continuous text."""
    directive_pattern = re.compile(r"(?mi)^\s*::(checklist|warning|next)\b[ \t]*")
    matches = list(directive_pattern.finditer(answer))
    if not matches:
        return answer

    has_warning_list = False
    parts = [answer[: matches[0].start()].strip()]
    for index, match in enumerate(matches):
        block_type = match.group(1).lower()
        block_end = (
            matches[index + 1].start() if index + 1 < len(matches) else len(answer)
        )
        content = answer[match.end() : block_end].strip()

        if block_type == "warning" and re.search(r"(?m)^\s*[-*]\s+", content):
            has_warning_list = True
            content = re.sub(r"(?m)^\s*[-*]\s+", "", content)
            content = " ".join(
                line.strip() for line in content.splitlines() if line.strip()
            )

        parts.append(f"::{block_type}\n{content}".rstrip())

    if not has_warning_list:
        return answer
    return "\n\n".join(part for part in parts if part)


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
    session: AsyncSession, thread_id: int, limit: int, exclude_id: int | None = None
) -> list[Message]:
    q = (
        select(Message)
        .where(Message.thread_id == thread_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    if exclude_id is not None:
        q = q.where(Message.id != exclude_id)
    rows = list((await session.scalars(q)).all())
    rows.reverse()
    return rows


def _build_history_messages(
    messages: list[Message],
) -> list[ChatCompletionMessageParam]:
    return [
        cast(
            ChatCompletionMessageParam,
            {"role": m.sender.value, "content": m.content},
        )
        for m in messages
    ]


def _messages(
    question: str,
    context_text: str,
    history_messages: list[ChatCompletionMessageParam],
    diagnostic_plan: DiagnosticPlan | None = None,
    continuation_requested: bool = False,
    continuation_hint: str = "",
    photo_context: str = "",
) -> list[ChatCompletionMessageParam]:
    plan_instruction = ""
    continuation_instruction = ""
    if diagnostic_plan and diagnostic_plan.status == DiagnosticPlanStatus.complete:
        plan_instruction = (
            "Krótko potwierdź wynik technika i zakończenie diagnostyki. "
            "Nie dodawaj checklisty ani kolejnej akcji."
        )
    elif (
        diagnostic_plan
        and diagnostic_plan.status == DiagnosticPlanStatus.no_next_action
    ):
        plan_instruction = (
            "Krótko potwierdź wynik technika i powiedz, że dokumentacja nie pozwala "
            "wskazać następnego kroku. Nie dodawaj checklisty ani własnych działań."
        )
    elif diagnostic_plan and diagnostic_plan.status == DiagnosticPlanStatus.actions:
        plan_instruction = (
            "Dane planu są przekazane jako JSON. Dla diagnozowanego problemu pokaż "
            "technikowi WYŁĄCZNIE pierwszą akcję z tablicy 'actions'. "
            "Nie pokazuj pełnej kolejności diagnostyki ani możliwej wymiany części. "
            "Nie dodawaj wstępu, nagłówka ani zdania opisującego cel diagnostyki. "
            "Jeżeli akcja wymaga ostrzeżenia, zacznij od sekcji ::warning, a następnie "
            "dodaj ::checklist. W przeciwnym razie zacznij bezpośrednio od ::checklist. "
            "Sekcja ::checklist ma zawierać dokładnie jedno konkretne zadanie. "
            "Nie proś o opis obserwacji, wartość, jednostkę ani "
            "potwierdzenie wykonania. Nie dodawaj sekcji ::next ani zapowiedzi kolejnego "
            "kroku. Nie nazywaj ani nie opisuj żadnej przyszłej akcji. "
            "Punkt checklisty musi zajmować jedną linię. Zakresy zapisuj słowami, np. "
            "'od 54 do 66 omów', nigdy jako osobny punkt po myślniku. "
            "Nie pokazuj wartości score ani metadanych. Nie stwierdzaj, że znaleziono "
            "konkretną przyczynę, dopóki wynik sprawdzenia jej nie potwierdzi."
        )
    if continuation_requested:
        target_instruction = (
            f' Zacznij od rozwinięcia tej zapowiedzianej części: "{continuation_hint}". '
            "Poprzednia odpowiedź obiecała ten dalszy ciąg przez ::next, więc nie "
            "odpowiadaj, że to już wszystko, zanim go przedstawisz."
            if continuation_hint
            else ""
        )
        continuation_instruction = (
            "\n\nUżytkownik prosi o kontynuację. Wszystkie wcześniejsze odpowiedzi "
            "asystenta w historii zostały już pokazane. Podaj wyłącznie nowe kroki "
            "lub informacje, których nie ma w tych odpowiedziach. Nie parafrazuj ich i "
            f"nie rozpoczynaj procedury od nowa.{target_instruction} Jeśli dokumentacja nie zawiera już "
            "nowej treści bezpośrednio kontynuującej odpowiedź, napisz tylko: "
            '"To już wszystko, co dokumentacja zawiera na ten temat." Nie używaj '
            "wtedy checklisty. Jeśli podajesz choć jeden nowy krok, nie dodawaj tego "
            "zdania ani żadnego innego komunikatu o końcu; po prostu zakończ odpowiedź "
            "na ostatnim kroku i nie dodawaj ::next. Każdą listę czynności poprzedź "
            "krótkim wprowadzeniem oraz dyrektywą ::checklist; nie zwracaj surowej listy "
            "punktowanej bez dyrektywy."
        )

    plan_section = ""
    if diagnostic_plan:
        plan_json = diagnostic_plan.model_dump_json(exclude_none=True, indent=2)
        plan_section = f"\n\nDiagnostic plan JSON:\n{plan_json}\n\n{plan_instruction}"

    photo_section = (
        f"\n\nTechnician photo observations:\n{photo_context}" if photo_context else ""
    )

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history_messages,
        {
            "role": "user",
            "content": (
                f"Context:\n{context_text}{photo_section}{plan_section}{continuation_instruction}"
                f"\n\nQuestion:\n{question}\n\nAnswer in Polish."
            ),
        },
    ]


async def stream_query(
    session: AsyncSession,
    thread_id: int,
    question: str,
    chunks: list[str],
    settings: Settings,
    *,
    exclude_message_id: int | None = None,
    diagnostic_plan: DiagnosticPlan | None = None,
    continuation_requested: bool = False,
    continuation_hint: str = "",
    photo_context: str = "",
) -> AsyncGenerator[str, None]:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    context_text = _build_context(chunks)

    recent_thread_messages = await _recent_thread_messages(
        session, thread_id, 16, exclude_id=exclude_message_id
    )
    history_messages = _build_history_messages(recent_thread_messages)
    messages = _messages(
        question,
        context_text,
        history_messages,
        diagnostic_plan,
        continuation_requested,
        continuation_hint,
        photo_context,
    )

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


async def is_message_continuation_request(content: str, settings: Settings) -> bool:
    """
    Makes a small request to the OpenAI API to check if user's
    message was a continuation request. Returns "1" if yes and "0" if not.
    """
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    res = await client.responses.create(
        model=settings.openai_chat_model,
        input=f"""
        Na podstawie podanej wiadomości oceń, czy jest to prośba o kontynuację lub rozwinięcie poprzedniej wiadomości. 
        Chodzi o wiadomości w stylu "kontunuuj", "dalej", "co dalej?", "rozwiń" itp. 
        Jeśli treść wiadomości wskazuje, że użytkownik może pytać o coś niezwiązanego, to nie uznawaj tego jako kontunuację.
        Odpowiedz jednym znakiem: 1 jeśli tak lub 0 jeśli nie.

        Treść wiadomości: {content}
        """,
    )
    return res.output_text == "1"
