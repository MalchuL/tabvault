# TabVault

A React/Vite tab library with browser-local storage, a Chrome extension, a FastAPI server, and an MCP bridge. Tabs are saved occurrences: repeated URLs retain separate IDs and the original URL.

## Run

```bash
pnpm install
pnpm dev
```

Build with `pnpm build`. Load `dist/public/` as an unpacked Chrome extension for tab capture, or serve that directory as a static website. The website can organize saved records; browser capture requires the extension.

```bash
cd server
uv sync --group dev
uv run tabvault-server
```

Configure the server URL and API key in Settings. For network access, set `TABVAULT_HTTP__API_KEY` and restrictive `TABVAULT_HTTP__CORS_ORIGINS`. All `/api/v1` requests use `X-API-Key`.

```bash
cd mcp
TABVAULT_SERVER_URL=http://127.0.0.1:47821 TABVAULT_HTTP__API_KEY=admin uv run tabvault-mcp
```

## Library behavior

- Standard, Compact, and collection-board views share tab lifecycle and placement commands. Quick Move sits below search and targets manual collections.
- Search matches titles, original URLs, tags, and resolved custom properties. Quick Clean archives exact duplicates; advanced deduplication previews type-based merge policies.
- Edit tab contains a schema-driven custom-property editor. Missing overrides use defaults; resetting removes the override. Undeclared raw values remain stored.
- Note, Agent Review, and Viewed are custom properties. Clients declare conventions on demand without changing an incompatible existing definition. The server assigns no special meaning to these names.
- Local only keeps changes in browser storage. Backend preferred persists changes locally first, then synchronizes tabs, groups, tags, definitions, values, and positions in one transaction. Preferences and saved views stay local.
- Active tabs are archived before permanent removal. Deleting a collection archives and unassigns its members. Hidden records remain inaccessible through MCP.
- The extension commits a complete capture before closing source tabs. It uses `tabs`, `storage`, `sidePanel`, and `alarms`; the alarm retries pending sync work.

Schema v5 is a clean break. Existing browser bytes remain available for recovery download. Old databases are rejected before mutation; use a separate fresh data directory after preserving the old one. There is no automatic upgrade or reset. Server clear, replace, and restore change the library generation; stale clients must export their local copy and explicitly adopt the new server library in Settings.

See [Feature guide](docs/FEATURE_GUIDE.md), [storage and synchronization](docs/STORAGE_AND_ARCHIVE_LIFECYCLE.md), and [grouped contracts](docs/GROUPED_CONTRACTS.md).

## Checks

```bash
pnpm validate
pnpm test:unit
pnpm test:extension
pnpm test:e2e
make -C server check
make -C mcp check
```
