# Groups and Agents

This specification defines the agreed Groups, agent interaction, hiding, archive, duplicate
reduction, capture, and synchronization model. It intentionally breaks the current schema and API.

## Saved tabs and URLs

- A Saved Tab is one save occurrence. Saving the same URL always creates another Saved Tab.
- Store only the original URL. Do not store or derive `normalized_url` or a canonical URL.
- Query parameters, query order, fragments, encoding, trailing slashes, and casing remain meaningful.
- A Saved Tab has zero or one Group.
- `groupId=null` means Unassigned. Unassigned is a virtual collection, not a persisted Group.
- Both active and archived tabs may be Unassigned.

## Groups

- Groups are flat. Remove `parentId`, paths, hierarchy traversal, and child operations.
- Every newly created Group requires a nonempty, open-ended `category` string.
- Current category conventions are `session` and `manual`; unknown strings remain valid.
- Human and agent-created Groups use `manual`.
- Browser capture creates `session` Groups named `Session MMM DD HH:mm` in browser-local time.
- Editing Group details through the UI or MCP explicitly includes `category="manual"`.
- Editing or moving a tab never changes its Group's category.
- Empty Groups remain until a human or agent explicitly deletes them.
- UI category colors come from one deterministic hash-to-color function. Unknown categories work
  without a predefined palette.
- Inbox does not exist.

Deleting a Group is one specialized transactional command:

1. Archive every member Saved Tab.
2. Set every member's `groupId` to null.
3. Permanently delete the Group.
4. Commit all changes together or roll back all of them.

Manually archiving, unassigning, or moving the final tab never deletes an empty Group.

## Archive and Unassigned

- Archiving a Saved Tab sets `archivedAt` and clears `groupId`.
- An archived tab is visible only on Archive, even when it also has a future `hiddenUntil`.
- Restore uses ordinary PATCH rather than a dedicated restore endpoint.
- Restoring clears the archive state; the tab may remain Unassigned.
- Permanent deletion is available only from Archive.
- Active Unassigned tabs appear as an `[Unassigned]` collection in All Tabs when nonempty.
- Archived tabs appear under `[Unassigned]` on Archive.

## Hidden behavior

- Only Saved Tabs have `hiddenUntil`; Groups do not have a hidden field.
- Store `hiddenUntil` in UTC and release automatically when `now >= hiddenUntil`.
- Hide choices are 10 minutes, 1 hour, 1 day, and 1 year.
- A nonempty Group is presented as hidden when all its current tabs are hidden.
- An empty Group is visible.
- A Group with any visible tab remains visible and shows only its visible tabs in ordinary views.
- Hide, Unhide, or Prolong Group is UI orchestration that issues one request per current member tab.
  It is non-atomic and reports partial failures.
- All Tabs, search, counts, and exports omit hidden tabs.
- Hidden contains only active hidden tabs and derived Hidden Groups.
- Archive takes precedence over Hidden for page placement.
- MCP cannot enumerate, read, or mutate hidden or archived content, even by known ID.
- The human UI manages hidden records through the dedicated Hidden page.

All Tabs, Hidden, and Archive reuse the same collection/list component with different queries and
page-specific actions such as Archive, Restore, Unhide, and Prolong.

## Agent interaction

- Agents use MCP and receive no server-managed work queue, claim, lease, or concurrency guarantee.
- Only one modifying agent is assumed. Human/agent concurrent editing is unsupported; existing
  field-level PATCH and last-committed-write-wins behavior is acceptable.
- Agents may perform any operation exposed for an active visible tab.
- Agents inspect mutable `agentReview` text and decide for themselves whether to skip a tab.
- `agentReview` may be replaced or appended and persists until explicitly patched.
- Agents can separately fetch:
  - active visible Unassigned tabs;
  - tabs in Groups with `category="session"`;
  - tabs in Groups with `category="manual"` or another requested category;
  - tabs from a specific Group;
  - all active visible tabs.
- Agents may leave a reviewed tab Unassigned or in a Session Group, move it into an existing Manual
  Group, or create a Manual Group. Processing does not require a move.

## Tab API

`POST /tabs` creates exactly one new Saved Tab and returns `201`. It does not search by URL or expose
`force`, dedupe, skip, merge, or create-anyway behavior. `POST /tabs/batch` is the specialized,
atomic browser-capture command: it creates every supplied occurrence or creates none.

Both creation endpoints accept an optional `Idempotency-Key`:

