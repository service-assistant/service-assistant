import pytest

from app.services.translation import (
    TranslationError,
    protect_codes,
    restore_codes,
    translate_query,
)


def test_protect_codes_detects_and_replaces_single_code():
    masked, placeholders = protect_codes("błąd E-23")

    assert masked == "błąd __CODE_0__"
    assert placeholders == {"__CODE_0__": "E-23"}


def test_protect_codes_handles_many_codes():
    masked, placeholders = protect_codes("kody 2:002, ERR-102 i P-01")

    assert placeholders == {
        "__CODE_0__": "2:002",
        "__CODE_1__": "ERR-102",
        "__CODE_2__": "P-01",
    }
    for placeholder in placeholders:
        assert placeholder in masked


def test_protect_codes_handles_plain_digit_sequence():
    masked, placeholders = protect_codes("błąd 2002")

    assert placeholders == {"__CODE_0__": "2002"}
    assert masked == "błąd __CODE_0__"


def test_protect_codes_leaves_slash_and_underscore_untouched():
    masked, placeholders = protect_codes("kody A/B oraz C_D")

    assert placeholders == {}
    assert "A/B" in masked
    assert "C_D" in masked


def test_protect_codes_does_not_protect_numeric_fragments_after_unsupported_separators():
    query = "kody ERR_102 oraz A/102"

    masked, placeholders = protect_codes(query)

    assert masked == query
    assert placeholders == {}


def test_restore_codes_replaces_placeholders():
    result = restore_codes("error __CODE_0__ hydraulic", {"__CODE_0__": "E-23"})

    assert result == "error E-23 hydraulic"


def test_restore_codes_raises_when_placeholder_disappears():
    with pytest.raises(TranslationError):
        restore_codes("error hydraulic", {"__CODE_0__": "E-23"})


def test_restore_codes_raises_when_placeholder_changes():
    with pytest.raises(TranslationError):
        restore_codes("error __CODE_X__ hydraulic", {"__CODE_0__": "E-23"})


def test_restore_codes_raises_when_extra_placeholder_appears():
    with pytest.raises(TranslationError):
        restore_codes(
            "error __CODE_0__ __CODE_1__",
            {"__CODE_0__": "E-23"},
        )


async def test_translate_query_returns_translation_when_no_codes(mocker, settings):
    client_mock = mocker.AsyncMock()
    response_mock = mocker.MagicMock()
    response_mock.output_text = "How to reset the device?"
    client_mock.responses.create.return_value = response_mock
    mocker.patch("app.services.translation.AsyncOpenAI", return_value=client_mock)

    result = await translate_query("Jak zresetować urządzenie?", settings)

    assert result == "How to reset the device?"


async def test_translate_query_restores_codes_after_translation(mocker, settings):
    client_mock = mocker.AsyncMock()
    response_mock = mocker.MagicMock()
    response_mock.output_text = "error __CODE_0__ hydraulic"
    client_mock.responses.create.return_value = response_mock
    mocker.patch("app.services.translation.AsyncOpenAI", return_value=client_mock)

    result = await translate_query("błąd E-23 hydrauliczny", settings)

    assert result == "error E-23 hydraulic"


async def test_translate_query_fallbacks_on_api_error(mocker, settings):
    client_mock = mocker.AsyncMock()
    client_mock.responses.create.side_effect = Exception("api error")
    mocker.patch("app.services.translation.AsyncOpenAI", return_value=client_mock)

    result = await translate_query("błąd E-23", settings)

    assert result == "błąd E-23"


async def test_translate_query_fallbacks_when_placeholder_is_damaged(mocker, settings):
    client_mock = mocker.AsyncMock()
    response_mock = mocker.MagicMock()
    response_mock.output_text = "error hydraulic"  # placeholder disappeared
    client_mock.responses.create.return_value = response_mock
    mocker.patch("app.services.translation.AsyncOpenAI", return_value=client_mock)

    result = await translate_query("błąd E-23", settings)

    assert result == "błąd E-23"
