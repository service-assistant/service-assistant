# Colors
RESET  := \033[0m
BOLD   := \033[1m
CYAN   := \033[36m
GREEN  := \033[32m
YELLOW := \033[33m
GRAY   := \033[90m

.PHONY: help dev staging production docs test lint format format-check typecheck check migrations reset-db

help:
	@echo ""
	@echo "  $(BOLD)$(CYAN)Asystent Serwisanta$(RESET)"
	@echo ""
	@echo "  $(BOLD)Available commands:$(RESET)"
	@echo "  $(GREEN)install$(RESET)           $(GRAY)-$(RESET) Install needed dependencies"
	@echo "  $(GREEN)dev$(RESET)               $(GRAY)-$(RESET) Run development environment with hot reloading $(GRAY)(port 8000)$(RESET)"
	@echo "  $(GREEN)staging$(RESET)           $(GRAY)-$(RESET) Run staging environment $(GRAY)(port 8001)$(RESET)"
	@echo "  $(GREEN)production$(RESET)        $(GRAY)-$(RESET) Run production environment $(GRAY)(port 8000)$(RESET)"
	@echo "  $(GREEN)test$(RESET)              $(GRAY)-$(RESET) Run tests"
	@echo "  $(GREEN)lint$(RESET)              $(GRAY)-$(RESET) Check code style"
	@echo "  $(GREEN)format$(RESET)            $(GRAY)-$(RESET) Format code"
	@echo "  $(GREEN)format-check$(RESET)      $(GRAY)-$(RESET) Check formatting without applying"
	@echo "  $(GREEN)typecheck$(RESET)         $(GRAY)-$(RESET) Check Python type correctness"
	@echo "  $(GREEN)check$(RESET)             $(GRAY)-$(RESET) Run format-check, lint, and typecheck"
	@echo "  $(GREEN)docs$(RESET)              $(GRAY)-$(RESET) Open documentation page $(GRAY)(port 8000)$(RESET)"
	@echo "  $(GREEN)migrations$(RESET)        $(GRAY)-$(RESET) Lists all Alembic migrations"
	@echo "  $(GREEN)reset-db$(RESET)          $(GRAY)-$(RESET) Compose down & remove postgres data volume"
	@echo ""
	@echo "  $(YELLOW)NOTE:$(RESET) All commands used to start the application also run all migrations before."
	@echo ""

install:
	poetry install
dev:
	docker compose -f docker-compose.dev.yml up --build
staging:
	docker compose -f docker-compose.staging.yml up --build
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
migrations:
	poetry run alembic history --verbose
reset-db:
	docker compose -f docker-compose.dev.yml down
	docker volume rm service-assistant-dev_pgdata_dev
