# Current API and MCP contract

The FastAPI OpenAPI document (`/openapi.json`, interactive `/docs`) and [schema-v5 JSON schema](../local-server/schema/v5.tabvault.schema.json) are the canonical field contracts. All `/api/v1` operations require the configured `X-API-Key`.

## HTTP surface

- `/tabs`: list and create saved occurrences. `/tabs/batch` creates an atomic bounded capture batch. Individual tab routes edit, archive, permanently delete archived records, manage tags, and set/unset custom-property overrides. `/tabs/order` changes positions.
- `/groups`: list, create, edit, order, and delete collections. Deletion archives and unassigns members. Groups have ordinary string categories and no parent hierarchy.
- `/tags`: catalog operations with explicit detachment when deleting a used tag.
- `/property-schema`: read, define, and remove definitions. Validation reports invalid and undeclared raw values; repair is an explicit mutation.
- `/search`: text query and structured property predicates over visible active records. The contract has no search-mode parameter.
- `POST /sync`: transactional common resource changes, precise token acknowledgements, current generation, full raw snapshot, definition timestamps, and tombstones. `GET /sync` reads the full raw document. See [sync protocol](STORAGE_AND_ARCHIVE_LIFECYCLE.md).
- `/export`, `/import/validate`, and `/import`: portable transfer. Imports explicitly choose `upload` (merge) or `replace`; only schema v5 is accepted.
- `/backups`: list snapshots. `/{id}/download` downloads an authenticated JSON backup and `/{id}/restore` completes a validated replacement directly. `/library` clears the library after a backup.
- `/health`, `/capabilities`, `/schema`, and `/errors`: read-only metadata.

## Properties and identity

Tabs retain stable occurrence IDs and original URLs. Annotations contain only tags and raw `customProperties`. Definitions map names to string, int, float, boolean, or JSON types plus descriptions and defaults. Missing/invalid overrides resolve to defaults; deletion of a definition retains raw values. JSON exports and sync transmit raw values, avoiding accidental materialization of defaults.

`note`, `agentReview`, and `viewed` are client conventions, not backend fields or reserved names. There are no jobs, capture assets, page-preview routes, or search indexes.

## MCP

MCP uses exact saved URLs and human-readable collection names; it does not expose internal resource IDs. Ambiguous URLs select the oldest active visible occurrence. Hidden and archived content is unavailable through tools and resources.

Tools include tab, collection, and tag operations, text search, and generic `property_schema`, `define_property`, `delete_property`, and `unset_properties`. `save_tab` and `update_tab` accept `customProperties`. Writing a missing Note, Agent Review, or Viewed convention registers its definition first; incompatible existing definitions are preserved and reported as an error. Reads do not create definitions.

MCP never fetches saved page contents. It remains a typed HTTP client rather than a second persistence implementation. See [MCP setup and examples](../mcp/README.md).
