# TabVault API

FastAPI and SQLite store Saved Tabs, Groups, Tags, custom-property definitions, deletion markers, generation metadata, and JSON backups. The default data directory is `~/.local/share/tabvault/`.

`VERSION.txt` is the shared release version for the backend and Chrome extension. Packaging reads this file, and the API and health response report the installed package version. After changing it, run `uv lock` and `uv sync` here, then rebuild the extension from the repository root.

```bash
uv sync --group dev
uv run tabvault-server
```

See [`.env.example`](.env.example) for configuration. A network deployment needs a strong `TABVAULT_HTTP__API_KEY` and restrictive `TABVAULT_HTTP__CORS_ORIGINS`. Clients send `X-API-Key`. API metadata is available at `/docs`, `/api/v1/schema`, `/api/v1/errors`, and `/api/v1/health`.

## Network access

The backend defaults to `127.0.0.1:47821`, accepting only loopback connections. To reach it through a network address such as `192.168.1.145`, run this from `server/` on that machine:

```bash
TABVAULT_HTTP__HOST=0.0.0.0 \
TABVAULT_HTTP__API_KEY='your-secret-key' \
uv run tabvault-server
```

Replace `your-secret-key` with a strong key. Binding beyond loopback requires a nonempty API key. Keep the terminal running, then open `http://192.168.1.145:47821/docs`, replacing the example IP with your server's address. `/docs` opens without a key; click **Authorize** and enter the configured key to make API requests.

Set `TABVAULT_HTTP__PORT` to change the listening port and use that port in client URLs. The settings can also be placed in `server/.env`; restart the backend after changing them. `TABVAULT_SERVER_URL` configures the MCP client's destination and does not configure the backend listener. For the extension, enter the server's address and key in **Settings**.

`ERR_CONNECTION_REFUSED` means the connection could not reach a listener. Confirm that startup completed, the URL uses the configured port, and the server's firewall allows incoming TCP connections on that port. An HTTP 401 response means the server is reachable but the API key is missing or incorrect.

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
