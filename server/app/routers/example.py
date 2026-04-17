"""
Example module with APIRouter to show how to write new API routes in this repository.
"""

from fastapi import APIRouter, Body, status, Depends
from sqlmodel import Field, SQLModel
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import get_session
from typing import Annotated

router = APIRouter(prefix="/examples", tags=["Examples"])


@router.get(
    "/hello_world",
    name="Example API Route",
    description="Example API Route just to demonstrate app structure.",
    status_code=status.HTTP_200_OK,
)
def hello_world() -> dict:
    return {"hello": "world"}


# Normally, create models in separate directory
# It's here just for a code demo
# table=False to not mess up in the real database
class Hero(SQLModel, table=False):
    """Example model — not for production use."""

    id: int | None = Field(default=None, primary_key=True)
    name: str
    secret_name: str
    age: int | None = None


description = """
Properly created API Route using SQLModel as FastPI Dependency. You can clone this pattern in other endpoints.

It creates a DB record in `hero` table and returns it to the user.

Note: in order to make this work, you must create a table in the DB. It was decided to not include migration script directly in code for this example. You can use the snippet below:

```sql
CREATE TABLE hero (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    secret_name VARCHAR NOT NULL,
    age INTEGER
);
```
"""


@router.post(
    "/with-database",
    name="Example API Route using database",
    description=description,
    status_code=status.HTTP_201_CREATED,
    response_model=Hero,
)
async def db_sqlmodel(
    *,
    session: AsyncSession = Depends(get_session),
    hero: Annotated[
        Hero,
        Body(examples=[{"name": "Deadpond", "secret_name": "Dive Wilson", "age": 30}]),
    ],
) -> Hero:
    db_hero = Hero.model_validate(hero)
    session.add(db_hero)
    await session.commit()
    await session.refresh(db_hero)
    return db_hero
