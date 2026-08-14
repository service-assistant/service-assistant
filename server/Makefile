# Colors
RESET  := \033[0m
BOLD   := \033[1m
CYAN   := \033[36m
GREEN  := \033[32m
YELLOW := \033[33m
GRAY   := \033[90m

.PHONY: help dev dev-db production docs test lint format format-check typecheck check migrations

help:
	@echo ""
	@echo "  $(BOLD)$(CYAN)Asystent Serwisanta$(RESET)"
	@echo ""
	@echo "  $(BOLD)Available commands:$(RESET)"
	@echo "  $(GREEN)install$(RESET)           $(GRAY)-$(RESET) Install needed dependencies"
	@echo "  $(GREEN)dev$(RESET)               $(GRAY)-$(RESET) Run dev database + api with hot reloading $(GRAY)(port 8000)$(RESET)"
	@echo "  $(GREEN)dev-db$(RESET)            $(GRAY)-$(RESET) Run only the dev database $(GRAY)(port 5432)$(RESET)"
	@echo "  $(GREEN)production$(RESET)        $(GRAY)-$(RESET) Run production environment $(GRAY)(port 8000)$(RESET)"
	@echo "  $(GREEN)test$(RESET)              $(GRAY)-$(RESET) Run tests $(GRAY)(needs a local Postgres, see .env.test)$(RESET)"
	@echo "  $(GREEN)lint$(RESET)              $(GRAY)-$(RESET) Check code style"
	@echo "  $(GREEN)format$(RESET)            $(GRAY)-$(RESET) Format code"
	@echo "  $(GREEN)format-check$(RESET)      $(GRAY)-$(RESET) Check formatting without applying"
	@echo "  $(GREEN)typecheck$(RESET)         $(GRAY)-$(RESET) Check Python type correctness"
	@echo "  $(GREEN)check$(RESET)             $(GRAY)-$(RESET) Run format-check, lint, and typecheck"
	@echo "  $(GREEN)docs$(RESET)              $(GRAY)-$(RESET) Open documentation page $(GRAY)(port 8000)$(RESET)"
	@echo "  $(GREEN)migrations$(RESET)        $(GRAY)-$(RESET) Lists all Alembic migrations"
	@echo ""
	@echo "  $(YELLOW)NOTE:$(RESET) All commands used to start the application also run all migrations before."
	@echo ""

install:
	poetry install
dev-db:
	docker compose -f docker-compose.db.yml up -d --wait
dev:
	docker compose -f docker-compose.dev.yml up
production:
	docker compose -f docker-compose.production.yml up --build
docs:
	open http://localhost:8000
test:
	poetry run pytest
lint:
	poetry run ruff check app tests alembic
format:
	poetry run ruff format app tests
format-check:
	poetry run ruff format --check app tests
typecheck:
	poetry run pyright
check:
	$(MAKE) format-check
	$(MAKE) lint
	$(MAKE) typecheck
	$(MAKE) test
migrations:
	poetry run alembic history --verbose
