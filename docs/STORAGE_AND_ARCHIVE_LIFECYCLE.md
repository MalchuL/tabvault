# Storage, lifecycle, and synchronization

## Local commit

All browser mutations go through `commitLibrary` and pure library operations. A Web Lock serializes read/modify/write across app windows and the extension worker. A single storage write contains the effective library and pending resource changes. React observes committed snapshots; drag previews remain in memory until drop. Capture closes source tabs only after that write succeeds.

The browser stores schema v5 under the existing `tabvault-v3` key so incompatible data can be detected and exported intact. No migration runs. Failed validation or persistence does not overwrite a prior copy.

## Shared sync

`POST /api/v1/sync` accepts `schemaVersion`, `generation`, and `changes`. Each change contains `kind` (`tab`, `group`, `tag`, or `property`), stable `id`, unique `token`, offset-aware `updatedAt`, and a complete portable `data` object or null for deletion.

The server validates and stages prerequisites before tabs, applies deletions last, and commits once. Any invalid change rolls back the whole batch. It returns the generation, full raw document, acknowledged tokens, property timestamps, and tombstones. Newer record timestamps win; exact ties retain the server value. Property defaults are resolved at read time and are not copied into raw tab values.

The client removes only the tokens actually acknowledged, then overlays edits made while the request was in flight. Failed requests and lost responses retain pending changes. Permanent tab/group tombstones defeat stale upserts. Tag/property deletion keeps a timestamp so newer explicit recreation is possible. Group deletion archives and unassigns members; tag deletion detaches links and updates affected tab timestamps.

Resource-specific HTTP/MCP writes use the same stored timestamps and tombstones, so browser sync observes them. Positions live on records; no separate persisted order lists exist. Saved views and display preferences remain local.

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
