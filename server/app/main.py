from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import example, rag

from .config import get_settings

app = FastAPI()

settings = get_settings()

if settings.env == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(example.router, prefix="/api")
app.include_router(rag.router, prefix="/api")
