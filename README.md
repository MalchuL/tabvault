# TabVault

TabVault is a **server-capable tab library** with browser-local resilience. The React application works as a static interface, the Chrome extension adds real tab capture, and the FastAPI service can be deployed on any reachable HTTP(S) domain or private-network address. Browser storage remains available whenever the API is intentionally offline or temporarily unreachable.

## Feature documentation

Read the illustrated [TabVault Feature Guide](docs/FEATURE_GUIDE.md) for an implementation-verified explanation of the collection rail, semantic status, Manual checks, Quiet mode, search, recovery, sync, import/export, extension behavior, and MCP tools. The precise [Storage and Archive Lifecycle](docs/STORAGE_AND_ARCHIVE_LIFECYCLE.md) explains Local only versus Backend preferred storage, URL uniqueness, recovery, and permanent deletion.

| Mode                   | What runs                         | Where data lives                                  | Server required                                                   |
| ---------------------- | --------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| Static web app         | Vite-built frontend               | Browser local storage                             | No                                                                |
| Chrome extension       | MV3 side panel                    | `chrome.storage.local`                            | No                                                                |
| Server-backed platform | Extension or web app plus FastAPI | Server SQLite library with browser-local fallback | Required for shared sync, semantic search, import-export, and MCP |

## Use without a server

The Chrome extension can manage a personal tab library entirely offline. It stores saved tabs, collections, tags, display preferences, saved search views, ordering, and undo snapshots in `chrome.storage.local`. It does **not** require Python, Ollama, a network connection, or an MCP client for these workflows.

1. From the project root, run `pnpm install` and then `pnpm build`.
2. In Chrome, open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select `dist/public/`.
4. Open TabVault from its toolbar icon, save tabs, and organize them locally.

> In **Local only** mode, TabVault deliberately keeps all changes in browser storage. In **Backend preferred** mode, it writes locally first and pushes to the configured API when reachable. Neither mode loses a link because a server is temporarily offline. Removing an active tab archives it; adding the same normalized URL restores its existing record and metadata.

## Deploy the API server

The FastAPI server is a supported first-class runtime. It defaults to loopback; a non-loopback bind requires `TABVAULT_API_KEY`. Configured keys are sent through `X-API-Key` on every `/api/v1` route.

```bash
cd local-server
uv sync --group dev
TABVAULT_HOST=0.0.0.0 \
TABVAULT_PORT=47821 \
TABVAULT_API_KEY='replace-this-before-public-use' \
TABVAULT_CORS_ORIGINS='https://app.example.com,chrome-extension://YOUR_EXTENSION_ID' \
uv run tabvault-server
```

The service keeps SQLite, previews, assets, backups, model weights, and Zvec data under `~/.local/share/tabvault/`. In TabVault, enter the server URL and matching API key. When it cannot be reached, the application keeps working from browser-local storage.

## Deploy the static interface

This repository is a Vite static site. Build the frontend with:

```bash
pnpm install
pnpm build
```

Publish the contents of `dist/public/` to any static host or use the project’s built-in publishing flow. The hosted interface persists offline state in browser storage and can connect to any configured, CORS-enabled HTTP(S) TabVault API. It cannot capture a visitor’s real browser tabs—that capability belongs to the Chrome extension—but it can manage server-backed tabs, run semantic search, import/export, and use a remote API domain.

## Extension permissions

The MV3 manifest requests only the permissions needed for the product: `tabs` for active-tab capture, `storage` for offline data, `sidePanel` for the workspace, and optional `alarms` plus `notifications` for index-health alerts. Configure an HTTP(S) API endpoint and bearer key in **Configure API**. Add the target origin to the extension manifest host permissions when packaging a deployment-specific build.

## dnd-kit ordering and tab views

Saved tabs use [dnd-kit](https://dndkit.com/) sortable sensors. Drag from the handle to reorder within a collection; the active row leaves a visible archival-space gap while the dragged card preserves the exact point at which it was grabbed. The view switcher offers:

| View                | Best for                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| **Standard**        | Reading notes, reviewing full metadata, and editing an individual tab.                                |
| **Compact**         | Rapid scanning of just a favicon and tab title, with an overflow edit action.                         |
| **Instant preview** | Reading a Pocket-style article card extracted with Mozilla Readability when source HTML is available. |

## MCP service

The MCP bridge uses the official Python `mcp` package and proxies typed tools to the REST API.

```bash
cd local-server
TABVAULT_SERVER_URL=http://127.0.0.1:47821 TABVAULT_API_KEY=admin uv run tabvault-mcp
```

Point an MCP client at `uv --directory /absolute/path/to/local-server run tabvault-mcp` and set `TABVAULT_SERVER_URL` plus `TABVAULT_API_KEY`.

## Development checks

```bash
make check
```

The root command runs web/extension validation and the API package’s uv-managed Ruff, mypy, pytest, and 90% branch-coverage checks. Run `pnpm format`, `pnpm lint:fix`, or `make -C local-server format` to apply formatting. Run `pnpm test:e2e` for browser reordering coverage.

The API, web app, extension, and MCP bridge remain separate deployable processes by design. They share one authenticated API contract while browser storage remains a deliberate resilient fallback, not a localhost restriction.
