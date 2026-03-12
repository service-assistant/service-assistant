from fastapi import APIRouter
from openai import OpenAI
from typing import Annotated
import os

router = APIRouter(prefix="/ai")

client = OpenAI()

openai_model = os.environ.get("OPENAI_MODEL")
if not openai_model:
    raise ValueError("OPENAI_MODEL environment variable is not set")


@router.get("/")
def demo(
    question: Annotated[str, "Question sent directly to OpenAI API"],
) -> dict[str, str]:
    response = client.responses.create(model=str(openai_model), input=question)

    return {"answer": response.output_text}
