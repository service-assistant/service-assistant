import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL environment variable is not set")
engine = create_async_engine(database_url)


async def get_session():
    """
    FastAPI route dependency to work on the database
    """
    async with AsyncSession(engine) as session:
        yield session
