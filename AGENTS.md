# AGENTS.md

This file provides guidance to Codex (or any other AI assistant) when working with code in this repository.

## Architecture

Monorepo with two subdirectories:
- `app/` — React Native / Expo mobile app (TypeScript, file-based routing via Expo Router)
- `api/` — FastAPI backend (Python, Poetry)

## Commands

### API (`cd api`)

```sh
make install       # poetry install
make dev           # fastapi dev — hot reload on :8000
make test          # pytest
make lint          # ruff check app tests
make format        # ruff format app tests
make format-check  # ruff format --check app tests
```
OpenAPI docs available at `http://localhost:8000/docs`.

### App (`cd app`)

```sh
make install   # npm install
make android   # run on Android
make test      # jest
make lint      # expo lint
make format    # prettier --write .
```

## Code Style

### App
- Prettier: 100-char print width, tabs, 4-space indent, single quotes (see `app/.prettierrc`)
- TypeScript strict mode; use `@/` path alias for imports
- Use `npm`, not any of `bun`, `pnpm` or `yarn`

### API
- Ruff for both linting and formatting (no other formatters)
- Routers go in `app/routers/`, business logic in `app/services/`, Pydantic models in `app/models/`
- Python type checking mode is set to Standard
- Project uses `Poetry` to manage Python dependencies

## Key Configuration

- Tool versions pinned via asdf in `.tool-versions` (Node 24.14.0, Python 3.12.13, Poetry 2.3.2)
- API env vars (OpenAI key, Postgres, Qdrant URL) live in `api/.env`
- Expo new architecture and React Compiler are enabled (`app/app.json`)

## Debugging

When you test any endpoints, you can directly curl localhost:8000 using Authorization: Bearer abcd in development mode.
