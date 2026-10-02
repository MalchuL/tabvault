import { pointerIntersection } from "@dnd-kit/collision";
import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabRowActions } from "./TabRowActions";
import { TabFavicon, ViewedCheckbox } from "./TabContentParts";
import { openSavedLink } from "./tabLinkEvents";
import type { VaultTab, VaultGroup, TabViewMode } from "@/domain/library/types";
export type TabActions = {
  onMove: (id: string, groupId: string | null) => void;
  onEdit: (tab: VaultTab) => void;
  onOpen: (tab: VaultTab, url?: string) => void;
  onViewedChange: (id: string, viewed: boolean) => void;
  onDelete: (tab: VaultTab) => void;
  onOpenTagManager: () => void;
};
export type TabLifecycleActions = {
  lifecycleMode: "visible" | "hidden" | "archived";
  onRestore?: (tab: VaultTab) => void;
  onHide?: (tab: VaultTab, duration: number) => void;
  onUnhide?: (tab: VaultTab) => void;
  onProlong?: (tab: VaultTab, duration: number) => void;
};
export type TabRowProps = {
  tab: VaultTab;
  groups: VaultGroup[];
  presentation: { viewMode: TabViewMode; index: number };
  navigation: { active: boolean; onActive: () => void };
  actions: TabActions;
  lifecycle: TabLifecycleActions;
};
/** Render a sortable occurrence without selection or page capture. @param {TabRowProps} props - Record, navigation, and domain callbacks. @returns {React.ReactElement} Tab row. */
export function SortableTabRow({
  tab,
  groups,
  presentation,
  navigation,
  actions,
  lifecycle,
}: TabRowProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: tab.id,
    index: presentation.index,
    collisionDetector: pointerIntersection,
    collisionPriority: 3,
    disabled: lifecycle.lifecycleMode === "archived",
    group: tab.placement.groupId ?? "unassigned",
  });
  const compact = presentation.viewMode === "compact";
  return (
    <article
      ref={ref}
      id={`search-result-${tab.id}`}
      data-testid={`tab-row-${tab.id}`}
      data-tab-id={tab.id}
      data-dragging={isDragging ? "true" : "false"}
      onMouseEnter={navigation.onActive}
      className={`group flex items-center gap-3 border-b border-[#dfdbd0] px-3 ${compact ? "h-[45px]" : "min-h-24 py-3"} ${isDragging ? "opacity-0" : ""} ${navigation.active ? "bg-[#fff7f1]" : "hover:bg-[#fffdf8]"}`}
    >
      <Button
        ref={handleRef}
        size="icon-sm"
        variant="ghost"
        aria-label={`Reorder ${tab.content.title}`}
        data-testid={`tab-drag-handle-${tab.id}`}
        className="touch-none cursor-grab"
      >
        <GripVertical className="h-4 w-4" />
      </Button>
      <TabFavicon tab={tab} size={compact ? "compact" : "standard"} />
      <div className="min-w-0 flex-1">
        <a
          href={tab.content.url}
          target="_blank"
          rel="noreferrer"
          onClick={event => openSavedLink(event, tab, actions.onOpen)}
          onAuxClick={event => openSavedLink(event, tab, actions.onOpen)}
          className="block truncate text-[13px] font-semibold hover:underline"
        >
          {tab.content.title}
        </a>
        {!compact && (
          <>
            {tab.lifecycle.hiddenUntil &&
              lifecycle.lifecycleMode === "hidden" && (
                <p className="text-xs">
                  Resting until{" "}
                  {new Date(tab.lifecycle.hiddenUntil).toLocaleString()}
                </p>
              )}
            <p className="truncate text-xs text-[#84877f]">
              {tab.content.domain}
            </p>
            <div className="flex gap-2">
              {tab.annotations.tags.slice(0, 3).map(tag => (
                <button
                  key={tag}
                  className="text-xs text-[#687067]"
                  onClick={actions.onOpenTagManager}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <ViewedCheckbox
        tab={tab}
        hidden={lifecycle.lifecycleMode === "hidden"}
        onChange={actions.onViewedChange}
      />
      <span
        data-tab-drag-space
        data-testid={`tab-drag-space-${tab.id}`}
        className="h-6 min-w-5 touch-none cursor-grab"
      />
      <TabRowActions
        tab={tab}
        viewMode={presentation.viewMode}
        groups={groups}
        actions={actions}
        lifecycle={lifecycle}
      />
    </article>
  );
}
/** Show a noninteractive floating drag label. @param {{tab:VaultTab}} props - Moving record. @returns {React.ReactElement} Drag feedback. */
export function TabDragPreview({ tab }: { tab: VaultTab }) {
  return (
    <div
      data-testid="tab-drag-preview"
      className="rounded bg-[#fffdf8] p-3 shadow-lg"
    >
      {tab.content.title}
    </div>
  );
}
