.PHONY: lint lint-fix format format-check typecheck test check run

lint:
	uv run ruff check .

lint-fix:
	uv run ruff check . --fix

format:
	uv run ruff format .

format-check:
	uv run ruff format . --check

typecheck:
	uv run pyright

test:
	uv run pytest

check: format-check lint typecheck test

run:
	uv run tabvault-mcp

