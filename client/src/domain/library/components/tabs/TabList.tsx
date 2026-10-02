import type { VaultGroup } from "@/domain/library/types";
import { useMemo } from "react";
import {
  DroppableGroup,
  GroupSeparator,
} from "@/domain/library/components/tabs/TabListGroup";
import {
  SortableTabRow,
  TabRow,
} from "@/domain/library/components/tabs/TabRow";
import type { TabViewMode } from "@/domain/library/types";

export { TabDragPreview } from "@/domain/library/components/tabs/TabRow";
export type { TabViewMode } from "@/domain/library/types";

/** Collection membership and ordering for TabListItem. */
type TabListItemPlacement = { groupId: string | null };
/** Display content for TabListItem. */
type TabListItemContent = {
  title: string;
  url: string;
  domain: string;
  color: string;
  icon: string;
};
/** Notes, review, and tag state for TabListItem. */
type TabListItemAnnotations = {
  note: string;
  agentReview: string;
  viewed: boolean;
  customProperties: Record<string, unknown>;
  tags: string[];
};
/** Creation and modification times for TabListItem. */
type TabListItemTimestamps = { createdAt: string; updatedAt: string };
/** Archive and hidden state for TabListItem. */
type TabListItemLifecycle = { hiddenUntil?: string | null };
export type TabListItem = {
  id: string;
  placement: TabListItemPlacement;
  content: TabListItemContent;
  annotations: TabListItemAnnotations;
  timestamps: TabListItemTimestamps;
  lifecycle: TabListItemLifecycle;
};

