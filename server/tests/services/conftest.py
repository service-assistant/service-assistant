import pytest

from app.config import Settings


@pytest.fixture
def settings(tmp_path):
    return Settings(
        env="test",
        database_url="postgresql://localhost/test",
        azure_openai_endpoint="https://example",
        azure_openai_api_key="key",
        azure_openai_embeddings_deployment="dep",
        azure_openai_api_version="2024-01-01",
        openai_chat_model="gpt-4o-mini",
        openai_api_key="test-openai-key",
        attachments_dir=tmp_path,
        auth_token="token",
    )
