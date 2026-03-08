.PHONY: help install dev start test lint format

help:
	@echo "Available commands:"
	@echo "  make dev      - Start dev server"
	@echo "  make start    - Start prod server"
	@echo "  make test     - Run tests"
	@echo "  make lint     - Check code style"
	@echo "  make format   - Format code"

install:
	poetry install

dev:
	poetry run fastapi dev

start:
	poetry run fastapi run

test:
	poetry run pytest

lint:
	poetry run ruff check app tests

format:
	poetry run ruff format app tests
