# Local setup

## Web and extension

```bash
pnpm install
pnpm build
```

Load `dist/public/` as an unpacked Chrome extension. Local-only mode needs no server.

## SQLite API

```bash
cd local-server
uv sync --group dev
TABVAULT_API_KEY=admin uv run tabvault-server
```

The API defaults to `http://127.0.0.1:47821/api/v1`. It stores its SQLite database and derived
assets under `~/.local/share/tabvault/` and runs Alembic upgrades on startup. Test it with:

```bash
curl -H 'X-API-Key: admin' http://127.0.0.1:47821/api/v1/health
```

For a network bind, set both `TABVAULT_HOST=0.0.0.0` and a strong `TABVAULT_API_KEY`. Configure a
restrictive `TABVAULT_CORS_ORIGINS`; wildcard CORS is intended for local development.

JSON and Markdown transfer use `GET /api/v1/export?format=...`, `POST /api/v1/import?mode=upload`,
and `POST /api/v1/import/validate`. Replace import and clear-library operations create backups.

## Semantic search

```bash
cd local-server
uv sync --extra semantic
TABVAULT_API_KEY=admin uv run tabvault-server
```

`deepvk/USER-bge-m3` loads lazily and caches in the data directory. Zvec is local and persistent.
Hybrid search falls back to keyword with a warning if model weights are unavailable; explicit
semantic search returns `503 E_SEMANTIC_UNAVAILABLE`.

## Official MCP bridge

```bash
cd local-server
TABVAULT_SERVER_URL=http://127.0.0.1:47821 \
TABVAULT_API_KEY=admin \
uv run tabvault-mcp
```

The bridge uses the official Python `mcp` package and forwards `/api/v1` REST calls with
`X-API-Key`. It does not open SQLite.

## Verification

```bash
make check
```

The root check validates the frontend/extension and the uv-managed backend. Backend pytest enforces
90% branch coverage. Build the standalone server image with `make -C local-server docker-build`.
