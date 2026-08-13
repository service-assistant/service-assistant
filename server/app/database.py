from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime, timezone

from .config import Settings, get_settings


@lru_cache
def get_engine(database_url: str):
    return create_async_engine(
        database_url,
        pool_pre_ping=True,
        pool_recycle=300,
    )


async def get_session(settings: Annotated[Settings, Depends(get_settings)]):
    """
    FastAPI route dependency to work on the database
    """
    async with AsyncSession(
        get_engine(settings.database_url), expire_on_commit=False
    ) as session:
        yield session


async def release_read_transaction(session: AsyncSession) -> None:
    """Release a read-only transaction before waiting on an external provider."""
    if not session.in_transaction():
        return

    try:
        # Request sessions use expire_on_commit=False, so already loaded ORM data
        # remains usable without keeping the connection checked out.
        await session.commit()
    except DBAPIError:
        # The database may have already closed an idle connection. Discard it so
        # the next operation checks out a fresh connection from the pool.
        await session.invalidate()


class Base(DeclarativeBase):
    pass


def utcnow():
    return datetime.now(timezone.utc)
