from unittest.mock import MagicMock, patch
from app.services.embedding import embed_question


def test_embed_question_returns_first_embedding(monkeypatch):
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "key")
    monkeypatch.setenv("AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT", "dep")
    monkeypatch.setenv("AZURE_OPENAI_API_VERSION", "2024-01-01")

    client = MagicMock()
    client.embeddings.create.return_value = MagicMock(
        data=[MagicMock(embedding=[0.0, 1.0, 0.45])]
    )

    with patch("app.services.embedding.AzureOpenAI", return_value=client):
        assert embed_question("hello") == [0.0, 1.0, 0.45]
