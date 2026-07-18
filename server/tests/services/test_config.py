import pytest
from pydantic import ValidationError

from app.config import Settings


def test_reranker_is_disabled_with_provider_defaults(settings):
    assert settings.reranker_enabled is False
    assert settings.voyage_api_key is None
    assert settings.reranker_model == "rerank-2.5"
    assert settings.reranker_timeout_seconds == 1.5


def test_enabled_reranker_requires_voyage_api_key(settings):
    values = settings.model_dump()
    values.update(reranker_enabled=True, voyage_api_key=None)

    with pytest.raises(ValidationError, match="VOYAGE_API_KEY"):
        Settings(**values)
