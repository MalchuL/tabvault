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

Each request is logged at `INFO` with method, path, status, duration, and a short JSON or text
preview so you can see what came back. 4xx and 5xx lines are `WARNING`. Set `TABVAULT_LOG_LEVEL`
to change verbosity.

Useful settings are shown in [`.env.example`](.env.example). Install the production embedding
model dependencies with `uv sync --extra semantic`; the `deepvk/USER-bge-m3` model is loaded and
downloaded only on first semantic use. Keyword search works without it.

`GET /api/v1/capabilities` reports what this process can do. Each named capability is either
available or includes a short `error` and `fix`:

| Field            | Available when                                                            |
| ---------------- | ------------------------------------------------------------------------- |
| `keywordSearch`  | Always. Titles, notes, URLs, and tags can be searched without embeddings. |
| `semanticSearch` | `sentence-transformers` and `zvec` import in this environment.            |
| `vectorIndex`    | A rebuild has finished in this process and the in-memory index is ready.  |

Dashboard and Settings render that error and fix when meaning-based search is blocked. The usual
first-run failure is a missing semantic extra:

```bash
cd local-server
uv sync --extra semantic
```

Restart `tabvault-server`, then choose **Rebuild index** on Dashboard. The first rebuild downloads
the embedding model into `TABVAULT_DATA_DIR/models` and can take several minutes. If the extra is
installed but the index is empty, capabilities returns “The semantic index has not been built yet”
and the same rebuild action.

```bash
curl -H 'X-API-Key: change-me' http://127.0.0.1:47821/api/v1/health
curl -H 'X-API-Key: change-me' http://127.0.0.1:47821/api/v1/capabilities
uv run alembic upgrade head
uv run pytest
```

`uv run pytest` enforces 90% branch coverage. `make check` also runs Ruff formatting/linting and
mypy.

```bash
docker build -t tabvault-local-server local-server
docker run --rm -p 47821:47821 \
  -e TABVAULT_API_KEY=change-me \
  -v tabvault-data:/data \
  tabvault-local-server
```

The image installs the semantic extra and exposes `/data` as the database/assets/backups/vector
volume; downloaded model weights are stored in `/data/models`.
