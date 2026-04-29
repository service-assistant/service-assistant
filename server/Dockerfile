FROM python:3.12.13-slim

ENV POETRY_VERSION=2.3.2 \
    POETRY_VIRTUALENVS_CREATE=false \
    POETRY_NO_INTERACTION=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN pip install --no-cache-dir "poetry==$POETRY_VERSION"

WORKDIR /app

COPY pyproject.toml poetry.lock* ./

RUN poetry install --no-cache --without test,dev

COPY . .

EXPOSE 8000

CMD ["poetry", "run", "fastapi", "run", "--host", "0.0.0.0", "--port", "8000"]
