# Grouped contracts

Owned object types and models have at most seven fields per level. Function signatures have at
most seven arguments, excluding Python's `self` and `cls`. Props group related state and handlers
under names such as `presentation`, `search`, `selection`, `actions`, and `connection`.
`pnpm check:shapes` checks TypeScript and Python source; `pnpm validate` includes that check.

Saved tabs group their fields into `content`, `annotations`, `placement`, `lifecycle`, and
`timestamps`, alongside `id`. Collections use `details`, `placement` where applicable, and
`timestamps`. Nested PATCH bodies update only supplied fields; omitted fields stay intact.

```json
{
  "content": { "title": "Updated title" },
  "annotations": { "tags": [] },
  "placement": { "groupId": null }
}
```

HTTP routes stay under `/api/v1`. Projection paths use nested names, for example
`fields=id,content.url,annotations.tags`. Flat tab and collection write bodies are rejected.
MCP `update_tab` takes `url` and a `changes` object containing at most seven change fields.

Browser libraries and portable JSON documents use schema version 4. Browser storage groups
`tabs`, `vaultGroups`, `tagCatalog`, `tabOrders`, `savedSearches`, and `tombstones` under `library`,
with `tabView` under `preferences`. Portable documents group `tags`, `groups`, and `tabs` under
`library`; viewed state belongs to `annotations.customProperties`.

The installed browser key remains `tabvault-v3`, but its supported value is strictly schema v4.
Earlier values at that key trigger raw-download and clear recovery. There are no previous-version
parsers, migrations, or compatibility aliases. Database startup creates current tables directly;
it does not upgrade older database schemas. Grouped SQLAlchemy composites use the existing column
names and preserve ordinary transaction boundaries.

Runtime settings group HTTP, storage, logging, preview, and embedding options. Environment names
use `__` between the group and field:

```bash
TABVAULT_HTTP__HOST=127.0.0.1
TABVAULT_HTTP__API_KEY=local-development-key
TABVAULT_STORAGE__DATA_DIR=/absolute/path/to/tabvault-data
TABVAULT_LOGGING__LEVEL=INFO
TABVAULT_EMBEDDING__MODEL=deepvk/USER-bge-m3
```

The MCP bridge also reads `TABVAULT_HTTP__API_KEY`, alongside `TABVAULT_SERVER_URL`.
Old flat setting names are unsupported. See `local-server/.env.example` for current settings.
