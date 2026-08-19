# TabVault Feature Guide

TabVault is a **local-first tab library** that can operate entirely in browser storage or connect to an authenticated FastAPI service for shared data, semantic search, import/export, scheduled index checks, and agent access. This guide documents the capabilities that are implemented in the current repository and distinguishes the interactive interface from the server and MCP surfaces. [1] [2]

> **Start here.** **All Tabs** is the unified library destination. Switch between Standard, Compact, Instant Preview, and Group board views; use the in-list collection drop shelf or the per-tab menu to organize links. The web interface remains useful offline, while the Chrome extension adds active-tab capture and local health-alert delivery.

### First-time help markers

Small outlined question-mark buttons appear beside the controls that usually need explanation first: collections, API connection, Semantic model, Index health, Local alerts, search, saved views, and tab-view/reorder controls. Select a marker to open a short explanation and practical tip. The markers are regular keyboard-focusable buttons; press **Enter** or **Space** to open a tip, then press **Escape** or click outside it to dismiss it. [1]

_Figure 1. The working TabVault dashboard. Orange marks the active collection, primary save/import actions, semantic query actions, and verified system signals._

## How the parts work together

TabVault has three useful operating modes. The static web application retains its library in browser `localStorage`; the Chrome extension persists the same kind of library in `chrome.storage.local`; and either client can connect to the server with an endpoint and bearer key. The server is the source of truth for its JSON library, while the semantic vector index is a rebuildable derived cache rather than a second canonical database. [2] [3]

_Figure 2. The repository’s implemented data paths. Browser and extension persistence continue to function when the API is intentionally unavailable or temporarily unreachable._

| Surface                    | Primary job                                                                             | What persists there                              | When to use it                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Static web application** | Browse, organize, search, and connect to a remote API                                   | Browser `localStorage`                           | A hosted interface or offline personal library.                                |
| **Chrome MV3 extension**   | Capture the active browser tab and show the side-panel workspace                        | `chrome.storage.local` plus optional server sync | A personal Chrome workflow with keyboard capture and notifications.            |
| **FastAPI server**         | Shared library, validation, import/export, semantic search, and health-check scheduling | Versioned JSON document and derived vector cache | Any reachable private-network or public HTTP(S) deployment.                    |
| **Python MCP bridge**      | Let an MCP-compatible agent use the same library through official SDK typed tools       | No duplicate copy; it proxies to the API         | An AI assistant needs structured tab, collection, search, or transfer actions. |

## Library workspace

### Collections, tabs, tags, and ordering

Collections are organization metadata inside the unified **All Tabs** workspace rather than separate navigation destinations. The Group board summarizes each top-level collection, while the search scope control filters the same library in place. Parent collections include descendant tabs where collection operations need an aggregate view. [1]

The list supports two distinct drag behaviors. Dragging a row by its handle uses dnd-kit to reorder it **within the same collection** and leaves an insertion gap so the final placement is visible before release. Dropping a tab on the **Drop tab into** collection shelf moves it to that collection; the per-row collection menu provides a keyboard- and pointer-friendly alternative. [1]

| Control                              | What it does                                  | Notes                                                                                                                                                                               |
| ------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Save active tab** (extension only) | Creates a saved tab in Inbox                  | This control appears only in the Chrome extension side panel, where it captures the active HTTP(S) tab. The hosted web application intentionally does not simulate browser capture. |
| **Group board card**                 | Filters All Tabs to one collection            | It changes the active in-place collection scope without a separate route.                                                                                                           |
| **Drop tab into shelf**              | Moves a dragged tab between collections       | Every collection, including empty ones, remains a visible drop target.                                                                                                              |
| **Edit collection**                  | Renames a collection                          | The edit affordance appears on hover/focus.                                                                                                                                         |
| **New collection**                   | Adds a top-level shelf                        | The new shelf becomes the selected collection.                                                                                                                                      |
| **Tag directory**                    | Adds, renames, describes, or removes tags     | Renaming or removing a tag updates linked tabs in the client library.                                                                                                               |
| **Tab edit**                         | Changes title, URL, note, tags, or collection | Tab URLs must be absolute `http://` or `https://` addresses.                                                                                                                        |

### View modes

The three icons above the tab list persist a presentation preference with the library. **Standard** is the detailed reading view. **Compact** is deliberately an index-only list: each row contains only a favicon and the tab title, with no URL, date, note, or tag metadata; the trailing **…** opens that tab’s editor. **Instant preview** is a Pocket-style reader stream: it retrieves available page HTML, extracts the article using Mozilla Readability, sanitizes the extracted content, and renders a scrollable reading card with title, author/site metadata, excerpt, body, tags, and an original-link action. When a page refuses browser or extension retrieval, the card states that the reader preview is unavailable and retains the saved note and original-link fallback. [1] [7]

