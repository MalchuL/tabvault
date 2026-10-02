import { useRef, useState } from "react";
import type {
  DragEndEvent,
  DragOverEvent,
  DragMoveEvent,
  DragStartEvent,
} from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { moveTab } from "@/domain/library/operations";
import type { PersistedVault } from "@/domain/library/types";
/** Original row identity, collection, and pixel height retained until drop or cancel. */
export type DragOrigin = { id: string; groupId: string; height: number };
type Placement = { id: string; groupId: string | null; beforeId?: string };
/** Preview tab moves in memory and commit only the completed drop.
 * @param {{vault:PersistedVault;mutate:(update:(vault:PersistedVault)=>PersistedVault)=>Promise<PersistedVault>;list:boolean}} options - Current library and durable command boundary.
 * @returns {object} Temporary library projection, original row bounds, and drag callbacks.
 */
export function useLibraryDrag({
  vault,
  mutate,
  list,
}: {
  vault: PersistedVault;
  list: boolean;
  mutate: (
    update: (vault: PersistedVault) => PersistedVault
  ) => Promise<PersistedVault>;
}) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [origin, setOrigin] = useState<DragOrigin | null>(null);
  const destination = useRef<Placement | null>(null);
  const preview = placement
    ? moveTab(vault, placement.id, placement.groupId, placement.beforeId)
    : vault;
  const handleLibraryDragStart = (event: DragStartEvent) => {
    const source = event.operation.source;
    const tab = vault.library.tabs.find(t => t.id === source?.id);
    setOrigin(
      isSortable(source) && tab
        ? {
            id: tab.id,
            groupId: tab.placement.groupId ?? "unassigned",
            height: source.element?.getBoundingClientRect().height ?? 0,
          }
        : null
    );
    destination.current = null;
    setPlacement(null);
  };
  const pointerList = (event: DragOverEvent | DragMoveEvent | DragEndEvent) =>
    list && !(event.operation.activatorEvent instanceof KeyboardEvent);
  const previewPlacement = (event: DragOverEvent | DragMoveEvent) => {
    const { source, target } = event.operation;
    if (!isSortable(source) || !target || source.id === target.id) return;
    const moving = preview.library.tabs.find(t => t.id === source.id);
    const targetTab = preview.library.tabs.find(t => t.id === target.id);
    const raw = targetTab ? targetTab.placement.groupId : target.data.groupId;
    const groupId = raw === "unassigned" ? null : raw;
    if (
      !moving ||
      moving.lifecycle.archived ||
      (groupId !== null && typeof groupId !== "string")
    )
      return;
    if (
      moving.placement.groupId === groupId &&
      (!targetTab || !pointerList(event))
    )
      return;
    const point =
        "to" in event && event.to ? event.to : event.operation.position.current,
      rect = target.shape?.boundingRectangle;
    const after = Boolean(
      targetTab &&
        rect &&
        (!list
          ? point.y > rect.bottom ||
            (point.y >= rect.top && point.x > rect.left + rect.width / 2)
          : point.y > rect.top + rect.height / 2)
    );
    const ordered = preview.library.tabs
      .filter(
        t =>
          !t.lifecycle.archived &&
          t.placement.groupId === groupId &&
          t.id !== moving.id
      )
      .sort((a, b) => a.placement.position - b.placement.position);
    const beforeId = targetTab
      ? after
        ? ordered[ordered.findIndex(t => t.id === targetTab.id) + 1]?.id
        : targetTab.id
      : undefined;
    const next = { id: moving.id, groupId, beforeId };
    const previous = destination.current;
    if (
      previous?.id === next.id &&
      previous.groupId === next.groupId &&
      previous.beforeId === next.beforeId
    )
      return;
    destination.current = next;
    setPlacement(next);
  };
  const handleLibraryDragOver = (event: DragOverEvent) => {
    const { source, target } = event.operation;
    // Keep native sorting only for keyboard and board moves within a group.
    if (
      pointerList(event) ||
      (isSortable(source) &&
        target &&
        (!isSortable(target) || source.group !== target.group))
    )
      event.preventDefault();
    previewPlacement(event);
  };
  const handleLibraryDragMove = (event: DragMoveEvent) => {
    // Crossing a row midpoint does not change the collision target, so dragover
    // alone cannot distinguish insertion before versus after that row.
    if (pointerList(event)) previewPlacement(event);
  };
  const handleLibraryDragEnd = async (event: DragEndEvent) => {
    const { source, target } = event.operation;
    const projected = preview;
    const crossed = destination.current;
    const reset = () => {
      setOrigin(null);
      destination.current = null;
      setPlacement(null);
    };
    if (event.canceled || !target || !isSortable(source)) {
      reset();
      return;
    }
    const tab = projected.library.tabs.find(t => t.id === source.id);
    if (!tab || tab.lifecycle.archived) {
      reset();
      return;
    }
    if (pointerList(event)) {
      try {
        if (crossed)
          await mutate(current =>
            moveTab(current, crossed.id, crossed.groupId, crossed.beforeId)
          );
      } finally {
        // Keep the preview in place until durable state can replace it.
        reset();
      }
      return;
    }
    // Anchor to rendered neighbors, leaving hidden records in their canonical order.
    const renderedIds = [
      ...document.querySelectorAll<HTMLElement>("[data-tab-id]"),
    ].map(el => el.dataset.tabId);
    const ordered = projected.library.tabs
      .filter(
        t =>
          t.placement.groupId === tab.placement.groupId &&
          renderedIds.includes(t.id)
      )
      .sort((a, b) => a.placement.position - b.placement.position);
    const originalIndex = ordered.findIndex(t => t.id === tab.id);
    if (source.index === originalIndex && !crossed) {
      reset();
      return;
    }
    const beforeId =
      source.index === originalIndex
        ? crossed?.beforeId
        : ordered.filter(t => t.id !== tab.id)[source.index]?.id;
    try {
      await mutate(current =>
        moveTab(current, tab.id, tab.placement.groupId, beforeId)
      );
    } finally {
      reset();
    }
  };
  return {
    preview,
    origin,
    handleLibraryDragStart,
    handleLibraryDragOver,
    handleLibraryDragMove,
    handleLibraryDragEnd,
  };
}
