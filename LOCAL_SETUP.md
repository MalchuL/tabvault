# TabVault Local-First Setup

TabVault now runs as three cooperating local components. The Chrome extension handles browser capture and UI, the FastAPI server owns the versioned tab library, and the MCP process lets compatible AI agents use that same library through stdio.

| Component            | Default address or command         | Responsibility                                                            |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| Chrome MV3 extension | Load `dist/public/` unpacked       | Side panel, active-tab capture, offline cache, and API connection status. |
| API server           | `http://127.0.0.1:4817` by default | Durable JSON store, API validation, import-export, and backups.           |
| MCP bridge           | `pnpm --dir mcp-server start`      | Agent-facing tools that proxy to the configured API.                      |

## 1. Build and load the Chrome extension

From the project root, run `pnpm build`. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, then select the generated `dist/public/` directory. The TabVault toolbar icon opens the fast-save popup and its workspace action opens the side panel. The extension saves the active web page with **Save active tab**; `Command+Shift+S` on macOS or `Ctrl+Shift+S` elsewhere opens the panel and requests a capture.

## 2. Start the local data server

```bash
cd local-server
uv sync --group dev
TABVAULT_API_KEY=admin uv run tabvault-server
```

The server binds to `0.0.0.0:4817` by default and persists data in `~/.local/share/tabvault/tabvault.json`. Confirm it is available with `curl -H 'Authorization: Bearer admin' http://127.0.0.1:4817/health`. The Chrome extension checks its configured endpoint before syncing; when the server is unavailable, it continues with its browser cache.

> The API accepts any HTTP(S) endpoint configured in TabVault. Before public deployment, use a strong `TABVAULT_API_KEY`, restrict `TABVAULT_CORS_ORIGINS` to trusted origins, and terminate TLS at a reverse proxy or hosting platform.

## 3. Start the MCP service

```bash
cd mcp-server
pnpm install
TABVAULT_SERVER_URL=http://127.0.0.1:4817 TABVAULT_API_KEY=admin pnpm start
```

Configure an MCP-compatible agent to execute `node /absolute/path/to/tabvault-ai-tab-manager/mcp-server/node_modules/.bin/tsx /absolute/path/to/tabvault-ai-tab-manager/mcp-server/src/index.ts`. Set `TABVAULT_SERVER_URL` and `TABVAULT_API_KEY` when the API uses a different domain or bearer key. The service exposes tab, group, tag, search, and JSON/Markdown import-export tools.

## 4. Data transfer behavior

Use `GET /v1/export?format=json` for a precise backup and `GET /v1/export?format=markdown` for a readable, editable transfer document. `POST /v1/import` accepts an `upload` merge or a destructive `replace`. The latter snapshots the prior JSON document in a timestamped `backups/` directory before changing the store. Every failed import returns all discovered issues together, with a stable error code, exact location, expected and received values, and a suggested repair.

## 5. Enable on-device semantic search

TabVault’s vector index is derived from the JSON library and stored locally beside it. Run an Ollama-compatible embedding provider, then launch the local server with its model configuration. The default setup expects `nomic-embed-text` on `http://127.0.0.1:11434`.

```bash
ollama pull nomic-embed-text
TABVAULT_EMBEDDING_MODEL=nomic-embed-text TABVAULT_EMBEDDING_BATCH_SIZE=16 uv run tabvault-server
curl -X POST -H 'Authorization: Bearer admin' http://127.0.0.1:4817/v1/index/rebuild
curl -H 'Authorization: Bearer admin' 'http://127.0.0.1:4817/v1/search?q=agent%20workflows'
```

Search reports `mode: "semantic"` when the local embedding provider responds and `mode: "text_fallback"` otherwise. The fallback remains available without network access, and `GET /v1/index/status` explains whether vectors are ready and why the service may be using text matching. It also reports batch progress during large imports. Reduce `TABVAULT_EMBEDDING_BATCH_SIZE` for constrained machines, or increase it after confirming the local embedding model has enough memory.

The extension’s **Index health** panel can optionally ask the local server to check index readiness every 15 minutes, hour, or four hours. This is a local best-effort timer, not a cloud task: it runs only while the TabVault server is running and performs no external calls. Leave it set to **Off** when manual checks are sufficient.

Enable **Local alerts** only when a schedule is active to receive a Chrome notification if a scheduled local health check reports that the semantic index needs attention. The extension uses the configured local server address and does not send status data to a remote service. Ranked search also supports saved views and bulk recovery: save a query plus collection scope as a reusable local view, then use the temporary **Undo** action after a bulk move, tag, or remove to restore its client-side snapshot and the matching local tab records.

## 6. Quality checks

Run `make check` from the repository root to validate the web app, MCP bridge, and Python API together. For individual packages, use `pnpm validate` at the root, `pnpm validate` in `mcp-server/`, and `make check` in `local-server/`. Run `pnpm test:e2e` to exercise Playwright browser checks for pointer-aligned tab reordering and visible insertion feedback at desktop and compact widths. Python formatting, linting, type checking, and server startup always run through uv.
