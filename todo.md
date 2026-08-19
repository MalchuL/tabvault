# Interaction Revision Checklist

- [x] Make every collection label open its own tab list while keeping the chevron as the only subgroup-expansion control.
- [x] Add an obvious drag-and-drop preview and a successful-drop confirmation when a tab is moved to a collection.
- [x] Add an editable tab detail surface for title, note, URL, tags, and collection.
- [x] Add a tag-management surface to rename, describe, and remove tags.
- [x] Test collection navigation, tag editing, tab editing, and dragging on desktop and mobile.

The revised client compiles and builds successfully. Desktop and mobile visual passes confirm that navigation, edit affordances, and compact layouts render correctly; the live preview exposes the interactive controls for manual use.

## Reordering Revision

- [x] Add within-collection drag-and-drop reordering with an above-or-below insertion preview.
- [x] Keep cross-collection drops intact and communicate whether a drag will move or reorder a tab.
- [x] Verify the reordered list layout and final build.

## Chrome Extension Foundation

- [x] Add Chrome MV3 extension packaging, side-panel configuration, icons, and keyboard command declarations.
- [x] Capture the active Chrome tab from the TabVault side panel and create a normalized saved tab record.
- [x] Persist the tab library, groups, tags, and ordering in `chrome.storage.local`, while retaining a browser-preview fallback.
- [x] Produce and validate a load-unpacked extension build with installation guidance.

## Local-First Data Platform

- [x] Define the versioned API, data schema, error catalogue, and local package layout.
- [x] Build a FastAPI server with JSON-file persistence, group-tree validation, URL deduplication, and REST endpoints.
- [x] Add JSON and Markdown export plus `upload` and `replace` import modes with complete validation reports.
- [x] Implement an MCP stdio server that proxies core tab, group, tag, search, and import-export tools to the local API.
- [x] Provide an extension client adapter that can use the local API when configured, while retaining `chrome.storage.local` offline fallback.
- [x] Validate API behavior, import errors, MCP tool registration, and the extension build; write practical local setup documentation.

## Semantic Search Upgrade

- [x] Add a persistent local vector index and an Ollama-compatible embedding provider for tab title and note text.
- [x] Reindex changed, imported, and restored tabs without making vectors the source of truth.
- [x] Return semantic scores from the API and expose index rebuild/search status through MCP.
- [x] Preserve the lexical fallback and document local model configuration plus validation steps.

## Semantic Side-Panel Search

- [x] Add a typed local API client for semantic search results and index state.
- [x] Surface local-server semantic results, scores, result modes, and loading state in the TabVault search interface.
- [x] Preserve local client-side search as an explicit fallback when the side panel is offline or the local server is unreachable.
- [x] Test semantic, lexical-fallback, and preview-mode search states across the responsive interface.

The extension package compiles and builds successfully. The browser preview confirms the offline presentation; the local semantic API and both semantic and lexical fallback responses were validated in the prior platform pass, and the side-panel adapter now consumes those typed response shapes.

## Semantic Workflow Enhancements

- [x] Batch local embedding requests during rebuilds and import writes, with bounded progress reported by the index API.
- [x] Add a model/setup status panel that explains readiness, model, provider, local address, indexed count, and recovery actions.
- [x] Add accessible keyboard navigation for ranked results, including up/down selection, Enter to open, and Escape to clear search focus.
- [x] Validate large-index batching, model status modes, keyboard actions, responsive layout, and production build output.

Validation confirms a five-tab replace import is embedded in three batches at a configured batch size of two, with progress and semantic search mode reported through the local API. The extension type check, production build, and responsive visual review complete successfully; keyboard handlers are wired to the search control with visible navigation guidance and selected-row treatment.

## Ranked Search Productivity

- [x] Add collection-aware filtering to the local semantic API and the side-panel search controls.
- [x] Add keyboard-accessible multi-select actions for ranked result rows, including move, tag, and remove flows.
- [x] Add an optional health-check interval to the local API, expose its state through the semantic status response, and make it configurable from the model panel.
- [x] Validate filtering, selection actions, schedule persistence, keyboard control, responsive layout, and production build output.

The isolated local API validation confirms that the health-check schedule persists at a fifteen-minute interval, manual checks report the semantic index condition, index status exposes the schedule, and group-scoped search responses carry the requested collection id. Desktop and compact side-panel reviews confirm the new controls remain legible and available.

## Reversible Workflows and Local Alerts

- [x] Add an undo snapshot and timed recovery action for multi-select move, tag, and remove operations.
- [x] Add local saved search views with a name, query, collection scope, and persisted browser storage.
- [x] Add persisted index-health alert preferences and local notification reporting when scheduled checks find an issue.
- [x] Validate undo behavior, saved-view recall, alert preference persistence, responsive layout, and production build output.

The local API validation confirms persisted alert preferences, attention timestamps, and restore operations for an undo snapshot. The Chrome background worker passes syntax validation and keeps notification delivery local to the configured TabVault server. The extension type check, production build, and desktop review complete successfully.

