.PHONY: help check dev install test lint format format-check typecheck production

help:
	@echo "Available commands:"
	@echo "  make install       - Install dependencies in api, app, and admin"
	@echo "  make dev           - Run api, app, admin, and landing in dev mode simultaneously"
	@echo "  make test          - Run tests in api, app, and admin"
	@echo "  make lint          - Check code style in api, app, and admin"
	@echo "  make format        - Format code in api, app, and admin"
	@echo "  make format-check  - Check formatting in api, app, and admin"
	@echo "  make typecheck     - Check types in api, app, and admin"
	@echo "  make check         - Run format-check, lint, typecheck, and test in api, app, and admin"
	@echo "  make production    - Build and run production containers for api, app, admin, and landing"

install:
	$(MAKE) -C api install
	$(MAKE) -C app install
	$(MAKE) -C admin install

dev:
	@trap 'kill 0' EXIT INT TERM; \
	$(MAKE) -C api dev & \
	$(MAKE) -C app dev & \
	$(MAKE) -C admin dev & \
	$(MAKE) -C landing dev & \
	wait

test:
	$(MAKE) -C api test
	$(MAKE) -C app test
	$(MAKE) -C admin test

lint:
	$(MAKE) -C api lint
	$(MAKE) -C app lint
	$(MAKE) -C admin lint

format:
	$(MAKE) -C api format
	$(MAKE) -C app format
	$(MAKE) -C admin format

format-check:
	$(MAKE) -C api format-check
	$(MAKE) -C app format-check
	$(MAKE) -C admin format-check

typecheck:
	$(MAKE) -C api typecheck
	$(MAKE) -C app typecheck
	$(MAKE) -C admin typecheck

check:
	$(MAKE) -C api check
	$(MAKE) -C app check
	$(MAKE) -C admin check

production:
	$(MAKE) -C api production
	$(MAKE) -C app production
	$(MAKE) -C admin production
	$(MAKE) -C landing production
