# AI Service Assistant

## Tech Stack

Client app is made with [React Native (Expo specifically)](https://docs.expo.dev/) in `client` directory.

Server app is made using [FastAPI](https://fastapi.tiangolo.com/) in `server` directory.

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

Each of `server`, `client`, and `admin` has its own `Makefile`. They should make it easier for frontend people to run the backend app and vice versa.

More about development in `./server/README.md` and `./client/README.md`.

### Run everything in dev mode

From the repository root, run:

```
make dev
```

This starts the dev database, then runs `server`, `client`, and `admin` in dev mode simultaneously (one Ctrl+C stops all of them). Once running:

| App | URL |
|---|---|
| `server` | [http://localhost:8000](http://localhost:8000) ([docs](http://localhost:8000/docs)) |
| `admin` | [http://localhost:5173](http://localhost:5173) |
| `client` (web) | [http://localhost:8081](http://localhost:8081) |

### Run all checks

From the repository root, run:

```
make check
```

This runs format-check, lint, typecheck, and test in `server`, `client`, and `admin` (one after another, stopping at the first failure). Under the hood it just calls each app's own `make check`, so `cd server && make check` (or `client`/`admin`) runs the same checks for just that app. `server`'s tests need a local Postgres running (see `server/.env.test`). `admin` has no formatter or test suite configured yet, so its `make check` only runs lint and typecheck.

### Run all formatting and tests on Windows

From the repository root, run:

```powershell
.\scripts\check-all-windows.ps1
```

In Windows Command Prompt (`cmd.exe`), you can run the same checks from the
repository root, `client`, or `server` directory with:

```bat
test
```

The script formats the server and client, runs lint and type checks for all
applications, builds the admin panel, and runs all server and client tests.
Server tests are delegated to `server/scripts/test-windows.ps1`, which
configures the Windows-compatible asyncio event loop and runs against a local
Postgres (see `server/.env.test.windows`).

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

The app is deployed on a VPS as 3 independently running Docker Compose projects — `server`, `admin`, and `client` — each with its own `docker-compose.production.yml` and `make production` target. There is no shared root compose file; the VPS deployment script simply (re)starts all 3 projects.

`server` runs the FastAPI container directly. `admin` and `client` are both static-exported (Vite build / `expo export --platform web`) and served by their own Caddy container.

Android is still distributed by building an `.apk` manually — see `client/README.md`.
