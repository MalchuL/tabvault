# TabVault MCP Bridge

The standalone Python MCP service proxies agent tools to TabVault's authenticated REST API through
one asynchronous typed client. It never opens SQLite directly, so API validation, visibility, and
transaction rules remain the source of truth.

## Install and run

```bash
cd mcp
uv sync
TABVAULT_SERVER_URL=http://127.0.0.1:47821 \
TABVAULT_HTTP__API_KEY=change-me \
uv run tabvault-mcp
```

The URL defaults to `http://127.0.0.1:47821`; the API key has no default. Start the local TabVault
API first, then attach an MCP host with the same two variables.

## MCP Inspector (development)

Use [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to exercise tools, resources,
and prompts without an IDE host:

```bash
cd mcp
npx @modelcontextprotocol/inspector
```

Add a stdio server with the settings in [misc/inspector.png](misc/inspector.png):

![MCP Inspector settings for local TabVault development](misc/inspector.png)

| Field             | Value                                                                               |
| ----------------- | ----------------------------------------------------------------------------------- |
| Server ID         | `tabvault`                                                                          |
| Transport         | `stdio (local process)`                                                             |
| Command           | `uv`                                                                                |
| Arguments         | `run` then `tabvault-mcp` (one argument per line)                                   |
| Environment       | `TABVAULT_SERVER_URL=http://127.0.0.1:47821` and `TABVAULT_HTTP__API_KEY=change-me` |
| Working directory | absolute path to this `mcp/` package                                                |

## Cursor

Add a project server in `.cursor/mcp.json`, or a global server in `~/.cursor/mcp.json`. Cursor
Settings → MCP → Add new MCP server uses the same fields as the Inspector screenshot.

```json
{
  "mcpServers": {
    "tabvault": {
      "command": "uv",
      "args": [
        "--directory",
        "/absolute/path/to/tabvault/mcp",
        "run",
        "tabvault-mcp"
      ],
      "env": {
        "TABVAULT_SERVER_URL": "http://127.0.0.1:47821",
        "TABVAULT_HTTP__API_KEY": "change-me"
      }
    }
  }
}
```

Replace the `--directory` path with this repo's `mcp/` folder. After saving, toggle the server on
under Cursor Settings → MCP (or restart Cursor) and confirm `tabvault` shows its tools.

## Codex

Register a stdio server in `~/.codex/config.toml`, or in a trusted project's `.codex/config.toml`:

```toml
[mcp_servers.tabvault]
command = "uv"
args = ["run", "tabvault-mcp"]
cwd = "/absolute/path/to/tabvault/mcp"

[mcp_servers.tabvault.env]
TABVAULT_SERVER_URL = "http://127.0.0.1:47821"
TABVAULT_HTTP__API_KEY = "change-me"
```

Or add the same launch from the CLI:

```bash
codex mcp add tabvault \
  --env TABVAULT_SERVER_URL=http://127.0.0.1:47821 \
  --env TABVAULT_HTTP__API_KEY=change-me \
  -- uv --directory /absolute/path/to/tabvault/mcp run tabvault-mcp
```

In a Codex session, run `/mcp` to confirm the server connected.

## Tools

The service exposes 15 annotated tools with no persisted IDs in their public contracts:

- Tabs: `list_tabs`, `search_tabs`, `get_tab`, `save_tab`, `update_tab`, `delete_tab`, and
  `move_tab`.
- Groups: `list_groups`, `get_group`, `create_group`, `update_group`, and `delete_group`.
- Tags: `list_tags`, `tag_tab`, and `untag_tab`.

Tab tools select the oldest visible exact-URL match. Group tools match names without case and select
the oldest match. IDs remain private to the REST bridge; MCP cannot read or mutate hidden or archived
content.

`update_tab` accepts an exact URL and one `changes` object:

```json
{
  "url": "https://example.com/article",
  "changes": { "title": "Updated title", "viewed": false, "tags": [] }
}
```

Null or omitted changes leave fields unchanged; empty strings and arrays clear them.
Tab results group `content`, `annotations`, `placement`, `lifecycle`, and `timestamps`.

## Resources and prompts

Compact read-only context is available at `tabvault://groups`, `tabvault://tags`,
`tabvault://recent{?limit}`, `tabvault://unassigned{?limit}`, and
`tabvault://tabs{?url}`. The server also exposes the user-selected prompts
`organize_unassigned`, `research_digest`, and `weekly_tab_review`.

These names follow TabVault's domain model: Unassigned is not an Inbox, Saved URLs remain unchanged,
and repeated URLs are separate save occurrences. Prompts propose a plan before any mutation and use
single-record tools after approval.

Resources are read-only snapshots. Groups and tags include their first 100 records; recent and
Unassigned tabs default to 50 and accept `limit` from 1 to 100. Pagination metadata indicates when
more records exist; use `list_groups`, `list_tags`, or `list_tabs` with `limit` and `offset` for more.
Prompts render instructions only, without fetching context or executing changes. Organization
accepts a `limit` from 1 to 100; weekly review defaults to `period="7 days"`; research digest requires
a Group name and defaults to `audience="general"` and `format="markdown"`.

In MCP Inspector:

1. Open **Resources** and list resources: `tabvault://groups` and `tabvault://tags`.
2. List resource templates to discover recent tabs, Unassigned tabs, and exact-URL lookup.
3. Read `tabvault://recent?limit=10` or `tabvault://unassigned?limit=10`.
4. For exact-URL lookup, percent-encode the complete original URL as one query value. For example,
   `https://example.com/a?q=one&next=two#anchor` becomes
   `tabvault://tabs?url=https%3A%2F%2Fexample.com%2Fa%3Fq%3Done%26next%3Dtwo%23anchor`.
   Missing or blank URLs are rejected; stored URLs are never normalized for matching.
5. Open **Prompts**, list prompts, and render `organize_unassigned` with `limit="10"`,
   `weekly_tab_review` with `period="14 days"`, or `research_digest` with `group="Research"`.
   MCP prompt arguments travel as strings, even when validated as integers.

The host decides how to display resources and user-selected prompts; a tools-only host panel does
not mean these server capabilities are absent. Templates are listed separately from static
resources. Duplicate URLs cannot be individually selected by these MCP tools: each mutation targets
the oldest visible exact match. Weekly review uses current timestamps rather than a complete event
history and must disclose incomplete coverage.

Reading resources and calling read tools never registers property definitions. A tab write that
supplies `viewed` registers the boolean definition if absent, preserves an existing boolean
definition, and rejects an incompatible definition before writing the tab.

Implementation references: the official [MCP server concepts](https://modelcontextprotocol.io/docs/learn/server-concepts),
[Python resource guide](https://py.sdk.modelcontextprotocol.io/servers/resources/),
[prompt guide](https://py.sdk.modelcontextprotocol.io/servers/prompts/), and
[in-memory testing guide](https://py.sdk.modelcontextprotocol.io/get-started/testing/).

## Development

```bash
cd mcp
uv sync
make check
```

The check runs Ruff formatting and linting, strict Pyright, and pytest with a 90% coverage floor.
