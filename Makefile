.PHONY: help check dev

help:
	@echo "Available commands:"
	@echo "  make check  - Run format-check, lint, typecheck, and test in server, client, and admin"
	@echo "  make dev    - Run server, client, and admin in dev mode simultaneously"

check:
	$(MAKE) -C server check
	$(MAKE) -C client check
	$(MAKE) -C admin check

dev:
	$(MAKE) -C server dev-db
	@trap 'kill 0' EXIT INT TERM; \
	$(MAKE) -C server dev & \
	$(MAKE) -C client dev & \
	$(MAKE) -C admin dev & \
	wait
