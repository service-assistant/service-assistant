.PHONY: help install dev lint typecheck check production

help:
	@echo "Available commands:"
	@echo "  make install     - Install dependencies"
	@echo "  make dev         - Run dev server with hot reload"
	@echo "  make lint        - Check code style"
	@echo "  make typecheck   - Check TypeScript type correctness"
	@echo "  make check       - Run lint and typecheck (no formatter/test suite configured yet)"
	@echo "  make production  - Build and run production container"

install:
	npm install

dev:
	npm run dev

lint:
	npm run lint

typecheck:
	npm run typecheck

check:
	$(MAKE) lint
	$(MAKE) typecheck

production:
	docker compose -f docker-compose.production.yml up --build -d
