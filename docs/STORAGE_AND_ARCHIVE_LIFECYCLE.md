# Storage and Archive Lifecycle

This document summarizes the storage lifecycle defined in
[`GROUPS_AND_AGENTS.md`](./GROUPS_AND_AGENTS.md). The ADRs in [`adr/`](./adr/)
record the individual decisions.

## Storage modes

TabVault writes browser-local schema-v3 data immediately. In backend mode, routine mutations use
single-resource API requests; a failed backend request does not make browser-local data unreadable.
Browser capture is the bounded exception: it writes one complete Session locally and sends its tabs
through one transactional batch endpoint. Explicit synchronization may also use the transactional
schema-v3 transfer command. Saved Tab IDs—not URL equality—identify the same occurrence across
browser and server storage, and record-level `updatedAt` last-write-wins resolves supported
synchronization conflicts.

## Saved URL and occurrence identity

- Store the original HTTP(S) Saved URL exactly as supplied.
- Do not store a normalized or canonical URL.
- Every save creates a distinct Saved Tab occurrence, including repeated exact URLs.
- `POST /api/v1/tabs` never searches for, merges, restores, or reuses a URL match.
- Duplicate reduction is an explicit client workflow and archives non-survivors through individual
  requests.

## Archive

- Archiving sets `archivedAt`, clears `groupId`, and removes the Saved Tab from ordinary ordering.
- Archive takes precedence over a future `hiddenUntil` deadline.
- Restore is an ordinary PATCH that clears archive state; the Saved Tab remains Unassigned and may
  appear in Hidden if its visibility deadline is still in the future.
- Permanent `DELETE /api/v1/tabs/{id}?hard=true` is available only for an already archived Saved
  Tab.
- Deleting a Group atomically archives and Unassigns its current member tabs before permanently
  deleting the Group.

## Hidden

Only Saved Tabs carry `hiddenUntil`. All Tabs, search, counts, and user export omit active tabs with
future deadlines. Hidden is a dedicated human view; MCP cannot read or mutate hidden or archived
content. Group visibility is derived from current member tabs, and empty Groups remain visible in
All Tabs.

## User interface

All Tabs, Hidden, and Archive reuse the grouped tab-list component with lifecycle-specific actions.
All Tabs offers Archive and Hide; Hidden offers Archive, Unhide, and Prolong; Archive offers Restore
and permanent Delete. `[Unassigned]` is a virtual collection shown when the current view contains
Saved Tabs without Group membership.
