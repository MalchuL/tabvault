.PHONY: lint lint-fix format format-check typecheck test migrate check run mcp docker-build

lint:
	uv run ruff check .

lint-fix:
	uv run ruff check . --fix

format:
	uv run ruff format .

format-check:
	uv run ruff format . --check

typecheck:
	uv run mypy src

test:
	uv run pytest

migrate:
	uv run alembic upgrade head

check: format-check lint typecheck test

run:
	uv run tabvault-server

mcp:
	uv run tabvault-mcp

docker-build:
	docker build -t tabvault-local-server .
