# CLAUDE.md

This file provides guidance to Claude Code (or any other AI assistant) when working with code in this repository.

## Architecture

Monorepo with four subdirectories:
- `app/` — React Native / Expo app (TypeScript, file-based routing via Expo Router), targets Android and Web
- `api/` — FastAPI backend (Python, Poetry)
- `admin/` — Vite/React admin dashboard (TypeScript)
- `landing/` — static HTML/CSS marketing page

Each app deploys independently on the VPS via its own `compose.production.yml`.

## Commands

From the repo root, `make <target>` fans out to every app that defines that target (calls each app's own `make <target>`):

```sh
make install       # api, app, admin
make dev           # api, app, admin, landing — dev mode simultaneously
make test          # api, app, admin
make lint          # api, app, admin
make format        # api, app, admin
make format-check  # api, app, admin
make typecheck     # api, app, admin
make check         # api, app, admin — format-check + lint + typecheck + test
make production    # api, app, admin, landing
```

### API (`cd api`)

```sh
make install       # poetry install
make dev           # fastapi dev — hot reload on :8000 (no auto-migration)
make migrate       # run alembic upgrade head against the running dev container
make test          # pytest (needs a local Postgres, see api/.env.test)
make lint          # ruff check app tests
make format        # ruff format app tests
make format-check  # ruff format --check app tests
make typecheck     # pyright
make check         # format-check + lint + typecheck + test
```
OpenAPI docs available at `http://localhost:8000/docs`.

### App (`cd app`)

```sh
make install       # npm install
make dev           # expo start
make android       # run on Android
make test          # jest
make lint          # expo lint
make format        # prettier --write .
make format-check  # prettier --check .
make typecheck     # tsc --noEmit
make check         # format-check + lint + typecheck + test
make production    # docker compose -f compose.production.yml up --build -d
```

### Admin (`cd admin`)

```sh
make install        # npm install
make dev            # vite — hot reload on :5173
make test           # vitest run
make lint           # oxlint
make format         # prettier --write .
make format-check   # prettier --check .
make typecheck      # tsc -b
make check          # format-check + lint + typecheck + test
make production     # docker compose -f compose.production.yml up --build -d
```

### Landing (`cd landing`)

```sh
make dev         # docker compose -f compose.production.yml up --build (same Caddy image for dev and production, no hot reload)
make production  # docker compose -f compose.production.yml up --build -d
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
