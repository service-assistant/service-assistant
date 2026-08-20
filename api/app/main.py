from contextlib import asynccontextmanager

from app.routers import (
    attachments,
    auth,
    categories,
    chunks,
    devices,
    images,
    messages,
    nameplates,
    threads,
    tts,
    users,
)
from app.routers.admin import auth as admin_auth
from app.routers.admin import benchmark, jobs, next_best_step, organizations
from fastapi import Depends, FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .database import get_session
from .dependencies.auth import require_app_admin, require_org_admin
from .procrastinate_app import app as procrastinate_app


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Opening the Procrastinate app connects its connector, which is what lets
    # request handlers defer background jobs. The worker process opens its own.
    async with procrastinate_app.open_async():
        yield


app = FastAPI(
    lifespan=lifespan,
    title="Service Assistant API",
    version="1.0.0",
    description=(
        "REST API for the Service Assistant — a RAG-powered support tool that lets forklift mechanics "
        "upload service manuals (PDFs) and ask technical questions about specific forklifts in a chat interface. "
        "All endpoints except `/health`, `/docs`, `/redoc`, `/openapi.json`, and `/auth` require a valid session "
        "(cookie or `Authorization: Bearer <session_token>`), obtained via `POST /auth/login`."
    ),
)

settings = get_settings()


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-File-Size", "X-PDF-Page-Count"],
)


# Public routers
app.include_router(
    auth.router,
    prefix="/auth",
    tags=["Auth"],
)
app.include_router(
    admin_auth.router,
    prefix="/admin/auth",
    tags=["Auth"],
)

# Org-admin only routers
app.include_router(
    users.router,
    prefix="/api/users",
    tags=["Users"],
    dependencies=[Depends(require_org_admin)],
)
app.include_router(
    categories.router,
    prefix="/api/categories",
    tags=["Categories"],
    dependencies=[Depends(require_org_admin)],
)
app.include_router(
    devices.router,
    prefix="/api/devices",
    tags=["Devices"],
    dependencies=[Depends(require_org_admin)],
)
app.include_router(
    attachments.router,
    prefix="/api/attachments",
    tags=["Attachments"],
    dependencies=[Depends(require_org_admin)],
)
app.include_router(
    threads.router,
    prefix="/api/threads",
    tags=["Chat Threads"],
    dependencies=[Depends(require_org_admin)],
)
# threads.websocket_router carries the transcribe-stream websocket route,
# which can't use the cookie/header-based auth dependency chain (no
# cookies/Authorization header on a raw WS handshake) — it does its own
# token-query-param auth instead, so it's excluded from the gate above.
app.include_router(
    threads.websocket_router,
    prefix="/api/threads",
    tags=["Chat Threads"],
)
app.include_router(
    messages.router,
    prefix="/api/messages",
    tags=["Messages"],
    dependencies=[Depends(require_org_admin)],
)
app.include_router(
    nameplates.router,
    prefix="/api/nameplates",
    tags=["Nameplates"],
    dependencies=[Depends(require_org_admin)],
)
app.include_router(
    chunks.router,
    prefix="/api/chunks",
    tags=["Chunks"],
    dependencies=[Depends(require_org_admin)],
)
app.include_router(
    images.router,
    prefix="/api/images",
    tags=["Images"],
    dependencies=[Depends(require_org_admin)],
)
app.include_router(
    tts.router,
    prefix="/api/tts",
    tags=["Text-to-Speech"],
    dependencies=[Depends(require_org_admin)],
)
app.include_router(
    organizations.router,
    prefix="/api/admin/organizations",
    tags=["Organizations"],
    dependencies=[Depends(require_app_admin)],
)

# App-admin only routers
app.include_router(
    jobs.router,
    prefix="/api/admin/jobs",
    tags=["Jobs"],
    dependencies=[Depends(require_app_admin)],
)
app.include_router(
    benchmark.router,
    prefix="/api/admin/benchmark",
    tags=["Benchmark"],
    dependencies=[Depends(require_app_admin)],
)
app.include_router(
    next_best_step.router,
    prefix="/api/admin/next-best-step",
    tags=["Next Best Step"],
    dependencies=[Depends(require_app_admin)],
)


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
