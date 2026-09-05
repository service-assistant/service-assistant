import re

from openai import AsyncOpenAI

from app.config import Settings

# Match complete candidate tokens, including separators that are currently not
# supported. Including ``/`` and ``_`` here prevents protecting only a numeric
# fragment of a token such as ``ERR_102`` or ``A/102``.
CODE_TOKEN_RE = re.compile(r"[A-Za-z0-9]+(?:[-:._/][A-Za-z0-9]+)*")
PLACEHOLDER_RE = re.compile(r"__CODE_\d+__")

_TRANSLATION_PROMPT = """Translate the following query into English.
Return only the translated text, nothing else.

Query:
{query}"""


class TranslationError(Exception):
    """Raised when placeholder protection cannot be safely restored."""


def _has_digit(text: str) -> bool:
    return any(ch.isdigit() for ch in text)


def protect_codes(query: str) -> tuple[str, dict[str, str]]:
    """Replace technical codes in the query with placeholders.

    Only tokens that contain at least one digit and use the separators
    ``-``, ``:`` or ``.`` (or are plain digit sequences) are protected.
    Tokens containing ``/`` or ``_`` are intentionally left untouched.
    """
    placeholders: dict[str, str] = {}

    def _replace(match: re.Match[str]) -> str:
        token = match.group(0)
        if not _has_digit(token) or "/" in token or "_" in token:
            return token
        placeholder = f"__CODE_{len(placeholders)}__"
        placeholders[placeholder] = token
        return placeholder

    masked = CODE_TOKEN_RE.sub(_replace, query)
    return masked, placeholders


def restore_codes(translated: str, placeholders: dict[str, str]) -> str:
    """Restore original code values from placeholders.

    Raises ``TranslationError`` if any placeholder disappeared, changed,
    or if the translator introduced new placeholders.
    """
    expected = set(placeholders.keys())
    found = set(PLACEHOLDER_RE.findall(translated))
    if expected != found:
        raise TranslationError(
            f"Placeholder mismatch: expected {sorted(expected)}, found {sorted(found)}"
        )

    result = translated
    for placeholder, original in placeholders.items():
        result = result.replace(placeholder, original)
    return result


async def translate_query(
    query: str,
    settings: Settings,
    *,
    target_language: str = "en",
) -> str:
    """Translate a user query to the document language.

    Falls back to the original query on any API or placeholder-protection
    failure so that retrieval can still run.
    """
    if not query.strip():
        return query

    masked_query, placeholders = protect_codes(query)

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    prompt = _TRANSLATION_PROMPT.format(query=masked_query)

    try:
        response = await client.responses.create(
            model=settings.openai_chat_model,
            input=prompt,
        )
    except Exception:
        return query

    translated = response.output_text.strip()
    if not placeholders:
        return translated

    try:
        return restore_codes(translated, placeholders)
    except TranslationError:
        return query
