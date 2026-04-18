from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402
from app.routers import example, rag  # noqa: E402


app = FastAPI()

app.include_router(example.router, prefix="/api")
app.include_router(rag.router, prefix="/api")
