# TabVault feature guide

## Organize

Use Standard or Compact rows to browse and edit saved occurrences. The collection board shows collection members as favicons. Drag handles, row drag space, and board favicons share placement commands; Escape cancels without writing. Quick Move lives directly beneath the search field and offers manual-category collections.

Search covers titles, URLs, tags, and resolved custom properties. Saved views remember a query and collection filter locally. Collection actions open, copy, hide, edit, or delete their members. Individual rows support editing, viewed status, moving, hiding, archiving, restoring, and permanent removal from Archive.

Quick Clean archives records with identical original URL, title, raw property values, and case-insensitive tags. Advanced Deduplicator groups exact URLs, previews survivors, and merges string, boolean, and tag values according to selected policies. Other property values retain the survivor's explicit value, or the first explicit value when the survivor has none.

## Custom properties

Manage definitions on **Custom Properties**. Supported types are string, integer, float, boolean, and JSON. Edit a tab to inspect and change its declared values. The editor distinguishes defaults from explicit values, validates drafts, and provides **Use default** to remove an override. It retains undeclared raw values visibly without rewriting them.

`note`, `agentReview`, and `viewed` are client conventions. MCP declares missing definitions when writing these properties. Existing definitions are never silently replaced. Arbitrary property definitions use the same management and synchronization path.

## Storage

Local only works without a server. Backend preferred saves locally first and retries synchronization when needed. The Dashboard shows storage status and server backups. Settings configures connection, polling, clearing, and explicit recovery after a server replacement. Import & Export downloads portable JSON and supports merge or replacement.

Schema v5 deliberately does not upgrade old data. The recovery page can download the untouched browser value. Preserve an old server directory and choose a fresh directory for v5. See [storage lifecycle](STORAGE_AND_ARCHIVE_LIFECYCLE.md) for the synchronization and recovery guarantees.
