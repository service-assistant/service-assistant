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
make test-db-up    # start test postgres container
make test-db-down  # stop test postgres container
make reset-test-db # recreate test postgres container (wipes data)
make migrations    # list alembic history
make reset-db      # tear down dev postgres and delete volume
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

Single bearer token in `settings.auth_token` (env var `AUTH_TOKEN`). Checked by HTTP middleware in `main.py`. Open paths: `/health`, `/docs`, `/redoc`, `/openapi.json`, `/admin`. Dev token is `abcd`.

### DB session

`get_session` is a FastAPI dependency (`Depends`). Uses `AsyncSession` with `expire_on_commit=False`. Engine is cached per `database_url` via `lru_cache`.

## Testing

Tests run against a real PostgreSQL instance (docker-compose.test.yml, env from `.env.test`). `tests/conftest.py` runs alembic migrations once per session and truncates all tables after each test via `clean_db`. `tests/routers/conftest.py` provides `client` (async `AsyncClient`) and `unauthenticated_client` fixtures; `factories.py` builds and persists ORM objects. Auth token is injected automatically in the `client` fixture — no need to set headers manually.

## Key env vars

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | psycopg3 async URL (`postgresql+psycopg://...`) |
| `AUTH_TOKEN` | Bearer token for API auth |
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
