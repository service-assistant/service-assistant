.PHONY: help install dev android test lint format format-check typecheck check production

help:
	@echo "Available commands:"
	@echo "  make install       - Install dependencies"
	@echo "  make dev           - Start Expo dev server"
	@echo "  make android       - Start android app"
	@echo "  make test          - Run tests"
	@echo "  make lint          - Check code style"
	@echo "  make format        - Format code"
	@echo "  make format-check  - Check formatting without applying"
	@echo "  make typecheck     - Check TypeScript type correctness"
	@echo "  make check         - Run format-check, lint, typecheck, and test"
	@echo "  make production    - Build and run production web container"

install:
	npm install

dev:
	npm run start

android:
	npm run android

test:
	npm run test

lint:
	npm run lint

format:
	npm run format

format-check:
	npm run format-check

typecheck:
	npm run typecheck

check:
	$(MAKE) format-check
	$(MAKE) lint
	$(MAKE) typecheck
	$(MAKE) test

production:
	docker compose -f compose.production.yml up --build -d
