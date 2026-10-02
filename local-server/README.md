# TabVault API

FastAPI and SQLite store Saved Tabs, Groups, Tags, custom-property definitions, deletion markers, generation metadata, and JSON backups. The default data directory is `~/.local/share/tabvault/`.

```bash
uv sync --group dev
uv run tabvault-server
```

See [`.env.example`](.env.example) for configuration. A network deployment needs a strong `TABVAULT_HTTP__API_KEY` and restrictive `TABVAULT_HTTP__CORS_ORIGINS`. Clients send `X-API-Key`. API metadata is available at `/docs`, `/api/v1/schema`, `/api/v1/errors`, and `/api/v1/health`.

## Persistence

Only schema v5 is supported. Startup rejects an existing incompatible database before creating or changing tables. Preserve the old data directory and select a fresh `TABVAULT_STORAGE__DATA_DIR`; this release does not migrate or reset it.

Resource endpoints support direct operations and MCP. `POST /api/v1/sync` applies all pending library resources in one transaction, acknowledges exact client tokens, and returns a complete snapshot plus deletion markers. Newer timestamps win; ties retain the server record. Tab/group IDs cannot be resurrected after permanent deletion. Names can be explicitly recreated with a newer timestamp.

Clear, replace, and restore change the server generation. A request with an old generation receives 409 before any mutation. JSON backups are written before destructive replacement. Restore completes inside the request transaction; there is no worker or job queue.

Search uses saved metadata and resolved custom-property values. Custom-property types and defaults are generic; naming conventions belong to clients.

## Checks and deployment

```bash
make check
make docker-build
```

The image exposes port 47821 and uses `/data` for persistent database and backup files. The package checks formatting, Ruff, strict mypy, and pytest with a 90% coverage floor.
