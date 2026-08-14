# CLAUDE.md

This file provides guidance to Claude Code (or any other AI assistant) when working with code in this repository.

## Architecture

Monorepo with three subdirectories:
- `client/` — React Native / Expo app (TypeScript, file-based routing via Expo Router), targets Android and Web
- `server/` — FastAPI backend (Python, Poetry)
- `admin/` — Vite/React admin dashboard (TypeScript)

Each app deploys independently on the VPS via its own `docker-compose.production.yml`.

## Commands

Run `make check` from the repo root to run format-check, lint, typecheck, and test across all three apps (calls each app's own `make check`).

### Server (`cd server`)

```sh
make install       # poetry install
make dev           # fastapi dev — hot reload on :8000
make test          # pytest (needs a local Postgres, see server/.env.test)
make lint          # ruff check app tests
make format        # ruff format app tests
make format-check  # ruff format --check app tests
make typecheck     # pyright
make check         # format-check + lint + typecheck + test
```
OpenAPI docs available at `http://localhost:8000/docs`.

### Client (`cd client`)

```sh
make install       # npm install
make android       # run on Android
make test          # jest
make lint          # expo lint
make format        # prettier --write .
make format-check  # prettier --check .
make typecheck     # tsc --noEmit
make check         # format-check + lint + typecheck + test
make production    # docker compose -f docker-compose.production.yml up --build -d
```

### Admin (`cd admin`)

```sh
make install    # npm install
make dev        # vite — hot reload on :5173
make lint        # oxlint
make typecheck   # tsc -b
make check       # lint + typecheck (no formatter/test suite configured yet)
make production  # docker compose -f docker-compose.production.yml up --build -d
```

## Code Style

### Client
- Prettier: 100-char print width, tabs, 4-space indent, single quotes (see `client/.prettierrc`)
- TypeScript strict mode; use `@/` path alias for imports
- Use `npm`, not any of `bun`, `pnpm` or `yarn`

### Server
- Ruff for both linting and formatting (no other formatters)
- Routers go in `app/routers/`, business logic in `app/services/`, Pydantic models in `app/models/`
- Python type checking mode is set to Standard
- Project uses `Poetry` to manage Python dependencies

## Key Configuration

- Tool versions pinned via asdf in `.tool-versions` (Node 24.14.0, Python 3.12.13, Poetry 2.3.2)
- Server env vars (OpenAI key, Postgres, Qdrant URL) live in `server/.env`
- Expo new architecture and React Compiler are enabled (`client/app.json`)

## Debugging

When you test any endpoints, you can directly curl localhost:8000 using Authorization: Bearer abcd in development mode.
