from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
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

    reranker_enabled: bool = False
    voyage_api_key: str | None = None
    reranker_model: str = "rerank-2.5"
    reranker_timeout_seconds: float = Field(default=5.0, gt=0)

    azure_document_intelligence_endpoint: str
    azure_document_intelligence_key: str

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def validate_reranker_configuration(self) -> "Settings":
        if self.reranker_enabled and (
            not self.voyage_api_key or not self.voyage_api_key.strip()
        ):
            raise ValueError("VOYAGE_API_KEY is required when RERANKER_ENABLED is true")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore
