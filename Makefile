.PHONY: help check dev devb install test lint format format-check typecheck production

ifeq ($(OS),Windows_NT)
SHELL := C:/PROGRA~1/Git/bin/bash.exe
MAKE := make
endif

help:
	@echo "Available commands:"
	@echo "  make install       - Install dependencies in api, app, admin, and debug"
	@echo "  make dev           - Run api, app, admin, debug, and landing in dev mode simultaneously"
	@echo "  make devb          - Same as dev, but rebuilds the api containers first (use after dependency changes)"
	@echo "  make test          - Run tests in api, app, admin, and debug"
	@echo "  make lint          - Check code style in api, app, admin, and debug"
	@echo "  make format        - Format code in api, app, admin, and debug"
	@echo "  make format-check  - Check formatting in api, app, admin, and debug"
	@echo "  make typecheck     - Check types in api, app, admin, and debug"
	@echo "  make check         - Run format-check, lint, typecheck, and test in api, app, admin, and debug"
	@echo "  make production    - Build and run production containers for api, app, admin, debug, and landing"

install:
	$(MAKE) -C api install
	$(MAKE) -C app install
	$(MAKE) -C admin install
	$(MAKE) -C debug install

dev:
	@cleanup() { jobs -p | xargs -r kill; }; \
	trap cleanup EXIT INT TERM; \
	$(MAKE) -C api dev & \
	$(MAKE) -C app dev & \
	$(MAKE) -C admin dev & \
	$(MAKE) -C debug dev & \
	$(MAKE) -C landing dev & \
	wait

# Only api runs in containers, so it is the only app with a rebuild variant.
devb:
	@cleanup() { jobs -p | xargs -r kill; }; \
	trap cleanup EXIT INT TERM; \
	$(MAKE) -C api devb & \
	$(MAKE) -C app dev & \
	$(MAKE) -C admin dev & \
	$(MAKE) -C debug dev & \
	$(MAKE) -C landing dev & \
	wait

test:
	$(MAKE) -C api test
	$(MAKE) -C app test
	$(MAKE) -C admin test
	$(MAKE) -C debug test

lint:
	$(MAKE) -C api lint
	$(MAKE) -C app lint
	$(MAKE) -C admin lint
	$(MAKE) -C debug lint

format:
	$(MAKE) -C api format
	$(MAKE) -C app format
	$(MAKE) -C admin format
	$(MAKE) -C debug format

format-check:
	$(MAKE) -C api format-check
	$(MAKE) -C app format-check
	$(MAKE) -C admin format-check
	$(MAKE) -C debug format-check

typecheck:
	$(MAKE) -C api typecheck
	$(MAKE) -C app typecheck
	$(MAKE) -C admin typecheck
	$(MAKE) -C debug typecheck

check:
	$(MAKE) -C api check
	$(MAKE) -C app check
	$(MAKE) -C admin check
	$(MAKE) -C debug check

production:
	$(MAKE) -C api production
	$(MAKE) -C app production
	$(MAKE) -C admin production
	$(MAKE) -C debug production
	$(MAKE) -C landing production
