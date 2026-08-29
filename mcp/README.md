# TabVault MCP Bridge

The standalone Python MCP service proxies agent tools to TabVault's authenticated REST API through
one asynchronous typed client. It never opens SQLite directly, so API validation, visibility, and
transaction rules remain the source of truth.

## Install and run

```bash
cd mcp
uv sync
TABVAULT_SERVER_URL=http://127.0.0.1:47821 \
TABVAULT_API_KEY=change-me \
uv run tabvault-mcp
```

Point an MCP host at `uv --directory /absolute/path/to/tabvault/mcp run tabvault-mcp` with the same
two environment variables. The URL defaults to `http://127.0.0.1:47821`; the API key has no default.

## Tools

The service exposes 20 annotated tools:

- Tabs: `list_tabs`, `search_tabs`, `get_tab`, `save_tab`, `update_tab`, `delete_tab`, `move_tab`,
  and `reorder_tabs`.
- Exact URL operations: `get_tab_by_url`, `list_tabs_by_url`, `update_tabs_by_url`,
  `tag_tabs_by_url`, and `untag_tabs_by_url`.
- Groups: `list_groups`, `create_group`, `update_group`, and `delete_group`.
- Tags: `list_tags`, `tag_tab`, and `untag_tab`.

URL bulk mutations are best effort. Their result contains `matched`, successful updated objects in
`data`, and failures as `{tabId, message}` entries in `errors`. MCP cannot read or mutate hidden or
archived content.

## Resources and prompts

Compact read-only context is available at `tabvault://groups`, `tabvault://tags`,
`tabvault://recent{?limit}`, `tabvault://unassigned{?limit}`, and
`tabvault://tabs/{tabId}`. The server also exposes the user-selected prompts
`organize_unassigned`, `research_digest`, and `weekly_tab_review`.

These names follow TabVault's domain model: Unassigned is not an Inbox, Saved URLs remain unchanged,
and repeated URLs are separate save occurrences. Prompts propose a plan before any mutation and use
single-record tools after approval.

## Development

```bash
cd mcp
uv sync
make check
```

The check runs Ruff formatting and linting, strict Pyright, and pytest with a 90% coverage floor.
