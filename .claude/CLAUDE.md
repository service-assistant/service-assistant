# CLAUDE.md

This file provides guidance to Claude Code (or any other AI assistant) when working with code in this repository.

## Architecture

Monorepo with two subdirectories:
- `client/` — React Native / Expo mobile app (TypeScript, file-based routing via Expo Router)
- `server/` — FastAPI backend (Python, Poetry)

## Commands

### Server (`cd server`)

```sh
make install       # poetry install
make dev           # fastapi dev — hot reload on :8000
make test          # pytest
make lint          # ruff check app tests
make format        # ruff format app tests
make format-check  # ruff format --check app tests
```
OpenAPI docs available at `http://localhost:8000/docs`.

### Client (`cd client`)

```sh
make install   # npm install
make android   # run on Android
make test      # jest
make lint      # expo lint
make format    # prettier --write .
```

## Code Style

### Client
- Prettier: 100-char print width, tabs, 4-space indent, single quotes (see `client/.prettierrc`)
- TypeScript strict mode; use `@/` path alias for imports

### Server
- Ruff for both linting and formatting (no other formatters)
- Routers go in `app/routers/`, business logic in `app/services/`, Pydantic models in `app/models/`
- Python type checking mode is set to Standard

## Key Configuration

- Tool versions pinned via asdf in `.tool-versions` (Node 24.14.0, Python 3.14.3, Poetry 2.3.2)
- Server env vars (OpenAI key, Postgres, Qdrant URL) live in `server/.env`
- Expo new architecture and React Compiler are enabled (`client/app.json`)
