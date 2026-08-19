# TabVault UX Redesign Audit

## Product reading

> **Design read:** TabVault is a local-first research utility for people who need to recover, organize, and reuse web context; the interface should feel like a focused library, not a technical control room.

The existing application has a capable core, but the primary library surface asks users to parse too many concerns at once: navigation, collection structure, semantic state, storage mode, metrics, search, view settings, selection controls, and row-level management. The redesign keeps the functional depth while giving each concern a clear home.

| User intent              | Current friction                                                                                         | Redesigned behavior                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Find a saved tab         | Hero metrics, helper copy, view controls, and technical labels compete with search.                      | Search is the workspace’s primary control and reports only the matching mode when it matters.                                                   |
| Open and resume work     | Tab rows expose move, edit, delete, tags, relevance, and drag affordances simultaneously.                | Rows prioritize title, source, and concise context. Management actions become contextual without removing keyboard access.                      |
| Organize a group of tabs | Selection, drag-and-drop, collection rail drop targets, and per-row selects appear as parallel concepts. | Drag remains available, while multi-select reveals a single action bar only after a selection exists.                                           |
| Understand data safety   | “Browser preview,” “offline cache,” “server-backed,” and semantic information appear in multiple places. | A single sync indicator explains whether changes are stored locally, synced to the server, or awaiting a later sync. Detail lives on Dashboard. |
| Maintain semantic search | Model, health, schedules, alerts, and rebuild actions have been embedded near library work.              | Dashboard owns operational readiness, index counts, scheduled checks, errors, and recovery actions. Settings retains connection configuration.  |

## Information architecture

The library has three jobs: **retrieve**, **review**, and **organize**. Operational information is not removed; it is moved to a dedicated Dashboard that is available from the persistent navigation.

| Area            | Purpose                    | What belongs here                                                                                                                    |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Library         | Daily tab work             | Search, collection filters, tab rows, view mode, contextual selection tools.                                                         |
| Collections     | Structure work             | Collection browsing, nesting, creation, and collection-level actions.                                                                |
| Dashboard       | Confidence and maintenance | Total tabs, collections, tags, local cache state, server availability, indexed-tab coverage, index health, and next recovery action. |
| Settings        | Configuration              | Server endpoint, bearer key, semantic provider configuration, and alert preferences.                                                 |
| Import & Export | Data transfer              | Browser and server imports/exports, validation reports, merge/replace actions.                                                       |

## Cache and sync contract

The current implementation is browser-first: every change writes to `chrome.storage.local` or browser `localStorage` before attempting a server merge. Server sync failure is tolerated so the library stays usable offline. This is the correct local-first baseline, but it is currently invisible and does not have a clear retry story.

The redesign will make this contract explicit without overstating it:

1. **Local cache is immediate and durable for the current browser profile.** Users can continue working without a server.
2. **A configured healthy server receives a best-effort merge after each local write.** A successful push is reported as “Synced.”
3. **If the server is unavailable, the UI reports “Stored locally; server sync will retry when you reconnect.”** The application will make a new sync attempt when connection state is refreshed or the next meaningful write occurs.
4. **The dashboard is the source of operational detail.** The workspace will show only the concise current state and a direct path to inspect it.

## Interaction rules

1. The main page must answer “what do you want to find?” before it answers “how is the system configured?”
2. There is one obvious primary action per state. In the hosted app this is search or import; in the extension it is saving the current tab.
3. Selection and bulk actions are progressive disclosure. They are absent until a user chooses to select tabs.
4. Tab rows should expose opening first, then compact context; editing, moving, and deletion belong to a quiet trailing menu or deliberate affordance.
5. Metrics are only useful when they explain a decision. The Dashboard shows counts and readiness; the library does not repeat them as decorative status strips.
6. Technical state should use direct language: “Local only,” “Synced to server,” “Index ready,” or “Action needed.” Avoid opaque labels such as “Semantic Lens” when no search is running.

## Implementation sequence

1. Introduce a dedicated Dashboard route with real metrics derived from the library and live server health.
2. Rework sidebar navigation into Library, Collections, Dashboard, and lower-priority utilities.
3. Reduce the Library header to its collection title, concise context, and one local/sync status link.
4. Move operational reporting and maintenance actions to Dashboard; retain Settings for configuration only.
5. Simplify row chrome and make selection actions appear only after the user enters selection mode.
6. Add regression coverage for Dashboard navigation, sync-state communication, and no-regression library operations.
