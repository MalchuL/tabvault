FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --extra semantic --no-install-project
COPY . ./
RUN uv sync --frozen --no-dev --extra semantic

FROM python:3.13-slim-bookworm AS runtime

ENV PATH=/app/.venv/bin:$PATH \
    TABVAULT_HOST=0.0.0.0 \
    TABVAULT_PORT=47821 \
    TABVAULT_DATA_DIR=/data \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY --from=builder /app /app
VOLUME ["/data", "/data/models"]
EXPOSE 47821
CMD ["tabvault-server"]
