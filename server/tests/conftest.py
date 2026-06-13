import os
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

TEST_DATABASE_URL = (
    "postgresql+psycopg://postgres:postgres@localhost:5433/service_assistant_test"
)

# Must be set before any app module is imported, because main.py calls
# get_settings() at module level to configure CORS middleware.
os.environ.setdefault("ENV", "test")
os.environ.setdefault("AZURE_OPENAI_ENDPOINT", "https://test.example.com")
os.environ.setdefault("AZURE_OPENAI_API_KEY", "test-key")
os.environ.setdefault("AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT", "test-deployment")
os.environ.setdefault("AZURE_OPENAI_API_VERSION", "2024-01-01")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("OPENAI_CHAT_MODEL", "gpt-4o-mini")
os.environ.setdefault("AUTH_TOKEN", "CHANGEMELATER")
os.environ.setdefault("DATABASE_URL", TEST_DATABASE_URL)
os.environ.setdefault("ATTACHMENTS_DIR", "/tmp/attachments")


@pytest.fixture(scope="session", autouse=True)
def run_migrations():
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session")
def engine():
    return create_async_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,
    )


@pytest.fixture(autouse=True, scope="function")
async def clean_db(engine):
    """Used to have clean database state after each test"""
    yield
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                TRUNCATE TABLE 
                    chunks_messages, 
                    chunks,
                    attachments_devices, 
                    messages, 
                    chat_threads, 
                    attachments, 
                    devices, 
                    brands, 
                    device_types 
                RESTART IDENTITY CASCADE
                """
            )
        )


@pytest.fixture(autouse=True, scope="function")
def override_attachments_dir(tmp_path):
    from app.config import get_settings
    from app.main import app

    test_settings = get_settings().model_copy(update={"attachments_dir": tmp_path})
    app.dependency_overrides[get_settings] = lambda: test_settings
    yield
    app.dependency_overrides.pop(get_settings, None)


@pytest.fixture
async def session(engine):
    async with AsyncSession(engine, expire_on_commit=False) as s:
        yield s
