import asyncio
import sys

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.database import database_url_with_driver  # noqa: E402

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def pytest_asyncio_loop_factories(config, item):
    if sys.platform == "win32":
        return {"selector": asyncio.SelectorEventLoop}
    return {"default": asyncio.new_event_loop}


# @pytest.fixture(autouse=True)
# def patch_settings_attachments_dir(mocker, tmp_path):
#     from app.config import get_settings

#     settings = get_settings()
#     settings.attachments_dir = tmp_path
#     # TODO: patch


@pytest.fixture(scope="session", autouse=True)
def run_migrations():
    # Remember that it leaves tests with all migrations done at the end
    # and it doesn't roll them back. If you encounter error because
    # of manually rolling back some migrations, maybe it's worth
    # resetting test db state (make reset-test-db)
    from alembic.config import Config

    from alembic import command

    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session")
def engine():
    return create_async_engine(
        database_url_with_driver,
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
                    categories
                RESTART IDENTITY CASCADE
                """
            )
        )


@pytest.fixture
async def session(engine):
    async with AsyncSession(engine, expire_on_commit=False) as s:
        yield s
