---
paths:
  - "server/app/router/**/*.py"
---

# API Design Rules

- All routes should have clearly documented in OpenAPI using built-in FastAPI features
- Use explicit status codes, e.g. `fastapi.status.HTTP_200_OK`
- Raise `HTTPException` with meaningful `detail`, never return error dicts manually
- Each router file should cover one resource/domain, tagged appropriately with `tags=[...]`
