# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
make install       # poetry install
make dev           # docker compose up — runs postgres + fastapi on :8000 with hot reload
make test          # poetry run pytest
make lint          # ruff check app tests alembic
make format        # ruff format app tests
make typecheck     # pyright
make check         # format-check + lint + typecheck (no tests)
make migrations    # list alembic history
```

Run single test file:
```sh
poetry run pytest tests/routers/test_brands.py
```

Run single test by name:
```sh
poetry run pytest -k "test_should_create_brand_when_valid_data_provided"
```

Generate migration after model changes:
```sh
poetry run alembic revision --autogenerate -m "description"
poetry run alembic upgrade head
```

OpenAPI docs: `http://localhost:8000/docs`

## Architecture

FastAPI async app backed by PostgreSQL + pgvector. Three core layers:

- `app/routers/` — HTTP + WebSocket handlers; thin, delegate to services
- `app/services/` — business logic (retrieval, LLM, ingest, STT, TTS, embedding)
- `app/models/` — SQLAlchemy ORM (DeclarativeBase in `database.py`)
- `app/schemas/` — Pydantic schemas for request/response serialization
- `alembic/` — database migrations; `env.py` imports all models via `app.models`

### Domain model

`Brand` → `DeviceType` → `Device` (brand + type FK). `Attachment` (PDFs) links to `Device` via `AttachmentDevice` association table. Each attachment has many `Chunk`s (text fragments with pgvector embeddings). `Device` has many `ChatThread`s; each thread has many `Message`s. `ChunkMessage` links retrieved chunks to the assistant message that used them.

### RAG pipeline

1. **Ingest** (`services/ingest.py`): PDF → pymupdf → `chunking.py` (per page) → batch embed via Azure OpenAI → store `Chunk` rows with pgvector embedding
2. **Retrieval** (`services/retrieval.py`): hybrid search — semantic (pgvector `<->` cosine) + BM25 (rank-bm25, run in executor) → `merge_hybrid_chunks`; error codes get exact-match boost
3. **LLM** (`services/llm.py`): OpenAI streaming chat with last 16 thread messages as history; custom Polish-language system prompt with structured `::checklist` / `::warning` / `::next` tags
4. **Streaming**: threads router streams LLM response as SSE; also has WebSocket endpoint for voice (STT via Deepgram, TTS via Gemini)

### Auth

Multi-tenant, per-user sessions. `Organization` → `User` (`app_role`: `user`/`admin` — `admin` is a system-level superuser, gates the debug SPA; `org_role`: `member`/`admin` — `admin` gates the admin SPA and org-admin routes) → `UserSession` (opaque token, only its SHA-256 hash stored, sliding expiration). `POST /auth/login` (`app/routers/auth.py`) takes `{organization_slug, username, password}`, returns the raw token in the body and sets it as an httponly `session_token` cookie. Every other endpoint requires that cookie or an `Authorization: Bearer <token>` header (checked via `app/dependencies/auth.py`'s `get_current_user`/`require_org_admin`/`require_app_admin`, applied per-router in `main.py`'s `include_router(..., dependencies=...)` calls — not global middleware). `/health`, `/docs`, `/redoc`, `/openapi.json` need no auth. All business data is scoped to the caller's organization via the repository layer (`app/repositories/`).

### DB session

`get_session` is a FastAPI dependency (`Depends`). Uses `AsyncSession` with `expire_on_commit=False`. Engine is cached per `database_url` via `lru_cache`.

## Testing

Tests run against a real PostgreSQL instance on the developer's OS (`127.0.0.1:5432`, env from `.env.test`) — no Docker involved. `tests/conftest.py` runs alembic migrations once per session and truncates all tables after each test via `clean_db` (the seeded `system`/`default` organizations are preserved). `tests/routers/conftest.py` provides `client` (organization_admin session), `app_admin_client` (app_admin session), and `unauthenticated_client` fixtures; `factories.py` builds and persists ORM objects, including `create_organization`/`create_user`.

## Key env vars

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | psycopg3 async URL (`postgresql+psycopg://...`) |
| `OPENAI_API_KEY` | Chat completions (direct OpenAI) |
| `OPENAI_CHAT_MODEL` | e.g. `gpt-4o` |
| `AZURE_OPENAI_*` | Embeddings (Azure deployment) |
| `DEEPGRAM_API_KEY` | STT (optional) |
| `GEMINI_API_KEY` | TTS (optional) |
| `ATTACHMENTS_DIR` | File storage path for uploaded PDFs |

## Patterns and conventions

- SQLAlchemy relationships use `lazy="raise"` — always explicitly join or load relations; never rely on lazy loading
- All timestamps use `utcnow()` from `database.py` (timezone-aware)
- Schemas named `*Read`, `*Create`, `*Update` following FastAPI conventions
- `app/models/__init__.py` re-exports all models — import from there, not individual files
- Ruff is the only formatter/linter — no black, no flake8
