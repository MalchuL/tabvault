import { useRef, type SetStateAction } from "react";
import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { toast } from "sonner";
import { orderKey } from "@/domain/library/codec";
import {
  reorderTabsOnLocalServer,
  updateTabOnLocalServer,
} from "@/domain/server/libraryApi";
import type { StorageMode } from "@/domain/server/browserStorage";
import type {
  GroupId,
  LibraryViewMode,
  VaultGroup,
  VaultTab,
} from "@/domain/library/types";

/** Library records and mutation handlers for LibraryDragOptions. */
type LibraryDragLibrary = {
  tabs: VaultTab[];
  renderedTabs: VaultTab[];
  tabOrders: Record<string, string[]>;
  setTabs: (value: SetStateAction<VaultTab[]>) => void;
  setTabOrders: (value: SetStateAction<Record<string, string[]>>) => void;
  vaultGroups: VaultGroup[];
};
/** Storage and server connection state for LibraryDragOptions. */
type LibraryDragConnection = {
  storageMode: StorageMode;
  serverOnline: boolean;
  setServerOnline: (online: boolean) => void;
  localServerUrl: string;
  serverApiKey: string;
};
type LibraryDragOptions = {
  tabView: LibraryViewMode;
  library: LibraryDragLibrary;
  connection: LibraryDragConnection;
};

type LibraryDragBindings = {
  handleLibraryDragStart: (event: DragStartEvent) => void;
  handleLibraryDragOver: (event: DragOverEvent) => void;
  handleLibraryDragEnd: (event: DragEndEvent) => Promise<void>;
};

/**
 * Keep collection transfers, sortable order, and remote ordering in one controller.
 * The workspace owns tab state; canceled drags restore the pre-drag snapshot.
 * @param {LibraryDragOptions} options - Current library state, state setters, and server connection.
 * @returns {LibraryDragBindings} DnD handlers for collection transfers and order persistence.
 */
