from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str
    database_url: str
    azure_openai_endpoint: str
    azure_openai_api_key: str
    azure_openai_embeddings_deployment: str
    openai_api_key: str
    openai_chat_model: str
    azure_openai_api_version: str
    attachments_dir: Path

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore
