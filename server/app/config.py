from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str
    database_url: str
    azure_openai_endpoint: str
    azure_openai_api_key: str
    azure_openai_embeddings_deployment: str
    azure_openai_api_version: str

    model_config = SettingsConfigDict(env_file=".env")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore
