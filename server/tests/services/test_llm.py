from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import Settings
from app.services.llm import _build_context, query


def make_settings() -> Settings:
    return Settings(
        env="test",
        database_url="postgresql://localhost/test",
        azure_openai_endpoint="https://example",
        azure_openai_api_key="key",
        azure_openai_embeddings_deployment="dep",
        azure_openai_api_version="2024-01-01",
        openai_chat_model="gpt-4o-mini",
        openai_api_key="test-openai-key",
        attachments_dir=Path("/tmp"),
        auth_token="token",
    )


def test_should_build_context_with_numbered_fragments():
    result = _build_context(["First chunk content", "Second chunk content"])

    assert "[Fragment 1]" in result
    assert "First chunk content" in result
    assert "[Fragment 2]" in result
    assert "Second chunk content" in result


def test_should_return_no_context_message_when_chunks_empty():
    result = _build_context([])

    assert result == "No relevant context found."


def test_should_return_no_context_message_when_all_chunks_are_whitespace():
    result = _build_context(["   ", "\n", ""])

    assert result == "No relevant context found."


def test_should_skip_empty_and_whitespace_chunks():
    result = _build_context(["", "  ", "real content here"])

    assert result.count("[Fragment") == 1
    assert "real content here" in result


def test_should_stop_adding_chunks_when_max_chars_exceeded():
    long_chunk = "x" * 5000
    result = _build_context([long_chunk, long_chunk, long_chunk], max_chars=6000)

    assert result.count("[Fragment") == 1


def test_should_include_all_chunks_when_within_max_chars():
    result = _build_context(["short", "also short"], max_chars=500)

    assert result.count("[Fragment") == 2


@pytest.mark.asyncio
async def test_should_return_llm_response_content():
    settings = make_settings()
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "Odpowiedź asystenta"
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("app.services.llm.AsyncOpenAI", return_value=mock_client):
        result = await query("What is error E-23?", ["Fault E-23 means..."], settings)

    assert result == "Odpowiedź asystenta"
    mock_client.chat.completions.create.assert_called_once()


@pytest.mark.asyncio
async def test_should_return_empty_string_when_llm_content_is_none():
    settings = make_settings()
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = None
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("app.services.llm.AsyncOpenAI", return_value=mock_client):
        result = await query("test question", [], settings)

    assert result == ""


@pytest.mark.asyncio
async def test_should_pass_question_and_context_to_llm():
    settings = make_settings()
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "Answer"
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("app.services.llm.AsyncOpenAI", return_value=mock_client):
        await query("My question", ["context chunk"], settings)

    call_kwargs = mock_client.chat.completions.create.call_args.kwargs
    messages = call_kwargs["messages"]
    user_message = messages[1]["content"]
    assert "My question" in user_message
    assert "context chunk" in user_message
