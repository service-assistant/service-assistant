# AI Service Assistant

## Apps

### API (`api/`)

FastAPI backend (Python, Poetry). See `api/Makefile` (`make help`) for all commands.

- [Python Documentation](https://docs.python.org/3/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/learn/)
- [Starlette Documentation](https://starlette.dev/)
- [Alembic Documentation](https://alembic.sqlalchemy.org/en/latest/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/en/20/)
- [Poetry Documentation](https://python-poetry.org/docs/)
- [`asyncio` Documentation](https://docs.python.org/3/library/asyncio.html)

**Setup (first time):** copy `.env.example` to `.env` and fill in real values:

```sh
cp api/.env.example api/.env
```

**Postgres:** you need a Postgres instance with the [`pgvector`](https://github.com/pgvector/pgvector) extension for both `make dev` and `make test`. A few options, pick whichever suits you:

- **Dockerized (recommended, zero setup):** if you don't have Postgres installed on your OS, run `cd api && make dev-db` to spin up `pgvector/pgvector` in Docker on port `5432`, using `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` from `api/.env` (see `api/compose.db.yml`) — nothing extra to install. `make dev` does NOT start this for you, so run it separately first.
- **Install natively:** e.g. on macOS, `brew install postgresql@18` (ships with `pgvector` support via a separate formula or `pgxman`), `brew services start postgresql@18`, then `createdb service_assistant_dev && createdb service_assistant_test` and run `CREATE EXTENSION vector;` in both. Point `DATABASE_URL` at `127.0.0.1:5432` either way.
- **Remote managed Postgres (e.g. [Supabase](https://supabase.com)):** if you don't want to run Postgres locally at all, spin up a free Supabase project, enable the `vector` extension from the dashboard (Database → Extensions), and point `DATABASE_URL` at the connection string Supabase gives you — just make sure it's in the `postgresql+psycopg://...` form (async psycopg3 driver), not the plain `postgresql://` Supabase shows by default.

The app itself only ever reads `DATABASE_URL` — the `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`/`POSTGRES_HOST_AUTH_METHOD` vars in `.env` only configure the container in `compose.db.yml`, so they're irrelevant (and safe to ignore) if you're not using the dockerized option.

**Migrations:** production runs `alembic upgrade head` automatically on startup. Dev does not — run `make migrate` after `make dev` is up.

**Cautions:** once a migration is pushed to `staging` or `main`, never revert it — the database has already been migrated and a downgrade would cause data loss or schema conflicts. You can do it freely on your local machine or in a feature branch as long as it's not merged into one of the branches above.

**`DOCKER_SUBNET` / `DOCKER_GATEWAY`:** these two only matter because the api container itself runs in Docker but needs to reach a Postgres that (usually) isn't part of the same compose project — it's tripped up more than one dev, so worth spelling out:

- `DOCKER_GATEWAY` sets what `host.docker.internal` resolves to *inside* the api container, via `extra_hosts` in `compose.dev.yml`/`compose.production.yml`. In almost all cases you want the literal value `host-gateway` — a special keyword Docker itself resolves to the host machine's real IP at container start (works on Docker Desktop for macOS/Windows and on Docker Engine for Linux since v20.10). You basically never need to change this.
- `DOCKER_SUBNET` (e.g. `172.28.0.0/16`) pins the compose network's bridge subnet in `compose.production.yml`, instead of letting Docker assign a random one on every `up`. This keeps the network's gateway IP stable across restarts, which matters if something on the host (like Postgres) allow-lists specific IPs/CIDRs for connections. You'll only ever need to touch this if `docker compose up` fails with a subnet-overlap error against another Docker network already on your machine — just pick a different private range.

### App (`app/`)

React Native / Expo app (TypeScript, file-based routing via Expo Router), targets Android and Web. See `app/Makefile` (`make help`) for all commands.

Run automated checks:

```sh
npm.cmd run lint
npm.cmd test -- --runInBand
```

Before sharing a real APK, run the manual release checklist: [Manual E2E Release Checklist](./app/docs/manual-e2e.md).

- [TypeScript for JS Programmers](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html)
- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [Expo Documentation](https://docs.expo.dev/)

### Admin (`admin/`)

Vite/React admin dashboard (TypeScript). See `admin/Makefile` (`make help`) for all commands.

### Landing (`landing/`)

Static HTML/CSS marketing page, no build tooling or dependencies. Served by Caddy in both dev and production (see `landing/Makefile`). Reads the app's URL from `APP_URL` at Docker build time via `envsubst`.

## Development

This project uses [asdf](https://asdf-vm.com/) to keep tool versions consistent. I recommend installing it now.

For backend/Python dependency management we use [poetry](https://python-poetry.org/). Don't install it directly but through `asdf`. To make sure `asdf` works with it correctly run:

```
asdf plugin add poetry https://github.com/asdf-community/asdf-poetry.git
```

With all that ready, run: 

```
asdf install
```

If you are on Windows or any other OS where `asdf` is not available, you can also install dependencies from `.tool-versions` globally.

Each of `api`, `app`, `admin`, and `landing` has its own `Makefile`. They should make it easier for frontend people to run the backend app and vice versa.

### Run everything in dev mode

From the repository root, run:

```
make dev
```

This runs `api`, `app`, `admin`, and `landing` in dev mode simultaneously (one Ctrl+C stops all of them). If you don't have Postgres installed on your OS, run `cd api && make dev-db` first. Once running:

| App | URL |
|---|---|
| `api` | [http://localhost:8000](http://localhost:8000) ([docs](http://localhost:8000/docs)) |
| `admin` | [http://localhost:5173](http://localhost:5173) |
| `app` (web) | [http://localhost:8081](http://localhost:8081) |
| `landing` | [http://localhost:8053](http://localhost:8053) |

### Run all checks

From the repository root, run:

```
make check
```

This runs format-check, lint, typecheck, and test in `api`, `app`, and `admin` (one after another, stopping at the first failure). Under the hood it just calls each app's own `make check`, so `cd api && make check` (or `app`/`admin`) runs the same checks for just that app. `api`'s tests need a local Postgres running (see `api/.env.test`). `landing` is static HTML/CSS with no tooling, so it has no `check` target.

The same fan-out pattern works for any shared target — `make install`, `make test`, `make lint`, `make format`, `make format-check`, `make typecheck`, and `make production` all run across every app that defines them.

### Running API tests

Tests run against a real PostgreSQL instance on `127.0.0.1:5432` (see `DATABASE_URL` in `api/.env.test`) — no Docker involved, just whatever Postgres (with the `pgvector` extension) is running on your machine. Create the `service_assistant_test` database once, then:

```sh
cd api && make test
```

### Run all formatting and tests on Windows

From the repository root, run:

```powershell
.\scripts\check-all-windows.ps1
```

In Windows Command Prompt (`cmd.exe`), you can run the same checks from the
repository root, `app`, or `api` directory with:

```bat
test
```

The script formats the api and app, runs lint and type checks for all
applications, builds the admin panel, and runs all api and app tests.
API tests are delegated to `api/scripts/test-windows.ps1`, which
configures the Windows-compatible asyncio event loop and runs against a local
Postgres. Windows uses a separate test database URL (`api/.env.test.windows`)
with an explicit IPv4 loopback address and a selector event loop compatible
with async psycopg.

## Rules & Advices

We work in 2-week long sprints, usually starting on Wednesday. We aim to finish each sprint at least 2-3 days before starting another one, that is around Sunday. With that approach we're able to choose upcoming priorities and do better planing before starting next sprint.

Jira Issues should be moved to "In Progress" and "Done" automatically, based on the state of related pull request. Remember to create branches with names suggested by Jira.

Start by working on issues with the highest priority first or issues that block tasks of other people. We should write tasks to minimize collisions but that's not always possible.

## Definition of Done

To mark task as done/completed it:

- MUST have written unit tests for the new functionality if relevant.
- MUST have written integration tests for the new functionality if relevant.
- MUST be reviewed and approved by at least 1 person on the backend.
- MUST pass all checks on GitHub Actions.
- MUST be made on a proper branch outgoing from the staging branch.
- MUST include thorough documentation in ANY form. For example on Google Drive, as a markdown file in the repository or function docstrings.
- SHOULD be made by 1 person.
- SHOULD be reviewed on the frontend in case of uncertainty.
- SHOULD use conventional commit naming.
- MAY be reviewed by other person if is about infrastructure.

## Deployment

The app is deployed on a VPS as 4 independently running Docker Compose projects — `api`, `admin`, `app`, and `landing` — each with its own `compose.production.yml` and `make production` target. There is no shared root compose file; the VPS deployment script simply (re)starts all 4 projects.

`api` runs the FastAPI container directly. `admin` and `app` are both static-exported (Vite build / `expo export --platform web`) and served by their own Caddy container. `landing` is plain static HTML/CSS served by Caddy directly, no build step.

Android is still distributed by building an `.apk` manually.

### Deployment script

Deploys run via a shell script on the VPS (one per environment, e.g. `deploy-service-assistant-staging.sh`) that pulls latest code and rebuilds each project's compose stack:

```sh
#!/bin/bash
set -e # stop on any error

cd <path-to-repo-checkout-on-vps>

echo "Pulling latest code..."
git pull

echo "Building and restarting API..."
docker compose -f ./api/compose.production.yml up -d --build

echo "Building and restarting main app..."
docker compose -f ./app/compose.production.yml up -d --build

echo "Building and restarting admin app..."
docker compose -f ./admin/compose.production.yml up -d --build

echo "Building and restarting landing page..."
docker compose -f ./landing/compose.production.yml up -d --build

echo "Cleaning up old images..."
docker image prune -f

echo "Done."
```

In case of any questions, ask [@mateuszmanczak04](https://github.com/mateuszmanczak04)
