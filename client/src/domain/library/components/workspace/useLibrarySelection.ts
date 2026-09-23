import { useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  deleteTabOnLocalServer,
  updateTabOnLocalServer,
} from "@/domain/server/libraryApi";
import type { StorageMode } from "@/domain/server/browserStorage";
import type { GroupId, UndoSnapshot, VaultTab } from "@/domain/library/types";

type LibrarySelectionOptions = {
  tabs: VaultTab[];
  tabOrders: Record<string, string[]>;
  tagCatalog: Record<string, string>;
  visibleTabs: VaultTab[];
  query: string;
  isArchivePage: boolean;
  setTabs: (value: SetStateAction<VaultTab[]>) => void;
  setTabOrders: (value: SetStateAction<Record<string, string[]>>) => void;
  setTagCatalog: (value: SetStateAction<Record<string, string>>) => void;
  recordTombstones: (ids: Set<string>) => void;
  storageMode: StorageMode;
  serverOnline: boolean;
  setServerOnline: (online: boolean) => void;
  localServerUrl: string;
  serverApiKey: string;
};

type LibrarySelectionController = {
  selectedResultIds: Set<string>;
  setSelectedResultIds: Dispatch<SetStateAction<Set<string>>>;
  selectionMode: boolean;
  setSelectionMode: Dispatch<SetStateAction<boolean>>;
  bulkTag: string;
  setBulkTag: Dispatch<SetStateAction<string>>;
  undoSnapshot: UndoSnapshot | null;
  selectionActive: boolean;
  toggleResultSelection: (id: string) => void;
  createUndoSnapshot: (label: string) => UndoSnapshot;
  undoLastBulkAction: () => Promise<void>;
  bulkMoveSelected: (groupId: GroupId) => Promise<void>;
  bulkTagSelected: () => Promise<void>;
  permanentlyDeleteTabs: (items: VaultTab[]) => Promise<void>;
  toggleSelectionMode: () => void;
  toggleSelectAll: () => void;
  removeSelected: () => Promise<void>;
};

/**
 * Own selected IDs, bulk changes, and the short-lived undo snapshot.
 * Browser state changes first; connected-server updates follow without blocking local use.
 * @param {LibrarySelectionOptions} options - Visible tabs, vault setters, deletion recorder, and server connection.
 * @returns {LibrarySelectionController} Selected IDs, bulk actions, and undo state.
 */
