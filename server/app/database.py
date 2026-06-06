from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime, timezone

from .config import Settings, get_settings


@lru_cache
def get_engine(database_url: str):
    return create_async_engine(database_url)


async def get_session(settings: Annotated[Settings, Depends(get_settings)]):
    """
    FastAPI route dependency to work on the database
    """
    async with AsyncSession(get_engine(settings.database_url)) as session:
        yield session


class Base(DeclarativeBase):
    pass


def utcnow():
    return datetime.now(timezone.utc)
