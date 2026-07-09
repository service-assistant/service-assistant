from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str
    database_url: str
    auth_token: str
    azure_openai_endpoint: str
    azure_openai_api_key: str
    azure_openai_embeddings_deployment: str
    openai_api_key: str
    openai_chat_model: str
    azure_openai_api_version: str
    attachments_dir: Path
    deepgram_api_key: str | None = None

    gemini_api_key: str | None = None
    gemini_tts_model: str = "gemini-2.5-flash-preview-tts"
    gemini_tts_voice: str = "Algenib"
    gemini_tts_max_chars: int = 2000

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore
