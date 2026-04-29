from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import example, rag, add_doc

from .config import get_settings

app = FastAPI()

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(example.router, prefix="/api")
app.include_router(rag.router, prefix="/api")
app.include_router(add_doc.router, prefix="/api")


@app.get("/health", include_in_schema=False)
def health() -> dict:
    return {"status": "ok"}
