"""
Example module with APIRouter to show how to write new API routes in this repository.
Also with custom Pydantic model.
"""

from fastapi import APIRouter, status
from pydantic import BaseModel

router = APIRouter(prefix="/hello", tags=["Example"])


class Hello(BaseModel):
    hello: str
    world: str


@router.get(
    "/",
    name="Example API Route",
    description="Example API Route just to demonstrate app structure.",
    status_code=status.HTTP_200_OK,
    response_model=Hello,
)
def hello() -> Hello:
    params = {"hello": "world", "world": "hello"}
    return Hello(**params)
