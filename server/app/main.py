from fastapi import Depends, FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.routers import (
    admin,
    attachments,
    brands,
    chunks,
    device_types,
    devices,
    images,
    messages,
    threads,
)

from .config import get_settings
from .database import get_session

app = FastAPI(
    title="Service Assistant API",
    version="1.0.0",
    description=(
        "REST API for the Service Assistant — a RAG-powered support tool that lets forklift mechanics "
        "upload service manuals (PDFs) and ask technical questions about specific forklifts in a chat interface. "
        "All endpoints except `/health`, `/docs`, `/redoc`, and `/openapi.json` require a Bearer token."
    ),
)

settings = get_settings()


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
    schema.setdefault("components", {})["securitySchemes"] = {
        "BearerAuth": {"type": "http", "scheme": "bearer"}
    }
    schema["security"] = [{"BearerAuth": []}]
    app.openapi_schema = schema
    return schema


app.openapi = custom_openapi

OPEN_PATHS = {"/docs", "/redoc", "/openapi.json", "/health", "/admin"}


@app.middleware("http")
async def bearer_auth_middleware(request: Request, call_next):
    path = request.url.path

    if any(path == prefix or path.startswith(f"{prefix}/") for prefix in OPEN_PATHS):
        return await call_next(request)

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

app.include_router(brands.router, prefix="/api/brands", tags=["Brands"])
app.include_router(
    device_types.router, prefix="/api/device_types", tags=["Device Types"]
)
app.include_router(devices.router, prefix="/api/devices", tags=["Devices"])
app.include_router(attachments.router, prefix="/api/attachments", tags=["Attachments"])
app.include_router(threads.router, prefix="/api/threads", tags=["Chat Threads"])
app.include_router(messages.router, prefix="/api/messages", tags=["Messages"])
app.include_router(chunks.router, prefix="/api/chunks", tags=["Chunks"])
app.include_router(images.router, prefix="/api/images", tags=["Images"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])


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