- Scope it to the authenticated client and create endpoint.
- Retain at most 10,000 entries for 10 minutes in process memory.
- Same key and request returns the original status and response.
- Same key with a different request returns `409`.
- Concurrent matching requests create only one record.
- Losing the cache on restart is acceptable.

Routine agent and UI create, update, hide, archive, restore, and delete endpoints operate on one
resource. Clients issue several requests for other multi-item actions and report partial failures.
Browser capture, Group delete, reorder, and schema-v2 import/replace are specialized transactional
commands.

## Quick Clean

Quick Clean is client-orchestrated across all active visible Groups and Unassigned tabs.

1. Compute a transient SHA-256 signature over a length-delimited encoding of exact saved URL, title,
   note, and agent review.
2. Treat equal hashes as equal without verifying the original strings; hash collision risk is
   accepted.
3. Keep the earliest-created record, breaking timestamp ties by ID.
4. Preserve the survivor's Group, favicon, position, ID, and creation time.
5. Replace tags with the case-insensitive union of all cluster tags.
6. Set `viewed` using OR across the cluster.
7. Archive and Unassign every other occurrence through individual requests.
8. Report successes and partial failures.

Archived and hidden records never participate. Ordinary viewed updates affect one Saved Tab; OR
propagation happens only during duplicate reduction.

## Advanced Deduplicator

The dedicated client page clusters all active visible tabs by exact Saved URL hash. It previews a
fixed merge plan before mutation.

Survivor selection:

- `NEWEST_CREATED`
- `OLDEST_CREATED`
- `LATEST_UPDATED`
- Ties resolve by ID.

Reducers:

- Title, note, and agent review: `CONCAT`, `LONGEST`, `SHORTEST`, or `SURVIVOR_VALUE`.
- Viewed: `ANY`, `ALL`, `MAJORITY`, or `SURVIVOR_VALUE`; majority ties use the survivor.
- Tags: union, intersection, or survivor value, using case-insensitive set comparison.
- Group and favicon: survivor value.
- ID and `createdAt`: immutable survivor values.
- `updatedAt`: assigned by the server after PATCH.

`CONCAT` processes oldest-to-newest, skips empty strings, and uses a configurable separator. String
length ties prefer the survivor when tied, then the earliest-created value.

Execution PATCHes the survivor with precomputed replacement values, then archives and Unassigns
other records one request at a time. Retrying the same fixed plan is idempotent and may resume after
partial failure.

## Browser capture

- Left, right, all, and selected capture modes accept HTTP(S) tabs, including pinned tabs.
- Each capture action creates one new Session Group before saving tabs.
- Each eligible browser tab creates a distinct Saved Tab occurrence in that Group.
- A Saved Tab keeps one ID across browser-local and server storage.
- Persist the Session Group and all eligible Saved Tabs in one browser-local storage write.
- Close source browser tabs only after that atomic browser-local write succeeds; if it fails, leave
  every source tab open.
- Synchronize the captured Saved Tabs through one atomic backend batch request.
- Server synchronization retries later and does not determine whether the source tab closes.
- Keep an empty Session Group until explicitly deleted, including when all saves fail.

## Synchronization and compatibility

- Schema v2 is a coordinated breaking update across the frontend, extension, server, MCP, transfer,
  and tests.
- Do not support schema v1 import, export, or synchronization.
- Use record-level `updatedAt` last-write-wins between browser and server.
- Tombstones prevent permanently deleted records from reappearing.
- Exact Saved Tab ID, never URL equality, identifies the same occurrence across stores.
- Replace existing migration history with a fresh schema-v2 initial migration; existing server
  databases are intentionally not migrated.

Before loading browser-local data, validate its schema version and shape. If incompatible, block the
normal application and show a recovery page with two adjacent actions:

1. Download the untouched raw browser-local data to a file.
2. Clear browser-local TabVault data and start with an empty schema-v2 library.

Do not silently clear, partially load, or automatically adapt incompatible browser data.

## Implementation order

1. Fresh schema-v2 models/migration, DTOs, repository behavior, and single-resource API contracts.
2. Visibility and archive policies reused by UI-facing APIs, search, counts, export, and MCP.
3. MCP category/Unassigned queries and strict hidden/archive exclusion.
4. Browser schema guard, raw dump/clear recovery page, v2 persistence, and synchronization.
5. Extension Session Group capture with atomic local/backend tab batches and local-success closing.
6. Shared All Tabs/Hidden/Archive component, Unassigned presentation, category colors, and controls.
7. Client Quick Clean and Advanced Deduplicator with resumable fixed plans.
8. Fresh-database, timing-boundary, partial-failure, MCP visibility, sync, and capture tests.
