from fastapi import APIRouter
from pydantic import BaseModel
from ..services import llm, embedding

router = APIRouter(prefix="", tags=["RAG"])


class AskQuestionRequest(BaseModel):
    question: str


class AskQuestionResponse(BaseModel):
    answer: str


@router.post("/questions", response_model=AskQuestionResponse)
def ask_question(body: AskQuestionRequest):
    embedded_question = embedding.embed_question(body.question)
    close_chunks = embedding.get_close_chunks(embedded_question)
    llm_response = llm.query(body.question, close_chunks)
    return {"answer": llm_response}