## Search, selection, and recovery

The central search field first attempts a server semantic search when an authenticated API is reachable. The returned state tells the interface whether the answer came from the semantic index or the transparent text fallback. Without a server, the client still searches saved titles, notes, domains, and tags locally. The collection selector narrows either the semantic request or the local text match to a single shelf. [1] [3]

Keyboard navigation is built into ranked results: **Up/Down** changes the active row, **Enter** opens it, **Space** marks it for a bulk action, **Ctrl+A** or **Cmd+A** selects all current results, and **Escape** clears the query focus. The action strip supports bulk move, tag, and remove. Each bulk operation creates a short-lived undo snapshot; server-backed extension use also calls the restore endpoint when Undo is chosen. [1] [3]

Saved search views store a name, query, and collection scope with the library. They are intended for repeated questions such as “embedding references in Research” rather than as a separate server-side search product.

## What the sidebar status panels mean

The sidebar contains controls that are easy to mistake for application modes. The table below explains their actual behavior.

| Panel or label                   | What it means                                                                                                                                                              | How to use it                                                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API connection**               | Shows whether TabVault can reach the configured server. **Browser storage active** means the interface is using its resilient local copy; it is not an error state.        | Choose **Configure API**, enter any absolute `http://` or `https://` endpoint and matching bearer key, then select **Save & connect**. Development defaults are `http://127.0.0.1:4817` and `admin`; change the key before public deployment. [2]                |
| **Semantic model**               | Shows derived-index readiness, provider/model metadata, indexed tab count, batch progress, and the latest model error. It is a status/rebuild panel, not a model selector. | Run an Ollama-compatible embedding provider, configure the server environment, then choose **Rebuild local index** after changing the model or importing substantial data. The server falls back to deterministic text search if embeddings are unavailable. [3] |
| **Index health — Manual checks** | Means scheduled health checks are currently off. It does **not** mean the index is broken.                                                                                 | With an online server in the Chrome extension, choose Off, 15m, 1h, or 4h to persist a server health-check schedule. Use **Run health check now** for an immediate readiness check. [1] [3]                                                                      |
| **Local alerts — Quiet mode**    | Means no Chrome notification is configured for a scheduled health-check attention state. It is not a global browser “do not disturb” setting.                              | Enable a health schedule first, then enable the alert checkbox. The extension service worker creates an alarm and notifies only when the API reports `needs_attention`. This behavior requires the extension’s alarms and notifications permissions. [4]         |
| **Semantic lens**                | A reusable example query card in the right insight strip.                                                                                                                  | Select **Run this query** to populate the search field with `validation contract`; it shows the same semantic/fallback status rules as any other query. [1]                                                                                                      |
| **Sync status**                  | A visible summary of the connected server state.                                                                                                                           | Use it as a prompt to open **Configure API** or **Check** when a server requires attention. It does not independently modify data.                                                                                                                               |

## Server-backed workflows

Every API route requires `Authorization: Bearer <key>`. The server accepts a startup key through `TABVAULT_API_KEY`, defaults to `admin` for initial development, binds to `127.0.0.1` by default, and can restrict browser origins through `TABVAULT_CORS_ORIGINS`. Use a unique key and TLS termination before exposing it publicly. [2] [3]

The client stores the endpoint and bearer key in browser or Chrome extension storage. Its `HybridStorageAdapter` writes to browser storage and uses the server when available; when the server cannot be reached, offline edits remain usable locally until a later connection is configured. [2]

| Server capability   | Implemented endpoint family                           | Practical effect                                                                                           |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Library and records | `/v1/library`, `/v1/tabs`, `/v1/groups`, `/v1/tags`   | Retrieve and manage tabs, nested groups, and tag definitions.                                              |
| Search and indexing | `/v1/search`, `/v1/index/status`, `/v1/index/rebuild` | Run semantic search when embeddings are ready, otherwise receive an explicit text fallback state.          |
| Health scheduling   | `/v1/index/health-check` and `/run`                   | Persist index-readiness intervals and trigger an immediate check.                                          |
| Transfer            | `/v1/export`, `/v1/import`                            | Export JSON or Markdown; upload/merge or backup-protected replace imports with detailed validation issues. |
| Recovery            | `/v1/tabs/restore`                                    | Restore tab records from a client-side undo snapshot.                                                      |

