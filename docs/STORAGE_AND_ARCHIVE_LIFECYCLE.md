# Storage, lifecycle, and synchronization

## Local commit

All browser mutations go through `commitLibrary` and pure library operations. A Web Lock serializes read/modify/write across app windows and the extension worker. A single storage write contains the effective library and pending resource changes. React observes committed snapshots; drag previews remain in memory until drop. Capture closes source tabs only after that write succeeds.

The browser stores schema v5 under the existing `tabvault-v3` key so incompatible data can be detected and exported intact. No migration runs. Failed validation or persistence does not overwrite a prior copy.

## Shared sync

`POST /api/v1/sync` accepts `schemaVersion`, `generation`, and `changes`. Each change contains `kind` (`tab`, `group`, `tag`, or `property`), stable `id`, unique `token`, offset-aware `updatedAt`, and a complete portable `data` object or null for deletion.

The server validates and stages prerequisites before tabs, applies deletions last, and commits once. Any invalid change rolls back the whole batch. It returns the generation, full raw document, acknowledged tokens, property timestamps, and tombstones. Newer record timestamps win; exact ties retain the server value. Property defaults are resolved at read time and are not copied into raw tab values.

The client removes only the tokens actually acknowledged, then overlays edits made while the request was in flight. Failed requests and lost responses retain pending changes. Permanent tab/group tombstones defeat stale upserts. Tag/property deletion keeps a timestamp so newer explicit recreation is possible. Group deletion archives and unassigns members; tag deletion detaches links and updates affected tab timestamps.

Resource-specific HTTP/MCP writes use the same stored timestamps and tombstones, so browser sync observes them. Positions live on records; no separate persisted order lists exist. Display preferences remain local.

The extension owns sync in extension contexts. Other browser contexts use a shared sync lock. Startup, reconnection, explicit refresh, and periodic checks retry durable pending work. User refresh intervals control clean-state polling; pending work remains retryable when periodic refresh is off.

## Authoritative replacement

Clear, full replacement, scoped replacement, and backup restore change the server generation. Clients with an older generation receive 409 without uploading. Settings offers **Export local copy and load server library**: export the local copy, then explicitly replace its library and pending queue with the current server snapshot. Preferences remain local.

A fresh client with no generation may upload its pending local records. A client that has learned a generation cannot silently switch to a restored or unrelated server library.

## Lifecycle

A Saved Tab is one occurrence with its own ID, original URL, optional group, and position. Saving the same URL creates another occurrence. Unassigned is a null group reference, not a stored Group.

Archive clears group membership and records an archive timestamp. Permanent deletion is exposed only for archived records. Restore clears archive state but retains a future hidden-until time. Deleting a Group archives and unassigns all members, including hidden ones. Empty Groups remain until explicitly removed.

Hidden and archived content stays outside MCP visibility. Browser views expose the appropriate lifecycle actions per record; there is no saved-tab multi-selection. Collection-level operations and extension multi-tab capture remain available.

## Imports and backups

JSON exports preserve definitions, raw values, identity, positions, and lifecycle. Markdown remains a readable interchange for active links and property metadata. Import validation runs before mutation. Server replacement first saves a complete JSON backup; direct restore validates the backup and replaces the library within the request transaction. Backups do not depend on background jobs.

Browser JSON includes hidden and archived tabs. Server JSON follows the public export visibility policy: archived tabs are included, but active tabs with a future hide deadline are omitted. Download a registered server backup or use Browser JSON when hidden tabs must be preserved. Portable responses retain nullable placement and lifecycle fields so the same JSON can be imported in either storage mode.

Merge keeps existing property definitions and adds missing ones in both storage modes; an import cannot silently change an existing definition's type or default. Newer tab, group, and tag timestamps win, and ties retain the destination record. Replace adopts the imported definitions and removes destination-only portable records. Browser-local imports create durable pending changes and can advance modification timestamps. Server imports preserve supplied record timestamps.

Markdown preserves active tab IDs, original URLs, titles, tag links, raw custom properties, property definitions, collection names, and descriptions. It omits hidden and archived tabs, unused tag catalog entries, and tag descriptions; collection IDs, categories, colors, positions, and timestamps are not a full backup. On import, collections receive new IDs and the `manual` category. Both `.md` and `.markdown` files use this parser. Browser preferences, display colors/icons, and sync bookkeeping are outside the portable export contract.

## Inspecting UI transfer tests

Run `pnpm test:e2e:transfer` for the focused suite, or `pnpm test:e2e --workers=2` for all UI tests. Backend cases require `cd server && uv sync --group dev` first. Each backend test starts the real FastAPI application on an automatically assigned loopback port with a disposable API key, temporary SQLite database, and backup directory. Cleanup stops the process and removes those fixtures. Browser-only cases use isolated local storage and an unavailable API endpoint.

| Scenario                         | What the test checks                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser JSON export              | Every portable field; hidden and archived tabs; distinct occurrences of an identical URL; no storage mutation                                         |
| Offline merge and replace        | Exported bytes imported through the file picker; persistence after reload; re-export; repeated import without duplicate identities or timestamp drift |
| Raw recovery JSON                | Settings-style browser vault files use the same import flow                                                                                           |
| Local replacement                | Destination-only records and definitions disappear; destination display preferences remain                                                            |
| Merge conflicts in both modes    | Newer imports win; older and equal timestamps lose; unrelated records and existing definition meanings survive                                        |
| Authenticated server imports     | Browser JSON survives merge/replace, server persistence, browser cache adoption, reload, and repeat import; requests use the configured API key       |
| Server JSON                      | Exact exported records survive server and offline browser imports; hidden-tab omission is explicitly asserted                                         |
| Server safety backup and restore | Pre-replacement snapshot includes hidden tabs; Dashboard download and restore preserve data; Settings explicitly adopts the changed server generation |
| Cancellation and invalid files   | Cancelled replacement, malformed JSON, unsupported schema, missing definitions, duplicate IDs, unknown groups, and unsafe URLs preserve existing data |
| Validation diagnostics and retry | Multiple server errors show their codes and exact field paths; failed import creates no backup; corrected file clears the report                      |
| Rejected API credentials         | UI export/import reports HTTP 401 without changing browser or server records or downloading an error document                                         |
| Markdown and offline fallback    | `.md` and `.markdown` round trips preserve supported fields and expose losses; an offline Markdown failure can be followed by a valid JSON import     |

The fixture includes empty collections, custom categories, tag descriptions, exact URLs with query order and fragments, Unicode, newlines, quotes, backslashes, every custom-property type, `false`, zero, empty strings, nested JSON and null values, undeclared raw properties, and missing overrides. Comparisons check record identities/counts first, then use a named Playwright step for each record. Only array order and equivalent UTC timestamp spelling are normalized; positions, creation times, lifecycle, and raw values are compared. Local mutation times are checked separately, while server round trips require exact modification times.

Open `pnpm exec playwright show-report` after a run. Each test includes the actual downloaded export files and backend logs where applicable. A failing test also retains a screenshot and trace under `test-results/`; the assertion names the record and prints the differing fields. The trace shows file selection, confirmation dialogs, HTTP requests, and responses. Run a specific scenario with `pnpm test:e2e:transfer --grep "Server JSON"`, or open its trace with `pnpm exec playwright show-trace <path-to-trace.zip>`. Attachments contain disposable fixture data.
