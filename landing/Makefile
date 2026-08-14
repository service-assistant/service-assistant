.PHONY: help dev production

help:
	@echo "Available commands:"
	@echo "  make dev         - Run via Caddy (same image as production, no hot reload)"
	@echo "  make production  - Build and run production container"

dev:
	docker compose -f compose.production.yml up --build

production:
	docker compose -f compose.production.yml up --build -d
