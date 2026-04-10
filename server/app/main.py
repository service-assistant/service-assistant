from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402
from app.routers import hello  # noqa: E402


app = FastAPI()

app.include_router(hello.router, prefix="/api")
