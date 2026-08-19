.PHONY: lint lint-fix format format-check typecheck check run

lint:
	uv run ruff check .

lint-fix:
	uv run ruff check . --fix

format:
	uv run ruff format .

format-check:
	uv run ruff format . --check

typecheck:
	uv run mypy tabvault_server

check: format-check lint typecheck

run:
	uv run tabvault-server
