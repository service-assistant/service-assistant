from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402
from app.routers import example, rag  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
import os  # noqa: E402


app = FastAPI()

if os.getenv("ENV") == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(example.router, prefix="/api")
app.include_router(rag.router, prefix="/api")
