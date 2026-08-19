# TabVault API Server

This package is the deployable HTTP source of truth for TabVault. It binds to `0.0.0.0` by default, stores its JSON data under `~/.local/share/tabvault/`, and creates a timestamped backup before a destructive `replace` import. It can be hosted locally, on a private network, or behind a public HTTPS domain.

## Run the authenticated API

Use uv to create the managed virtual environment, install the runtime plus quality tools, then start the server.

```bash
cd local-server
uv sync --group dev
TABVAULT_HOST=0.0.0.0 TABVAULT_PORT=4817 TABVAULT_API_KEY=admin uv run tabvault-server
```

Every endpoint requires `Authorization: Bearer <TABVAULT_API_KEY>`. The development key defaults to `admin`; change it before public deployment. Set `TABVAULT_CORS_ORIGINS` to a comma-separated list of deployed web-app or extension origins, `TABVAULT_DATA_DIR` for a different storage directory, and `TABVAULT_HOST` or `TABVAULT_PORT` for network binding. The CORS default of `*` is intended only for development.

## Quality commands

The API package uses uv to run every Python development tool from its managed environment. Run `make check` for formatter validation, Ruff linting, and strict mypy type checks. Use `make format` to apply the Ruff formatter, `make lint-fix` for safe Ruff fixes, and `make run` to launch the server through uv.

## Main endpoints

| Endpoint                 | Purpose                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `GET /health`            | Verify server availability and schema version.                                              |
| `GET /v1/library`        | Read the complete local document.                                                           |
| `POST /v1/tabs`          | Save an HTTP/HTTPS tab with URL deduplication.                                              |
| `GET /v1/export`         | Export a complete or filtered JSON/Markdown document.                                       |
| `POST /v1/import`        | Run `upload` or backup-protected `replace` imports.                                         |
| `GET /v1/search?q=`      | Run semantic vector search, with transparent text fallback when embeddings are unavailable. |
| `GET /v1/index/status`   | Inspect embedding provider, model, vector count, and fallback reason.                       |
| `POST /v1/index/rebuild` | Rebuild the derived local vector cache from the JSON source of truth.                       |

The server returns all discovered import errors in a single response. Each issue includes a stable code, object path, expected value, received value, human explanation, and suggested fix.

## On-device semantic search

TabVault maintains `tabvault.vectors.json` next to the authoritative JSON library. This is a derived cache only: the JSON library is still the source of truth, and TabVault can continue to search using its deterministic text fallback if the local model is offline.

Start an [Ollama](https://ollama.com/) embedding model locally, then start TabVault with its address and model name. The default configuration expects `nomic-embed-text` at `http://127.0.0.1:11434`.

```bash
ollama pull nomic-embed-text
TABVAULT_EMBEDDING_MODEL=nomic-embed-text tabvault-server
```

Use `POST /v1/index/rebuild` after changing the model. Override `TABVAULT_EMBEDDING_BASE_URL`, `TABVAULT_EMBEDDING_MODEL`, or `TABVAULT_EMBEDDING_TIMEOUT` for compatible local deployments. Semantic responses report `mode: "semantic"`; fallback responses report `mode: "text_fallback"` and include the embedding error in `semanticIndex.lastError`.

Large imports are embedded in bounded local batches. Set `TABVAULT_EMBEDDING_BATCH_SIZE` to tune the number of records sent to the local provider per request; the default is `16`. `GET /v1/index/status` exposes the active batch size together with `progress.total`, `progress.processed`, and `progress.batches`, while the JSON library remains immediately usable even when indexing is in progress.

Pass `group=<group-id>` to `GET /v1/search` to constrain semantic or fallback search to one collection. Health checks are disabled by default. Use `PUT /v1/index/health-check` with `{"intervalSeconds": 900}` to enable a local, best-effort readiness check while the server process is running; set the interval to `0` to disable it. `GET /v1/index/status` includes the persisted schedule and the most recent check result, while `POST /v1/index/health-check/run` executes a manual check.

Include `"notifyOnNeedsAttention": true` in the health-check configuration to persist the local alert preference. The API records `lastAlert` when an attention state is found; the unpacked Chrome extension can use that preference with its local alarm and notification permissions to show an on-device alert. `POST /v1/tabs/restore` accepts a local undo snapshot and restores or updates its tab records without making vectors the source of truth.
