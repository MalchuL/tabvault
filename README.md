# TabVault

TabVault is a **server-capable tab library** with browser-local resilience. The React application works as a static interface, the Chrome extension adds real tab capture, and the FastAPI service can be deployed on any reachable HTTP(S) domain or private-network address. Browser storage remains available whenever the API is intentionally offline or temporarily unreachable.

## Feature documentation

Read the illustrated [TabVault Feature Guide](docs/FEATURE_GUIDE.md) for an implementation-verified explanation of the collection rail, semantic status, Manual checks, Quiet mode, search, recovery, sync, import/export, extension behavior, and MCP tools.

| Mode                   | What runs                         | Where data lives                                | Server required                                                   |
| ---------------------- | --------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| Static web app         | Vite-built frontend               | Browser local storage                           | No                                                                |
| Chrome extension       | MV3 side panel                    | `chrome.storage.local`                          | No                                                                |
| Server-backed platform | Extension or web app plus FastAPI | Server JSON library with browser-local fallback | Required for shared sync, semantic search, import-export, and MCP |

## Use without a server

The Chrome extension can manage a personal tab library entirely offline. It stores saved tabs, collections, tags, display preferences, saved search views, ordering, and undo snapshots in `chrome.storage.local`. It does **not** require Python, Ollama, a network connection, or an MCP client for these workflows.

1. From the project root, run `pnpm install` and then `pnpm build`.
2. In Chrome, open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select `dist/public/`.
4. Open TabVault from its toolbar icon, save tabs, and organize them locally.

> When no API is configured or reachable, TabVault deliberately uses browser-local storage. This is not a failed deployment: capture, editing, collections, dnd-kit reordering, saved views, bulk actions, undo, and compact/instant-preview layouts continue to work offline.

## Deploy the API server

The FastAPI server is a supported first-class runtime. It can bind to a VM address, private network, container ingress, or public HTTP(S) domain; it is **not restricted to localhost**. Every route, including `/health`, requires `Authorization: Bearer <key>`. The startup key defaults to `admin` for initial development, but set a strong unique `TABVAULT_API_KEY` before exposing the service beyond a trusted network.

```bash
cd local-server
uv sync --group dev
TABVAULT_HOST=0.0.0.0 \
TABVAULT_PORT=4817 \
TABVAULT_API_KEY='replace-this-before-public-use' \
TABVAULT_CORS_ORIGINS='https://app.example.com,chrome-extension://YOUR_EXTENSION_ID' \
uv run tabvault-server
```

The service binds to `0.0.0.0:4817` by default and keeps its data under `~/.local/share/tabvault/`. In TabVault, open **Configure API**, enter any absolute `http://` or `https://` endpoint and the matching bearer key, then choose **Save & connect**. The same setting is available in a deployed web app and an unpacked extension. When the server cannot be reached, the application keeps working from browser-local storage.

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

Saved tabs use [dnd-kit](https://dndkit.com/) sortable sensors. Drag from the handle to reorder within a collection; the active row leaves a visible archival-space gap while its compact overlay remains centered under the pointer. The view switcher offers:

| View                | Best for                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| **Standard**        | Reading notes, reviewing full metadata, and editing an individual tab.                                |
| **Compact**         | Rapid scanning of just a favicon and tab title, with an overflow edit action.                         |
| **Instant preview** | Reading a Pocket-style article card extracted with Mozilla Readability when source HTML is available. |

## MCP service

The MCP bridge is TypeScript-based and uses the maintained `@modelcontextprotocol/sdk` framework with Zod tool schemas. It can target any authenticated TabVault API endpoint.

```bash
cd mcp-server
pnpm install
pnpm start
```

Point an MCP client at `node /absolute/path/to/tabvault-ai-tab-manager/mcp-server/node_modules/.bin/tsx /absolute/path/to/tabvault-ai-tab-manager/mcp-server/src/index.ts`. Set both `TABVAULT_SERVER_URL` and `TABVAULT_API_KEY` to the deployed API address and matching key. See [`mcp-server/README.md`](mcp-server/README.md) for its tool contract.

## Development checks

```bash
make check
```

The root command runs the web application’s Prettier, ESLint, TypeScript, and production-build checks; the MCP bridge’s Prettier, ESLint, and TypeScript checks; and the API package’s uv-managed Ruff and mypy checks. Run `pnpm format`, `pnpm lint:fix`, `cd mcp-server && pnpm format`, or `make -C local-server format` to apply the corresponding formatter or safe lint fixes locally. Run `pnpm test:e2e` to execute Playwright coverage for pointer-aligned reordering, visible insertion feedback, and ordered drops at desktop and compact breakpoints.

The API, web app, extension, and MCP bridge remain separate deployable processes by design. They share one authenticated API contract while browser storage remains a deliberate resilient fallback, not a localhost restriction.
