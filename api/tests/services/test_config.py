import pytest
from pydantic import ValidationError

from app.config import Settings


def test_reranker_is_disabled_with_provider_defaults(settings):
    assert settings.reranker_enabled is False
    assert settings.voyage_api_key is None
    assert settings.reranker_model == "rerank-2.5"
    assert settings.reranker_timeout_seconds == 5.0
    assert settings.azure_embeddings_max_retries == 5
    assert settings.openai_chat_model == "gpt-5.6-luna"
    assert settings.benchmark_judge_model == "gpt-5.1"
    assert settings.benchmark_chunk_judge_model == "gpt-5.6-luna"
    assert settings.benchmark_judge_reasoning_effort == "medium"


def test_enabled_reranker_requires_voyage_api_key(settings):
    values = settings.model_dump()
    values.update(reranker_enabled=True, voyage_api_key=None)

    with pytest.raises(ValidationError, match="VOYAGE_API_KEY"):
        Settings(**values)
