from app.routers import add_doc, example, get_doc, rag
from fastapi import FastAPI, Depends, status, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import text

from .config import get_settings
from .database import get_session

app = FastAPI()

settings = get_settings()

@app.middleware("http")
async def bearer_auth_middleware(request: Request, call_next):
    auth_header = request.headers.get("Authorization")
    expected = f"Bearer {settings.auth_token}"

    if auth_header != expected:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Unauthorized"},
        )
    
    return await call_next(request)

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
app.include_router(get_doc.router, prefix="/api")


@app.get("/health", include_in_schema=False)
async def health(db: AsyncSession = Depends(get_session)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "healthy"}
    except Exception:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unhealthy", "reason": "database unreachable"},
        )