export function useLibraryDrag({
  tabView,
  library: {
    tabs,
    renderedTabs,
    tabOrders,
    setTabs,
    setTabOrders,
    vaultGroups,
  },
  connection: {
    storageMode,
    serverOnline,
    setServerOnline,
    localServerUrl,
    serverApiKey,
  },
}: LibraryDragOptions): LibraryDragBindings {
  const dragSnapshotRef = useRef<
    | {
        tabs: VaultTab[];
        tabOrders: Record<string, string[]>;
      }
    | undefined
  >(undefined);
  /**
   * Capture the state before a library drag.
   *
   * The snapshot lets cancellation restore both membership and order after optimistic drag updates.
   */
  const handleLibraryDragStart = () => {
    dragSnapshotRef.current = { tabs, tabOrders };
  };

  /**
   * Transfer tabs between collections while native sorting handles each list.
   *
   * React owns cross-collection moves; insertion uses the pointer so wrapped favicons
   * land on the requested side. Collection backgrounds and quick-move chips append.
   * @param {DragOverEvent} event - Source, destination, and current drag position.
   */
  const handleLibraryDragOver = (event: DragOverEvent) => {
    const { source, target } = event.operation;
    if (!isSortable(source) || !target) return;
    const tab = tabs.find(tab => tab.id === source.id);
    const targetTab = tabs.find(tab => tab.id === target.id);
    const dropGroupId = targetTab
      ? targetTab.placement.groupId
      : target.data.groupId;
    const groupId = dropGroupId === "unassigned" ? null : dropGroupId;
    if (!tab || (groupId !== null && typeof groupId !== "string")) return;
    if (targetTab && tab.placement.groupId === groupId) return;

    // Prevent DOM reparenting: React renders the tab under its new collection.
    event.preventDefault();
    const destinationKey = orderKey(groupId);
    const pointer = event.operation.position.current;
    const rect = target.shape?.boundingRectangle;
    const placeAfter = Boolean(
      targetTab &&
        rect &&
        (tabView === "groups"
          ? pointer.y > rect.bottom ||
            (pointer.y >= rect.top && pointer.x > rect.left + rect.width / 2)
          : pointer.y > rect.top + rect.height / 2)
    );
    if (tab.placement.groupId !== groupId) {
      setTabs(current =>
        current.map(item =>
          item.id === tab.id
            ? { ...item, placement: { ...item.placement, groupId } }
            : item
        )
      );
    }
    setTabOrders(current => {
      const next = Object.fromEntries(
        Object.entries(current).map(([key, ids]) => [
          key,
          ids.filter(id => id !== tab.id),
        ])
      );
      const destination = [...(next[destinationKey] ?? [])];
      const targetIndex = targetTab ? destination.indexOf(targetTab.id) : -1;
      destination.splice(
        targetIndex < 0
          ? destination.length
          : targetIndex + (placeAfter ? 1 : 0),
        0,
        tab.id
      );
      return { ...next, [destinationKey]: destination };
    });
  };

  /**
   * Restore the library state after a canceled drag.
   *
   * Reapply the pre-drag tabs and ordering, then clear drag tracking references.
   */
  const cancelLibraryDrag = () => {
    if (dragSnapshotRef.current) {
      setTabs(dragSnapshotRef.current.tabs);
      setTabOrders(dragSnapshotRef.current.tabOrders);
    }
    dragSnapshotRef.current = undefined;
  };

  /**
   * Commit the final tab drag position.
   *
   * Restore a canceled drop; otherwise persist the destination and affected collection orders to the server in sequence.
   * @param {DragEndEvent} event - Drag-end event identifying the moved tab and final target.
   * @returns {Promise<void>} Resolves after remote ordering is saved or reported as failed.
   */
  const handleLibraryDragEnd = async (event: DragEndEvent) => {
    const { source: draggable, target } = event.operation;
    if (event.canceled || !target || !isSortable(draggable)) {
      cancelLibraryDrag();
      return;
    }
    const snapshot = dragSnapshotRef.current;
    dragSnapshotRef.current = undefined;
    const source = tabs.find(tab => tab.id === draggable.id);
    if (!source) return;
    const original = snapshot?.tabs.find(tab => tab.id === draggable.id);
    const movedToAnotherGroup =
      original?.placement.groupId !== source.placement.groupId;
    const sourceKey = orderKey(source.placement.groupId);
    const currentOrder = tabOrders[sourceKey] ?? [];
    const visibleOrder = renderedTabs.filter(
      tab => tab.placement.groupId === source.placement.groupId
    );
    let nextTabOrders = tabOrders;
    if (
      visibleOrder.findIndex(tab => tab.id === source.id) !== draggable.index
    ) {
      const nextVisibleTab = visibleOrder.filter(tab => tab.id !== source.id)[
        draggable.index
      ];
      const order = currentOrder.filter(id => id !== source.id);
      // Anchor to visible neighbors rather than treating hidden tabs as sortable slots.
      const insertionIndex = nextVisibleTab
        ? order.indexOf(nextVisibleTab.id)
        : -1;
      order.splice(
        insertionIndex < 0 ? order.length : insertionIndex,
        0,
        source.id
      );
      nextTabOrders = { ...tabOrders, [sourceKey]: order };
      setTabOrders(nextTabOrders);
    }

    if (storageMode === "backend" && serverOnline) {
      /**
       * Build the complete active order for one collection.
       *
       * Keep stored IDs that still belong to the collection and append active tabs absent from that order.
       * @param {string | null} groupId - Collection identifier, or null for Unassigned.
       * @returns {string[]} Ordered IDs of all nonarchived tabs in the collection.
       */
      const activeOrder = (groupId: GroupId | null) => {
        const remaining = new Set(
          tabs
            .filter(
              tab =>
                !tab.lifecycle.archived && tab.placement.groupId === groupId
            )
            .map(tab => tab.id)
        );
        const ordered = (nextTabOrders[orderKey(groupId)] ?? []).filter(id =>
          remaining.delete(id)
        );
        return [...ordered, ...Array.from(remaining)];
      };
      try {
        if (movedToAnotherGroup && original) {
          await updateTabOnLocalServer(
            localServerUrl,
            source.id,
            { placement: { groupId: source.placement.groupId } },
            serverApiKey
          );
          await reorderTabsOnLocalServer(
            localServerUrl,
            original.placement.groupId,
            activeOrder(original.placement.groupId),
            serverApiKey
          );
          await reorderTabsOnLocalServer(
            localServerUrl,
            source.placement.groupId,
            activeOrder(source.placement.groupId),
            serverApiKey
          );
        } else {
          await reorderTabsOnLocalServer(
            localServerUrl,
            source.placement.groupId,
            activeOrder(source.placement.groupId),
            serverApiKey
          );
        }
      } catch {
        setServerOnline(false);
        toast.error("Could not save the new tab order");
        return;
      }
    }

    if (movedToAnotherGroup) {
      const destination =
        vaultGroups.find(group => group.id === source.placement.groupId)
          ?.details.name ?? "collection";
      toast.success(`Moved to ${destination}`, {
        description: "Placed at the requested position in this collection.",
      });
    } else if (draggable.initialIndex !== draggable.index) {
      toast.success("Order updated", {
        description: "The tab has been repositioned in this collection.",
      });
    }
  };

  return {
    handleLibraryDragStart,
    handleLibraryDragOver,
    handleLibraryDragEnd,
  };
}
