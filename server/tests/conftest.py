import os

# Must be set before any app module is imported, because main.py calls
# get_settings() at module level to configure CORS middleware.
os.environ.setdefault("ENV", "test")
os.environ.setdefault("AZURE_OPENAI_ENDPOINT", "https://test.example.com")
os.environ.setdefault("AZURE_OPENAI_API_KEY", "test-key")
os.environ.setdefault("AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT", "test-deployment")
os.environ.setdefault("AZURE_OPENAI_API_VERSION", "2024-01-01")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("OPENAI_CHAT_MODEL", "gpt-4o-mini")
