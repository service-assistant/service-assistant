import json

from app.models import Message

CONTINUATION_HINTS = {"kontynuuj", "dalej", "rozwiń", "więcej", "ciągnij"}


def sse(event: str, payload: object) -> str:
    if isinstance(payload, str):
        data = payload
    else:
        data = json.dumps(payload, ensure_ascii=False)
    normalized_data = data.replace("\r\n", "\n").replace("\r", "\n")
    data_lines = "\n".join(f"data: {line}" for line in normalized_data.split("\n"))
    return f"event: {event}\n{data_lines}\n\n"


def looks_like_continuation(content: str) -> bool:
    lower = content.lower().strip()
    return len(lower.split()) <= 4 or any(hint in lower for hint in CONTINUATION_HINTS)


def is_explicit_continuation(content: str) -> bool:
    normalized = content.lower().strip().rstrip(".!?")
    return normalized in {"co dalej", "dalej", "kontynuuj"}


def diagnostic_plan_cache_key(message: Message) -> str:
    return f"{message.thread_id}:{message.id}"