## Refactor and Quality-of-Life Upgrade

- [x] Replace the native tab-list reordering flow with dnd-kit sortable behavior and an obvious spacing-based insertion preview.
- [x] Add persistent standard, compact, and instant-preview tab view modes, with accessible view switching.
- [x] Write deployment and serverless-use documentation for the static web preview and unpacked Chrome extension workflow.
- [x] Replace the handwritten JavaScript MCP bridge with a TypeScript MCP framework implementation and verify its tool handshake.
- [x] Validate drag reordering, all three view modes, MCP build/tool registration, standalone instructions, and production output.

The refactor passes the frontend type check and production build, direct TypeScript MCP compilation, and an MCP initialization plus tool-list handshake. Desktop and mobile review confirm the draggable list treatment and view-mode switcher fit the TabVault layout. The dnd-kit sortable overlay creates a visible archival-space gap while a row is actively dragged; standard, compact, and instant-preview render paths share the same persisted tab data.

## First-Class API Deployment

- [x] Add `Authorization: Bearer` API authentication with a configurable startup key and `admin` as the documented default.
- [x] Configure CORS and runtime binding for public-domain or private-network deployments, without restricting the server to localhost.
- [x] Create a unified persistence interface with server and `chrome.storage.local` implementations plus an explicit fallback policy.
- [x] Add endpoint URL and bearer-key settings to the TabVault UI and extension storage; allow any valid HTTP(S) domain or IP.
- [x] Validate authenticated API requests, remote endpoint configuration, local fallback behavior, extension build, and deployment documentation.

## Package Quality Tooling

- [x] Audit the frontend, MCP bridge, and FastAPI package manifests for existing quality scripts and configuration.
- [x] Add JavaScript/TypeScript linting, formatting, and automated format-check scripts for each Node package.
- [x] Set up the Python API package with uv-managed linting, formatting, and type-check tooling.
- [x] Document a consistent root-level command sequence and validate every configured check.

## Illustrated Feature Guide

- [x] Audit the implemented interface, API, extension, and MCP capabilities against the source code.
- [x] Capture representative interface states and prepare annotated documentation visuals.
- [x] Write a repository-verified guide covering library controls, semantic search, health checks, alerts, sync, import/export, and agent access.
- [x] Cross-check the guide against the implementation, update navigation links, and validate the project.

## Fast-Save Extension Popup

- [x] Research Supatabs-inspired rapid selection behavior and audit the current MV3 manifest, service worker, and side-panel flow.
- [x] Add a focused toolbar popup with explicit left, all, and right selection controls, fast save-and-close actions, selected-tab handling, and direct workspace access.
- [x] Preserve an intentional path to open TabVault’s side panel from the popup and document the shortcut workflow.
- [x] Validate popup packaging, message handling, tab operations, and production extension build.

## Tab View and Drag Alignment Correction

- [x] Audit compact and instant-preview markup together with the dnd-kit drag overlay configuration.
- [x] Make Compact show only favicon and tab title, without URL or date metadata.
- [x] Rebuild Instant Preview as a per-tab, Telegram-inspired preview treatment using available tab content and generated previews where appropriate.
- [x] Align the sortable drag overlay with the pointer and validate reordering across the three view modes.

## Contextual Help for First-Time Users

- [x] Audit primary navigation, tab controls, model controls, health checks, alerts, and connection settings for useful contextual help placement.
- [x] Create concise, click-to-open explanations with a reusable accessible marker component.
- [x] Add help markers to the key first-use surfaces without cluttering high-frequency workflows.
- [x] Validate keyboard access, dismissal behavior, responsive layout, and production build output.

## Compact Editing and Readability Preview

- [x] Research Mozilla Readability’s browser integration requirements and the realistic cross-origin fallback strategy.
- [x] Add an accessible overflow edit menu to compact tab rows.
- [x] Replace Instant Preview with a Pocket-style reading state using Readability for available page HTML and a clear unavailable-content fallback.
- [x] Validate parsing states, edit-menu keyboard behavior, responsive presentation, and production build output.

## Workspace Capture and Transfer Navigation

- [x] Audit hosted save controls, transfer dialogs, routing, sidebar navigation, and Chrome extension capture surfaces.
- [x] Remove browser-only tab-capture affordances while preserving the extension’s capture and fast-save workflows.
- [x] Create a dedicated Import & Export page and expose it through the workspace sidebar.
- [x] Validate navigation, transfer-page behavior, extension packaging, and production build output.

## Responsive Drag Reliability

- [x] Audit the dnd-kit overlay, pointer sensors, and current browser-test tooling.
- [x] Add Playwright regression tests for pointer-aligned dragging and visible insertion feedback at desktop and compact widths.
- [x] Correct the drag overlay alignment without weakening tab reordering or collection moves.
- [x] Run browser regression tests together with the established quality suite.
