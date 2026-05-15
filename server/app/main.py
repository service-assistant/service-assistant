from app.routers import attachments, brands, device_types, devices, messages, threads
from fastapi import FastAPI, Depends, status, Request
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import text

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

OPEN_PATHS = {"/docs", "/redoc", "/openapi.json", "/health"}


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

app.include_router(brands.router, prefix="/api/brands", tags=["brands"])
app.include_router(
    device_types.router, prefix="/api/device_types", tags=["device_types"]
)
app.include_router(devices.router, prefix="/api/devices", tags=["devices"])
app.include_router(attachments.router, prefix="/api/attachments", tags=["attachments"])
app.include_router(threads.router, prefix="/api/threads", tags=["threads"])
app.include_router(messages.router, prefix="/api/messages", tags=["messages"])


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
