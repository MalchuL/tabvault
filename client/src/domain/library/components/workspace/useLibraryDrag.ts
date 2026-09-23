import { useCallback, useRef, useState, type SetStateAction } from "react";
import {
  closestCenter,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
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

type LibraryDragOptions = {
  tabs: VaultTab[];
  tabOrders: Record<string, string[]>;
  setTabs: (value: SetStateAction<VaultTab[]>) => void;
  setTabOrders: (value: SetStateAction<Record<string, string[]>>) => void;
  vaultGroups: VaultGroup[];
  tabView: LibraryViewMode;
  storageMode: StorageMode;
  serverOnline: boolean;
  setServerOnline: (online: boolean) => void;
  localServerUrl: string;
  serverApiKey: string;
};

type LibraryDragBindings = {
  sensors: ReturnType<typeof useSensors>;
  collisionDetectionStrategy: CollisionDetection;
  activeDragId: string | undefined;
  handleLibraryDragStart: (event: DragStartEvent) => void;
  handleLibraryDragOver: (event: DragOverEvent) => void;
  handleLibraryDragEnd: (event: DragEndEvent) => Promise<void>;
  cancelLibraryDrag: () => void;
};

/**
 * Keep sortable collision, optimistic order, and remote ordering in one controller.
 * The workspace owns tab state; canceled drags restore the pre-drag snapshot.
 * @param {LibraryDragOptions} options - Current library state, state setters, and server connection.
 * @returns {LibraryDragBindings} DnD handlers, sensors, collision strategy, and active overlay ID.
 */
export function useLibraryDrag({
  tabs,
  tabOrders,
  setTabs,
  setTabOrders,
  vaultGroups,
  tabView,
  storageMode,
  serverOnline,
  setServerOnline,
  localServerUrl,
  serverApiKey,
}: LibraryDragOptions): LibraryDragBindings {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const collisionDetectionStrategy: CollisionDetection = useCallback(args => {
    const pointerCollisions = pointerWithin(args).filter(
      ({ id }) => id !== args.active.id
    );
    const quickMoveTarget = pointerCollisions.find(({ id }) =>
      String(id).startsWith("collection-drop:")
    );
    if (quickMoveTarget) return [quickMoveTarget];
    const pointerItemCollisions = pointerCollisions.filter(
      ({ id }) =>
        !/^(collection-drop|group-drop|group-container):/.test(String(id))
    );
    if (pointerItemCollisions.length) return pointerItemCollisions;
    const groupContainer = pointerCollisions.find(({ id }) =>
      String(id).startsWith("group-container:")
    );
    if (groupContainer) {
      const container = args.droppableContainers.find(
        item => item.id === groupContainer.id
      );
      if (container?.data.current?.layout === "grid") {
        const items = args.droppableContainers.filter(
          item =>
            item.id !== args.active.id &&
            item.data.current?.sortable &&
            item.data.current?.groupId === container.data.current?.groupId
        );
        const nearest = closestCenter({ ...args, droppableContainers: items });
        if (nearest.length) return nearest;
      }
      return [groupContainer];
    }
    const itemCollisions = closestCenter(args).filter(
      ({ id }) =>
        !/^(collection-drop|group-drop|group-container):/.test(String(id))
    );
    if (itemCollisions.length) return [itemCollisions[0]];
    return pointerCollisions.length ? pointerCollisions : closestCenter(args);
  }, []);
  const [activeDragId, setActiveDragId] = useState<string>();
  const dragSnapshotRef = useRef<
    | {
        tabs: VaultTab[];
        tabOrders: Record<string, string[]>;
      }
    | undefined
  >(undefined);
  const lastCrossOverRef = useRef<
    { groupId: GroupId; entryOverId: string; overId: string } | undefined
  >(undefined);
  /**
   * Capture the state before a library drag.
   *
   * The snapshot lets cancellation restore both membership and order after optimistic drag updates.
   * @param {DragStartEvent} event - Drag-start event containing the active tab ID.
   */
  const handleLibraryDragStart = ({ active }: DragStartEvent) => {
    dragSnapshotRef.current = { tabs, tabOrders };
    lastCrossOverRef.current = undefined;
    setActiveDragId(String(active.id));
  };

  /**
   * Preview a tab's drag destination and position.
   *
   * Move the tab optimistically across collections, using pointer position to choose insertion order.
   * @param {DragOverEvent} event - Drag-over event with the active item, target, pointer origin, and displacement.
   */
  const handleLibraryDragOver = ({
    active,
    over,
    activatorEvent,
    delta,
  }: DragOverEvent) => {
    if (!over || active.id === over.id) return;
    const source = tabs.find(tab => tab.id === active.id);
    const target = tabs.find(tab => tab.id === over.id);
    const dropGroupId = target ? target.groupId : over.data.current?.groupId;
    const groupId = dropGroupId === "unassigned" ? null : dropGroupId;
    if (!source || (groupId !== null && typeof groupId !== "string")) return;
    const destinationKey = orderKey(groupId);

    if (source.groupId === groupId) {
      const original = dragSnapshotRef.current?.tabs.find(
        tab => tab.id === active.id
      );
      if (original?.groupId !== groupId && lastCrossOverRef.current) {
        if (target) lastCrossOverRef.current.overId = String(over.id);
      }
      if (
        String(over.id).startsWith("group-container:") &&
        !lastCrossOverRef.current
      ) {
        setTabOrders(current => {
          const order = current[destinationKey] ?? [];
          if (order.at(-1) === source.id) return current;
          return {
            ...current,
            [destinationKey]: [
              ...order.filter(id => id !== source.id),
              source.id,
            ],
          };
        });
      }
      return;
    }

    const pointerY =
      "clientY" in activatorEvent && typeof activatorEvent.clientY === "number"
        ? activatorEvent.clientY + delta.y
        : undefined;
    const activeRect = active.rect.current.translated;
    const pointerX =
      "clientX" in activatorEvent && typeof activatorEvent.clientX === "number"
        ? activatorEvent.clientX + delta.x
        : undefined;
    const placeAfter = Boolean(
      target &&
        (tabView === "groups"
          ? pointerX !== undefined && pointerY !== undefined
            ? pointerY > over.rect.bottom ||
              (pointerY >= over.rect.top &&
                pointerX > over.rect.left + over.rect.width / 2)
            : activeRect && activeRect.left > over.rect.left
          : pointerY !== undefined
            ? pointerY > over.rect.top + over.rect.height / 2
            : activeRect && activeRect.top > over.rect.top + over.rect.height)
    );
    setTabs(current =>
      current.map(tab => (tab.id === source.id ? { ...tab, groupId } : tab))
    );
    setTabOrders(current => {
      const next = Object.fromEntries(
        Object.entries(current).map(([id, orderedIds]) => [
          id,
          orderedIds.filter(id => id !== source.id),
        ])
      ) as Record<GroupId, string[]>;
      const destination = [...(next[destinationKey] ?? [])];
      const targetIndex = target ? destination.indexOf(target.id) : -1;
      destination.splice(
        targetIndex < 0
          ? destination.length
          : targetIndex + (placeAfter ? 1 : 0),
        0,
        source.id
      );
      return { ...next, [destinationKey]: destination };
    });
    lastCrossOverRef.current = {
      groupId,
      entryOverId: String(over.id),
      overId: String(over.id),
    };
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
    lastCrossOverRef.current = undefined;
    setActiveDragId(undefined);
  };

  /**
   * Commit the final tab drag position.
   *
   * Restore a canceled drop; otherwise persist the destination and affected collection orders to the server in sequence.
   * @param {DragEndEvent} event - Drag-end event identifying the moved tab and final target.
   * @returns {Promise<void>} Resolves after remote ordering is saved or reported as failed.
   */
  const handleLibraryDragEnd = async ({ active, over }: DragEndEvent) => {
    const snapshot = dragSnapshotRef.current;
    const lastCrossOver = lastCrossOverRef.current;
    dragSnapshotRef.current = undefined;
    lastCrossOverRef.current = undefined;
    setActiveDragId(undefined);
    if (!over) {
      if (snapshot) {
        setTabs(snapshot.tabs);
        setTabOrders(snapshot.tabOrders);
      }
      return;
    }
    const source = tabs.find(tab => tab.id === active.id);
    if (!source) return;
    const original = snapshot?.tabs.find(tab => tab.id === active.id);
    const movedToAnotherGroup = original?.groupId !== source.groupId;
    const finalOverId = movedToAnotherGroup
      ? (lastCrossOver?.overId ?? String(over.id))
      : String(over.id);
    const target = tabs.find(tab => tab.id === finalOverId);
    const stayedOnInitialCrossTarget =
      movedToAnotherGroup &&
      lastCrossOver?.entryOverId === lastCrossOver?.overId;
    let nextTabOrders = tabOrders;
    if (
      active.id !== over.id &&
      target?.groupId === source.groupId &&
      !stayedOnInitialCrossTarget
    ) {
      const sourceKey = orderKey(source.groupId);
      const currentOrder = nextTabOrders[sourceKey] ?? [];
      const sourceIndex = currentOrder.indexOf(source.id);
      const originalTargetIndex = currentOrder.indexOf(target.id);
      const order = currentOrder.filter(id => id !== source.id);
      const targetIndex = order.indexOf(target.id);
      order.splice(
        targetIndex < 0
          ? order.length
          : targetIndex + (sourceIndex < originalTargetIndex ? 1 : 0),
        0,
        source.id
      );
      nextTabOrders = { ...nextTabOrders, [sourceKey]: order };
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
            .filter(tab => !tab.archived && tab.groupId === groupId)
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
            { groupId: source.groupId },
            serverApiKey
          );
          await reorderTabsOnLocalServer(
            localServerUrl,
            original.groupId,
            activeOrder(original.groupId),
            serverApiKey
          );
          await reorderTabsOnLocalServer(
            localServerUrl,
            source.groupId,
            activeOrder(source.groupId),
            serverApiKey
          );
        } else {
          await reorderTabsOnLocalServer(
            localServerUrl,
            source.groupId,
            activeOrder(source.groupId),
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
        vaultGroups.find(group => group.id === source.groupId)?.name ??
        "collection";
      toast.success(`Moved to ${destination}`, {
        description: "Placed at the requested position in this collection.",
      });
    } else if (active.id !== over.id) {
      toast.success("Order updated", {
        description: "The tab has been repositioned in this collection.",
      });
    }
  };

  return {
    sensors,
    collisionDetectionStrategy,
    activeDragId,
    handleLibraryDragStart,
    handleLibraryDragOver,
    handleLibraryDragEnd,
    cancelLibraryDrag,
  };
}