export function useLibrarySelection({
  tabs,
  tabOrders,
  tagCatalog,
  visibleTabs,
  query,
  isArchivePage,
  setTabs,
  setTabOrders,
  setTagCatalog,
  recordTombstones,
  storageMode,
  serverOnline,
  setServerOnline,
  localServerUrl,
  serverApiKey,
}: LibrarySelectionOptions): LibrarySelectionController {
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(
    new Set()
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkTag, setBulkTag] = useState("");
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  /**
   * Toggle one tab in the current search selection.
   * Copies the selection set so React sees a new state value.
   * @param {string} id - Saved tab ID to select or deselect.
   */
  const toggleResultSelection = (id: string) =>
    setSelectedResultIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * Capture a short-lived undo snapshot before a bulk change.
   * Copies tab tags, order buckets, and catalog, then expires the snapshot after twelve seconds.
   * @param {string} label - Label shown by the undo action.
   * @returns {UndoSnapshot} Snapshot available for one bulk undo.
   */
  const createUndoSnapshot = (label: string) => {
    const snapshot: UndoSnapshot = {
      id: crypto.randomUUID(),
      label,
      tabs: tabs.map(tab => ({ ...tab, tags: [...tab.tags] })),
      tabOrders: Object.fromEntries(
        Object.entries(tabOrders).map(([groupId, ids]) => [groupId, [...ids]])
      ) as Record<GroupId, string[]>,
      tagCatalog: { ...tagCatalog },
    };
    setUndoSnapshot(snapshot);
    window.setTimeout(
      () =>
        setUndoSnapshot(current =>
          current?.id === snapshot.id ? null : current
        ),
      12_000
    );
    return snapshot;
  };

  /**
   * Restore the latest bulk-action snapshot.
   * Restores browser state first, then attempts to mirror each tab to the server when connected; partial server failures are reported.
   * @returns {Promise<void>} Resolves after the action finishes.
   */
  const undoLastBulkAction = async () => {
    if (!undoSnapshot) return;
    setTabs(undoSnapshot.tabs);
    setTabOrders(undoSnapshot.tabOrders);
    setTagCatalog(undoSnapshot.tagCatalog);
    setSelectedResultIds(new Set());
    if (storageMode === "backend" && serverOnline) {
      const results = await Promise.allSettled(
        undoSnapshot.tabs.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            {
              url: tab.url,
              title: tab.title,
              note: tab.note,
              agentReview: tab.agentReview,
              viewed: tab.viewed,
              tags: tab.tags,
              groupId: tab.groupId,
              archived: Boolean(tab.archived),
            },
            serverApiKey
          )
        )
      );
      if (results.some(result => result.status === "rejected"))
        toast.error("The server could not restore every tab");
    }
    setUndoSnapshot(null);
    toast.success(`Undid ${undoSnapshot.label}`);
  };

  const selectedTabs = visibleTabs.filter(tab => selectedResultIds.has(tab.id));
  const selectionActive = Boolean(query) || selectionMode;

  /**
   * Move selected visible tabs into one group.
   * Captures undo state, updates local order, then mirrors assignments to the server when connected.
   * @param {string} groupId - Destination group ID.
   * @returns {Promise<void>} Resolves after the action finishes.
   */
  const bulkMoveSelected = async (groupId: GroupId) => {
    if (!selectedTabs.length) return;
    createUndoSnapshot(
      `moving ${selectedTabs.length} tab${selectedTabs.length === 1 ? "" : "s"}`
    );
    const selectedIds = new Set(selectedTabs.map(tab => tab.id));
    setTabs(current =>
      current.map(tab =>
        selectedIds.has(tab.id)
          ? { ...tab, groupId, updatedAt: new Date().toISOString() }
          : tab
      )
    );
    setTabOrders(current => {
      const withoutSelected = Object.fromEntries(
        Object.entries(current).map(([id, orderedIds]) => [
          id,
          orderedIds.filter(id => !selectedIds.has(id)),
        ])
      ) as Record<GroupId, string[]>;
      return {
        ...withoutSelected,
        [groupId]: [
          ...(withoutSelected[groupId] ?? []),
          ...selectedTabs.map(tab => tab.id),
        ],
      };
    });
    if (storageMode === "backend" && serverOnline)
      await Promise.allSettled(
        selectedTabs.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            { groupId },
            serverApiKey
          )
        )
      );
    setSelectedResultIds(new Set());
    toast.success(
      `Moved ${selectedTabs.length} selected tab${selectedTabs.length === 1 ? "" : "s"}`
    );
  };

  /**
   * Apply the entered tag to selected visible tabs.
   * Preserves existing tags, creates a catalog entry when needed, and captures undo state before local changes.
   * @returns {Promise<void>} Resolves after the action finishes.
   */
  const bulkTagSelected = async () => {
    const tag = bulkTag.trim();
    if (!tag || !selectedTabs.length) return;
    createUndoSnapshot(
      `tagging ${selectedTabs.length} tab${selectedTabs.length === 1 ? "" : "s"}`
    );
    setTabs(current =>
      current.map(tab =>
        selectedResultIds.has(tab.id)
          ? {
              ...tab,
              tags: Array.from(new Set([...tab.tags, tag])),
              updatedAt: new Date().toISOString(),
            }
          : tab
      )
    );
    setTagCatalog(current => ({
      ...current,
      [tag]: current[tag] ?? "Applied from ranked search",
    }));
    if (storageMode === "backend" && serverOnline)
      await Promise.allSettled(
        selectedTabs.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            { tags: Array.from(new Set([...tab.tags, tag])) },
            serverApiKey
          )
        )
      );
    setBulkTag("");
    toast.success(
      `Tagged ${selectedTabs.length} selected tab${selectedTabs.length === 1 ? "" : "s"}`
    );
  };

  /**
   * Remove archived tabs from the browser vault and record tombstones.
   * Tombstones protect local deletions from a later server merge; failed remote deletions remain retryable.
   * @param {VaultTab[]} items - Tabs selected for permanent deletion.
   * @returns {Promise<void>} Resolves after the action finishes.
   */
  const permanentlyDeleteTabs = async (items: VaultTab[]) => {
    const ids = new Set(items.map(tab => tab.id));
    recordTombstones(ids);
    setUndoSnapshot(null);
    setTabs(current => current.filter(tab => !ids.has(tab.id)));
    setTabOrders(current =>
      Object.fromEntries(
        Object.entries(current).map(([key, order]) => [
          key,
          order.filter(id => !ids.has(id)),
        ])
      )
    );
    if (storageMode === "backend" && serverOnline) {
      const results = await Promise.allSettled(
        items.map(tab =>
          deleteTabOnLocalServer(localServerUrl, tab.id, serverApiKey, true)
        )
      );
      if (results.some(result => result.status === "rejected")) {
        setServerOnline(false);
        toast.error(
          "Deleted locally. Server deletion will retry when connected."
        );
        return;
      }
    }
    toast.success(
      `Permanently deleted ${items.length} tab${items.length === 1 ? "" : "s"}`
    );
  };

  /**
   * Toggle bulk selection mode.
   * Clears the previous selected IDs when the mode changes.
   */
  const toggleSelectionMode = () => {
    setSelectionMode(current => !current);
    setSelectedResultIds(new Set());
  };

  /**
   * Select or clear all currently visible results.
   * Uses a fresh set so selection changes propagate to React.
   */
  const toggleSelectAll = () => {
    setSelectedResultIds(
      selectedResultIds.size === visibleTabs.length
        ? new Set()
        : new Set(visibleTabs.map(tab => tab.id))
    );
  };

  /**
   * Archive selected tabs or permanently delete them from the Archive page.
   * Normal-page removal is undoable and unassigns tabs; Archive-page removal records tombstones.
   * @returns {Promise<void>} Resolves after the action finishes.
   */
  const removeSelected = async () => {
    if (!selectedTabs.length) return;
    if (isArchivePage) {
      await permanentlyDeleteTabs(selectedTabs);
      setSelectedResultIds(new Set());
      return;
    }
    createUndoSnapshot(
      `archiving ${selectedTabs.length} tab${selectedTabs.length === 1 ? "" : "s"}`
    );
    const removedIds = new Set(selectedTabs.map(tab => tab.id));
    const archivedAt = new Date().toISOString();
    setTabs(current =>
      current.map(tab =>
        removedIds.has(tab.id)
          ? {
              ...tab,
              groupId: null,
              archived: true,
              archivedAt,
              updatedAt: new Date().toISOString(),
            }
          : tab
      )
    );
    setTabOrders(
      current =>
        Object.fromEntries(
          Object.entries(current).map(([groupId, orderedIds]) => [
            groupId,
            orderedIds.filter(id => !removedIds.has(id)),
          ])
        ) as Record<GroupId, string[]>
    );
    if (storageMode === "backend" && serverOnline)
      await Promise.allSettled(
        selectedTabs.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            { archived: true, groupId: null },
            serverApiKey
          )
        )
      );
    setSelectedResultIds(new Set());
    toast(
      `Archived ${selectedTabs.length} selected tab${selectedTabs.length === 1 ? "" : "s"}`
    );
  };

  return {
    selectedResultIds,
    setSelectedResultIds,
    selectionMode,
    setSelectionMode,
    bulkTag,
    setBulkTag,
    undoSnapshot,
    selectionActive,
    toggleResultSelection,
    createUndoSnapshot,
    undoLastBulkAction,
    bulkMoveSelected,
    bulkTagSelected,
    permanentlyDeleteTabs,
    toggleSelectionMode,
    toggleSelectAll,
    removeSelected,
  };
}
