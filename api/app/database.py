from datetime import datetime, timezone
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import Settings, get_settings


def build_db_url(
    postgres_host: str,
    postgres_port: int,
    postgres_db: str,
    postgres_user: str,
    postgres_password: str,
    with_driver: bool = False,
):
    return f"postgresql{'+psycopg' if with_driver else ''}://{postgres_user}:{postgres_password}@{postgres_host}:{postgres_port}/{postgres_db}"


database_url_with_driver: str = build_db_url(
    postgres_host=get_settings().postgres_host,
    postgres_db=get_settings().postgres_db,
    postgres_port=get_settings().postgres_port,
    postgres_user=get_settings().postgres_user,
    postgres_password=get_settings().postgres_password,
    with_driver=True,
)
database_url_without_driver: str = build_db_url(
    postgres_host=get_settings().postgres_host,
    postgres_db=get_settings().postgres_db,
    postgres_port=get_settings().postgres_port,
    postgres_user=get_settings().postgres_user,
    postgres_password=get_settings().postgres_password,
    with_driver=False,
)


@lru_cache
def get_engine(database_url: str):
    return create_async_engine(database_url)


async def get_session(settings: Annotated[Settings, Depends(get_settings)]):
    """
    FastAPI route dependency to work on the database
    """
    async with AsyncSession(
        get_engine(database_url_with_driver), expire_on_commit=False
    ) as session:
        yield session


class Base(DeclarativeBase):
    pass


def utcnow():
    return datetime.now(timezone.utc)
