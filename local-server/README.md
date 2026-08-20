# TabVault local server

TabVault v0.2 is an async FastAPI service backed only by SQLite. The default database is
`~/.local/share/tabvault/tabvault.sqlite3`; cached previews, icons, images, backups, model weights,
and the embedded Zvec collection live below the same data directory. Legacy `tabvault.json` files
are neither read nor modified.

## Run locally

```bash
uv sync --group dev
TABVAULT_API_KEY=change-me uv run tabvault-server
```

The server listens on `127.0.0.1:47821` and upgrades SQLite with Alembic at startup. All public
routes use `/api/v1`. If `TABVAULT_API_KEY` is configured, send it as `X-API-Key`; binding to a
non-loopback host is rejected unless a key is configured. Wildcard CORS remains the local default
and emits a startup warning.

Useful settings are shown in [`.env.example`](.env.example). Install the production embedding
model dependencies with `uv sync --extra semantic`; the `deepvk/USER-bge-m3` model is loaded and
downloaded only on first semantic use. Keyword search works without it.

```bash
curl -H 'X-API-Key: change-me' http://127.0.0.1:47821/api/v1/health
uv run alembic upgrade head
uv run pytest
```

`uv run pytest` enforces 90% branch coverage. `make check` also runs Ruff formatting/linting and
mypy.

## MCP

The `tabvault-mcp` command uses the official Python `mcp` package and talks to FastAPI over REST;
it never accesses SQLite directly.

```bash
TABVAULT_SERVER_URL=http://127.0.0.1:47821 \
TABVAULT_API_KEY=change-me \
uv run tabvault-mcp
```

Example MCP host configuration:

```json
{
  "mcpServers": {
    "tabvault": {
      "command": "uv",
      "args": [
        "--directory",
        "/absolute/path/to/local-server",
        "run",
        "tabvault-mcp"
      ],
      "env": {
        "TABVAULT_SERVER_URL": "http://127.0.0.1:47821",
        "TABVAULT_API_KEY": "change-me"
      }
    }
  }
}
```

The mandatory tools are tab list/search/get/save/batch/update/delete/move, group list/create/update/
delete, tag list/tag/untag, export/import, and import validation. Every tool declares typed input
and output schemas plus all four MCP safety annotations.

## Container

```bash
docker build -t tabvault-local-server local-server
docker run --rm -p 47821:47821 \
  -e TABVAULT_API_KEY=change-me \
  -v tabvault-data:/data \
  tabvault-local-server
```

The image installs the semantic extra and exposes `/data` as the database/assets/backups/vector
volume; downloaded model weights are stored in `/data/models`.