/** Presentation settings for TabListProps. */
type TabListPresentation = {
  viewMode: TabViewMode;
  previewBackend?: { url: string; apiKey: string };
};
/** Search state and handlers for TabListProps. */
type TabListSearch = {
  query: string;
  semanticScores: Map<string, number>;
  fallbackMode?: "text_fallback" | "semantic";
};
/** Selection state and handlers for TabListProps. */
type TabListSelection = {
  selectionEnabled?: boolean;
  activeResultIndex: number;
  selectedResultIds: Set<string>;
  onActiveIndex: (index: number) => void;
  onToggleSelection: (id: string) => void;
};
/** Interaction handlers for TabListProps. */
type TabListActions = {
  onMove: (id: string, groupId: string | null) => void;
  onEdit: (tab: TabListItem) => void;
  onOpen: (tab: TabListItem, url?: string) => void;
  onViewedChange: (id: string, viewed: boolean) => void;
  onDelete: (tab: TabListItem) => void;
  onOpenTagManager: () => void;
};
/** Archive and hidden state for TabListProps. */
type TabListLifecycle = {
  lifecycleMode?: "visible" | "hidden" | "archived";
  onRestore?: (tab: TabListItem) => void;
  onHide?: (tab: TabListItem, durationMs: number) => void;
  onUnhide?: (tab: TabListItem) => void;
  onProlong?: (tab: TabListItem, durationMs: number) => void;
};
/** collections collectionActions values and callbacks for TabListProps. */
type TabListCollectionsCollectionActions = {
  onOpenGroup?: (groupId: string) => void;
  onShareGroup?: (groupId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onEditGroup?: (groupId: string) => void;
  onHideGroup?: (groupId: string, durationMs: number) => void;
  onUnhideGroup?: (groupId: string) => void;
  onProlongGroup?: (groupId: string, durationMs: number) => void;
};
/** Collection data and navigation callbacks. */
type TabListCollections = {
  groups: Array<Pick<VaultGroup, "id" | "details">>;
  collapsibleGroups?: boolean;
  collapsedGroupIds?: Set<string>;
  visibleGroupIds?: Set<string>;
  onToggleGroup?: (groupId: string) => void;
  collectionActions: TabListCollectionsCollectionActions;
};
type Props = {
  tabs: TabListItem[];
  presentation: TabListPresentation;
  search: TabListSearch;
  selection: TabListSelection;
  actions: TabListActions;
  lifecycle: TabListLifecycle;
  collections: TabListCollections;
};

/**
 * Render saved tabs in the selected list or preview mode.
 * Groups keep order and collapse state while the caller owns selection, lifecycle, and persistence actions.
 * @param {Props} props - Tabs, view and group settings, selection state, and owner action handlers.
 * @returns {React.ReactElement} Grouped tab list or preview stream.
 */
export function TabList({
  tabs,
  presentation: { viewMode, previewBackend },
  search: { query, semanticScores, fallbackMode },
  selection: {
    selectionEnabled = false,
    activeResultIndex,
    selectedResultIds,
    onActiveIndex,
    onToggleSelection,
  },
  collections: {
    collapsibleGroups = false,
    collapsedGroupIds = new Set(),
    onToggleGroup,
    groups,
    visibleGroupIds,
    collectionActions: {
      onOpenGroup,
      onShareGroup,
      onDeleteGroup,
      onEditGroup,
      onHideGroup,
      onUnhideGroup,
      onProlongGroup,
    },
  },
  actions: {
    onMove,
    onEdit,
    onOpen,
    onViewedChange,
    onDelete,
    onOpenTagManager,
  },
  lifecycle: {
    lifecycleMode = "visible",
    onRestore,
    onHide,
    onUnhide,
    onProlong,
  },
}: Props) {
  // Disabled draggables inherit aria-disabled into row actions; previews stay unregistered.
  const Row = viewMode === "preview" ? TabRow : SortableTabRow;
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
        const key = tab.placement.groupId ?? "unassigned";
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
        const groupName =
          groupsById.get(groupId)?.details.name ?? "[Unassigned]";
        const groupCategory = groupsById.get(groupId)?.details.category;
        const showGroupLabel = collapsibleGroups || tabGroups.length > 1;
        const isCollapsed = collapsedGroupIds.has(groupId);
        const dragDisabled = isCollapsed || viewMode === "preview";
        const dropGapHeight = dragDisabled
          ? 0
          : viewMode === "compact"
            ? 45
            : 128;
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
                group={{
                  groupId: groupId,
                  groupName: groupName,
                  groupCategory: groupCategory,
                  tabCount: groupTabs.length,
                }}
                collapse={{
                  collapsible: collapsibleGroups,
                  collapsed: isCollapsed,
                  onToggle: onToggleGroup,
                }}
                actions={{
                  onOpen: onOpenGroup,
                  onShare: onShareGroup,
                  onDelete: onDeleteGroup,
                  onEdit: onEditGroup,
                }}
                lifecycle={{
                  lifecycleMode: lifecycleMode,
                  onHide: onHideGroup,
                  onUnhide: onUnhideGroup,
                  onProlong: onProlongGroup,
                }}
              />
            )}
            {!isCollapsed &&
              groupTabs.map((tab, sortableIndex) => {
                const index = tabIndexes.get(tab.id) ?? -1;
                return (
                  <Row
                    key={tab.id}
                    tab={tab}
                    groups={groups}
                    presentation={{
                      index: index,
                      sortableIndex,
                      viewMode: viewMode,
                      previewBackend: previewBackend,
                    }}
                    search={{
                      query: query,
                      score: semanticScores.get(tab.id),
                      fallbackMode: fallbackMode,
                    }}
                    selection={{
                      selectionEnabled: selectionEnabled,
                      isSelected: selectedResultIds.has(tab.id),
                      isKeyboardActive:
                        query.length > 0 && activeResultIndex === index,
                      onActiveIndex: onActiveIndex,
                      onToggleSelection: onToggleSelection,
                    }}
                    actions={{
                      onMove: onMove,
                      onEdit: onEdit,
                      onOpen: onOpen,
                      onViewedChange: onViewedChange,
                      onDelete: onDelete,
                      onOpenTagManager: onOpenTagManager,
                    }}
                    lifecycle={{
                      lifecycleMode: lifecycleMode,
                      onRestore: onRestore,
                      onHide: onHide,
                      onUnhide: onUnhide,
                      onProlong: onProlong,
                    }}
                  />
                );
              })}
          </DroppableGroup>
        );
      })}
    </div>
  );
}
