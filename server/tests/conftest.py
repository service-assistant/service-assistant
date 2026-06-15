import os
import pytest
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

load_dotenv(
    dotenv_path=os.path.join(
        os.path.dirname(__file__),
        "..",
        ".env.test",
    ),
)

TEST_DATABASE_URL = os.environ["DATABASE_URL"]


@pytest.fixture(scope="session", autouse=True)
def run_migrations():
    # Remember that it leaves tests with all migrations done at the end
    # and it doesn't roll them back. If you encounter error because
    # of manually rolling back some migrations, maybe it's worth
    # resetting test db state (make reset-test-db)
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


@pytest.fixture(autouse=True)
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


@pytest.fixture
async def session(engine):
    async with AsyncSession(engine, expire_on_commit=False) as s:
        yield s
