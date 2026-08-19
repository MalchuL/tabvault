# Storage and Archive Lifecycle

> **Product contract:** a saved URL is a durable library record, not a disposable list item. Removing it from daily work archives it; adding the same URL later restores the original record and its knowledge.

## Storage modes

TabVault persists every update to browser or extension storage first. The storage mode determines whether the configured backend is also used.

| Mode                  | Local copy               | Backend behavior                                                        | When the backend is unavailable                                                  |
| --------------------- | ------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Local only**        | Always saved immediately | No outbound data request is made                                        | Nothing changes; the library remains local.                                      |
| **Backend preferred** | Always saved immediately | TabVault attempts an authenticated library push after local persistence | The update remains local and is marked as pending until a later successful push. |

The backend is therefore a preferred shared copy, never a prerequisite for opening, editing, archiving, or restoring a link.

## URL identity and restoration

URLs are normalized using the existing canonicalization rule: HTTP(S) is required, the fragment is removed, and query parameters are kept in sorted order. The normalized URL is unique across both active and archived records.

| Event                                | Result                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Add a new normalized URL             | Create one active tab record.                                                                                          |
| Add an already-active normalized URL | Reuse the existing record; do not create a duplicate or overwrite its notes and tags.                                  |
| Add an archived normalized URL       | Restore the same record to Inbox, retain its title, notes, tags, and ID, and clear its archive state.                  |
| Remove an active tab                 | Mark it archived and remove it from active collection ordering.                                                        |
| Restore in Archive                   | Clear its archive state and return it to Inbox.                                                                        |
| Permanently delete                   | Allowed only from Archive; removes the local record and, when backend-preferred sync is reachable, the backend record. |

## API behavior

The server stores `archived` and `archivedAt` fields on tab records. Active library routes and semantic search exclude archived records. The full library document retains archive records so browser and backend copies can converge without losing recovery history. The permanent `DELETE /v1/tabs/{id}` operation rejects active tabs; clients must archive first.

## User interface

The normal tab-list trash affordance is an archive action with a confirmation that explains recovery. Archive is a real navigation destination, not a toast or hidden status. It provides Restore and permanent Delete. Archive count appears only when there are archived tabs, so routine library work remains calm.
