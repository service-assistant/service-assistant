FROM python:3.14.3-slim

ENV POETRY_VERSION=2.3.2 \
    POETRY_VIRTUALENVS_CREATE=false \
    POETRY_NO_INTERACTION=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN pip install --no-cache-dir "poetry==$POETRY_VERSION"

WORKDIR /app

COPY pyproject.toml poetry.lock* ./

RUN poetry install --no-cache

COPY . .

EXPOSE 8000

CMD ["poetry", "run", "fastapi", "run"]