### Import and export transfer desk

Choose **Import & Export** from the hosted workspace sidebar or header to open the dedicated transfer desk. It downloads the current browser library as JSON without requiring a server. When a TabVault API connection is available, it also exports the server’s versioned JSON document or a Markdown reading copy. The page accepts browser JSON directly; server-connected JSON and Markdown imports support **merge** or backup-protected **replace** and display the API’s field-level validation feedback before invalid data is written. [1] [3]

## Chrome extension behavior

The extension packages the same application as an MV3 side panel, now paired with a deliberately lightweight toolbar popup. Clicking the toolbar icon opens the fast-save popup; its first control, **Open TabVault workspace**, opens the full TabVault side panel for organizing, search, connection, semantic controls, and alerts. The declared capture command still opens the side panel and requests a save of the active browser tab. The capture path accepts only HTTP(S) pages, which avoids accidentally storing Chrome internal pages. [4]

### Fast-save popup

The popup adapts Supatabs’ documented directional collection pattern—left of the active tab, right of it, all tabs, or selected tabs—to TabVault’s Inbox workflow. Each arrow has both a visible label and an HTML title so its purpose remains discoverable. **Left** excludes the active tab and selects tabs before it; **All** includes every tab in the current window; **Right** excludes the active tab and selects tabs after it. **Use Chrome selection** uses highlighted tabs from Chrome and falls back to the active tab if no group is highlighted. [6]

After **Save selected & close**, the service worker writes eligible HTTP(S) pages to `chrome.storage.local`, attempts authenticated server sync if the API is configured, notifies an already-open side panel to refresh, and then closes the chosen eligible tabs. Chrome internal pages are skipped and left open. The fast popup intentionally excludes settings and management surfaces; the workspace button is the explicit escape route to those richer features. [4]

The extension also hosts local alert delivery. When a health schedule and “notify on attention” preference are both enabled, its service worker restores a Chrome alarm, sends an authenticated POST to the configured health-check route on each alarm, and creates a notification only if the API reports that the index needs attention. If the server is intentionally stopped or unreachable, the worker does not create a false alert. [4]

## MCP agent access

The TypeScript MCP bridge uses the official MCP SDK and typed Zod schemas. It reads `TABVAULT_SERVER_URL` and `TABVAULT_API_KEY`, forwards the same bearer authentication to the FastAPI server, and does not keep its own library database. [5]

| Tool group                          | Tools                                                                                               | Intended use                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Read and search**                 | `list_tabs`, `get_tab`, `search_tabs`, `semantic_index_status`                                      | Let an agent inspect saved knowledge and understand whether semantic or fallback search was used. |
| **Tabs**                            | `save_tab`, `save_tabs`, `update_tab`, `move_tab`, `delete_tab`                                     | Save URLs, merge duplicates, edit metadata, organize, or remove records.                          |
| **Collections and tags**            | `list_groups`, `create_group`, `update_group`, `delete_group`, `list_tags`, `add_tag`, `remove_tag` | Maintain the library’s navigable vocabulary and hierarchy.                                        |
| **Data transfer and index control** | `export_data`, `import_data`, `rebuild_semantic_index`                                              | Move validated data in or out and rebuild the derived semantic cache.                             |

## Practical operating checklist

For an offline personal library, build and load the extension, then use the collection rail, tags, and saved views without configuring a server. For a connected library, start the API with `uv run tabvault-server`, choose a strong bearer key, configure CORS for the web application or extension origin, and save the endpoint in **Configure API**. For semantic retrieval, start an Ollama-compatible embedding provider and rebuild the index. For agent access, start the MCP bridge with the same API URL and bearer key. Detailed command sequences are maintained in the [main README](../README.md), [local setup guide](../LOCAL_SETUP.md), [API README](../local-server/README.md), and [MCP README](../mcp-server/README.md).

## Implementation references

[1]: ../client/src/pages/Home.tsx "TabVault dashboard behavior and controls"
[2]: ../client/src/lib/extension.ts "Connection, authenticated API, and browser/extension storage helpers"
[3]: ../local-server/tabvault_server/main.py "Authenticated REST API, search, import/export, and index routes"
[4]: ../client/public/background.js "Chrome extension capture and scheduled alert worker"
[5]: ../mcp-server/src/index.ts "TypeScript MCP tool registration and authenticated API proxy"
[6]: SUPATABS_REFERENCE.md "Supatabs directional interaction research and TabVault adaptation"
[7]: READABILITY_INTEGRATION.md "Mozilla Readability integration, sanitization, and fallback behavior"
