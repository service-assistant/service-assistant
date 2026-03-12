from fastapi import APIRouter
from openai import OpenAI
from typing import Annotated

router = APIRouter(prefix="/ai")

client = OpenAI()

@router.get("/")
def demo(
    question: Annotated[str, "Question sent directly to OpenAI API"],
) -> dict[str, str]:
    response = client.responses.create(model="gpt-5-mini", input=question)

    return {"answer": response.output_text}
