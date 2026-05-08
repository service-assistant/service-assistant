# Server — AI Service Assistant

FastAPI backend. Assumes you've read the root `README.md` first.

The `Makefile` provides code quality commands. Type `make help` for more information.

## Recommended learning resources

- [Python Documentation](https://docs.python.org/3/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/learn/)
- [Starlette Documentation](https://starlette.dev/)
- [Alembic Documentation](https://alembic.sqlalchemy.org/en/latest/)
- [SQLModel Documentation](https://sqlmodel.tiangolo.com/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/en/20/)
- [Poetry Documentation](https://python-poetry.org/docs/)
- [`asyncio` Documentation](https://docs.python.org/3/library/asyncio.html)

## Deployment (VPS)

Three compose files are available, each fully isolated (separate containers, volumes, and networks):

| File | Purpose | App port |
|---|---|---|
| `docker-compose.dev.yml` | Local dev with hot reload | `8000` |
| `docker-compose.staging.yml` | Staging deployment on VPS | `127.0.0.1:8001` |
| `docker-compose.production.yml` | Production deployment on VPS | `127.0.0.1:8002` |

Staging and production environments are meant to be identical but need to run in separation on the host. That's why they expose different ports. On the server it should use reverse proxy (like nginx or Caddy) to forward traffic there.

Current setup on the server:

- `asystent-serwisanta.pl` -> `production (port 8002)`
- `staging.asystent-serwisanta.pl` -> `staging (port 8001)`

In case of any questions, ask [@mateuszmanczak04](https://github.com/mateuszmanczak04)

### Setup (first time)

Copy `.env.example` to `.env` and fill in real values:

```sh
cp .env.example .env
```

### Cautions

Database migrations run automatically on startup via `alembic upgrade head`. Once a migration is pushed to `staging` or `main`, never revert it — the database has already been migrated and a downgrade would cause data loss or schema conflicts. Remember that you can do it freely on your local machine or in a feature branch as long as it's not merged into one of the branches above.

Staging and production databases are fully isolated — separate Docker volumes, containers, and networks.
