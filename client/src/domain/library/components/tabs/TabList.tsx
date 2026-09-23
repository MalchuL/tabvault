import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMemo } from "react";
import {
  DroppableGroup,
  GroupSeparator,
} from "@/domain/library/components/tabs/TabListGroup";
import { SortableTabRow } from "@/domain/library/components/tabs/TabRow";
import type { TabViewMode } from "@/domain/library/types";

export { TabDragPreview } from "@/domain/library/components/tabs/TabRow";
export type { TabViewMode } from "@/domain/library/types";

export type TabListItem = {
  id: string;
  groupId: string | null;
  title: string;
  url: string;
  domain: string;
  note: string;
  agentReview: string;
  viewed: boolean;
  customProperties: Record<string, unknown>;
  tags: string[];
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  hiddenUntil?: string | null;
};

type Props = {
  tabs: TabListItem[];
  viewMode: TabViewMode;
  query: string;
  selectionEnabled?: boolean;
  collapsibleGroups?: boolean;
  collapsedGroupIds?: Set<string>;
  onToggleGroup?: (groupId: string) => void;
  activeResultIndex: number;
  selectedResultIds: Set<string>;
  semanticScores: Map<string, number>;
  fallbackMode?: "text_fallback" | "semantic";
  onActiveIndex: (index: number) => void;
  onToggleSelection: (id: string) => void;
  onMove: (id: string, groupId: string | null) => void;
  onEdit: (tab: TabListItem) => void;
  onOpen: (tab: TabListItem, url?: string) => void;
  onViewedChange: (id: string, viewed: boolean) => void;
  onDelete: (tab: TabListItem) => void;
  lifecycleMode?: "visible" | "hidden" | "archived";
  onRestore?: (tab: TabListItem) => void;
  onHide?: (tab: TabListItem, durationMs: number) => void;
  onUnhide?: (tab: TabListItem) => void;
  onProlong?: (tab: TabListItem, durationMs: number) => void;
  onOpenTagManager: () => void;
  onOpenGroup?: (groupId: string) => void;
  onShareGroup?: (groupId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onEditGroup?: (groupId: string) => void;
  onHideGroup?: (groupId: string, durationMs: number) => void;
  onUnhideGroup?: (groupId: string) => void;
  onProlongGroup?: (groupId: string, durationMs: number) => void;
  groups: Array<{ id: string; name: string; category?: string }>;
  visibleGroupIds?: Set<string>;
  previewBackend?: { url: string; apiKey: string };
  activeDragHeight?: number;
};

/**
 * Render saved tabs in the selected list or preview mode.
 * Groups keep order and collapse state while the caller owns selection, lifecycle, and persistence actions.
 * @param {Props} props - Tabs, view and group settings, selection state, and owner action handlers.
 * @returns {React.ReactElement} Grouped tab list or preview stream.
 */
export function TabList({
  tabs,
  viewMode,
  query,
  selectionEnabled = false,
  collapsibleGroups = false,
  collapsedGroupIds = new Set(),
  onToggleGroup,
  activeResultIndex,
  selectedResultIds,
  semanticScores,
  fallbackMode,
  onActiveIndex,
  onToggleSelection,
  onMove,
  onEdit,
  onOpen,
  onViewedChange,
  onDelete,
  lifecycleMode = "visible",
  onRestore,
  onHide,
  onUnhide,
  onProlong,
  onOpenTagManager,
  onOpenGroup,
  onShareGroup,
  onDeleteGroup,
  onEditGroup,
  onHideGroup,
  onUnhideGroup,
  onProlongGroup,
  groups,
  visibleGroupIds,
  previewBackend,
  activeDragHeight,
}: Props) {
  const tabIndexes = useMemo(
    () => new Map(tabs.map((tab, index) => [tab.id, index])),
    [tabs]
  );
  const groupsById = useMemo(
    () => new Map(groups.map(group => [group.id, group])),
    [groups]
  );
  const tabGroups = useMemo(() => {
    const groupedTabs = tabs.reduce<Map<string, TabListItem[]>>(
      (groupsById, tab) => {
        const key = tab.groupId ?? "unassigned";
        const groupTabs = groupsById.get(key) ?? [];
        groupTabs.push(tab);
        groupsById.set(key, groupTabs);
        return groupsById;
      },
      new Map()
    );
    if (!collapsibleGroups) return Array.from(groupedTabs);

    const unassignedTabs = groupedTabs.get("unassigned");
    return [
      ...(unassignedTabs?.length
        ? ([["unassigned", unassignedTabs]] as const)
        : []),
      ...groups
        .filter(group => !visibleGroupIds || visibleGroupIds.has(group.id))
        .map(group => [group.id, groupedTabs.get(group.id) ?? []] as const),
      ...Array.from(groupedTabs).filter(
        ([groupId]) => groupId !== "unassigned" && !groupsById.has(groupId)
      ),
    ];
  }, [collapsibleGroups, groups, groupsById, tabs, visibleGroupIds]);

  return (
    <div
      data-testid="tab-list"
      className={`catalog-rule border-t border-[#dcd7cc] ${viewMode === "compact" ? "pl-2 sm:pl-3" : "pl-3 sm:pl-4"}`}
    >
      {tabGroups.map(([groupId, groupTabs]) => {
        const groupName = groupsById.get(groupId)?.name ?? "[Unassigned]";
        const groupCategory = groupsById.get(groupId)?.category;
        const showGroupLabel = collapsibleGroups || tabGroups.length > 1;
        const isCollapsed = collapsedGroupIds.has(groupId);
        const dragDisabled = isCollapsed || viewMode === "preview";
        const dropGapHeight = dragDisabled
          ? 0
          : (activeDragHeight ?? (viewMode === "compact" ? 45 : 128));
        return (
          <DroppableGroup
            key={groupId}
            groupId={groupId}
            groupName={groupName}
            dropGapHeight={dropGapHeight}
            disabled={dragDisabled}
          >
            {showGroupLabel && (
              <GroupSeparator
                groupId={groupId}
                groupName={groupName}
                groupCategory={groupCategory}
                tabCount={groupTabs.length}
                collapsible={collapsibleGroups}
                collapsed={isCollapsed}
                onToggle={onToggleGroup}
                onOpen={onOpenGroup}
                onShare={onShareGroup}
                onDelete={onDeleteGroup}
                onEdit={onEditGroup}
                lifecycleMode={lifecycleMode}
                onHide={onHideGroup}
                onUnhide={onUnhideGroup}
                onProlong={onProlongGroup}
              />
            )}
            {!isCollapsed && (
              <>
                <SortableContext
                  items={groupTabs.map(tab => tab.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {groupTabs.map(tab => {
                    const index = tabIndexes.get(tab.id) ?? -1;
                    return (
                      <SortableTabRow
                        key={tab.id}
                        tab={tab}
                        index={index}
                        viewMode={viewMode}
                        query={query}
                        selectionEnabled={selectionEnabled}
                        isSelected={selectedResultIds.has(tab.id)}
                        isKeyboardActive={
                          query.length > 0 && activeResultIndex === index
                        }
                        score={semanticScores.get(tab.id)}
                        fallbackMode={fallbackMode}
                        onActiveIndex={onActiveIndex}
                        onToggleSelection={onToggleSelection}
                        onMove={onMove}
                        onEdit={onEdit}
                        onOpen={onOpen}
                        onViewedChange={onViewedChange}
                        onDelete={onDelete}
                        lifecycleMode={lifecycleMode}
                        onRestore={onRestore}
                        onHide={onHide}
                        onUnhide={onUnhide}
                        onProlong={onProlong}
                        onOpenTagManager={onOpenTagManager}
                        groups={groups}
                        previewBackend={previewBackend}
                      />
                    );
                  })}
                </SortableContext>
              </>
            )}
          </DroppableGroup>
        );
      })}
    </div>
  );
}
