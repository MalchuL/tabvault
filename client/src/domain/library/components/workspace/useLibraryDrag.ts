import { useRef, useState } from "react";
import type { DragEndEvent, DragOverEvent } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { moveTab } from "@/domain/library/operations";
import type { PersistedVault } from "@/domain/library/types";
type Placement = { id: string; groupId: string | null; beforeId?: string };
/** Preview cross-group moves in memory and commit only the completed drop.
 * @param {{vault:PersistedVault;mutate:(update:(vault:PersistedVault)=>PersistedVault)=>Promise<PersistedVault>}} options - Current library and durable command boundary.
 * @returns {object} Temporary library projection and drag callbacks.
 */
export function useLibraryDrag({
  vault,
  mutate,
}: {
  vault: PersistedVault;
  mutate: (
    update: (vault: PersistedVault) => PersistedVault
  ) => Promise<PersistedVault>;
}) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const destination = useRef<Placement | null>(null);
  const preview = placement
    ? moveTab(vault, placement.id, placement.groupId, placement.beforeId)
    : vault;
  const handleLibraryDragStart = () => {
    destination.current = null;
    setPlacement(null);
  };
  const handleLibraryDragOver = (event: DragOverEvent) => {
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
    if (targetTab && moving.placement.groupId === groupId) return; // Native sorting owns positions within the rendered group.
    event.preventDefault();
    const point = event.operation.position.current,
      rect = target.shape?.boundingRectangle;
    const after = Boolean(
      targetTab &&
        rect &&
        (vault.preferences.tabView === "groups"
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
    destination.current = next;
    setPlacement(next);
  };
  const handleLibraryDragEnd = async (event: DragEndEvent) => {
    const { source, target } = event.operation;
    const projected = preview;
    const crossed = destination.current;
    destination.current = null;
    setPlacement(null);
    if (event.canceled || !target || !isSortable(source)) return;
    const tab = projected.library.tabs.find(t => t.id === source.id);
    if (!tab || tab.lifecycle.archived) return;
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
    if (source.index === originalIndex && !crossed) return;
    const beforeId =
      source.index === originalIndex
        ? crossed?.beforeId
        : ordered.filter(t => t.id !== tab.id)[source.index]?.id;
    await mutate(current =>
      moveTab(current, tab.id, tab.placement.groupId, beforeId)
    );
  };
  return {
    preview,
    handleLibraryDragStart,
    handleLibraryDragOver,
    handleLibraryDragEnd,
  };
}
