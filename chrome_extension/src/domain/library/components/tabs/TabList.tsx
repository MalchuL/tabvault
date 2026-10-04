import type { DragOrigin } from "../workspace/useLibraryDrag";
import { DroppableGroup, GroupSeparator } from "./TabListGroup";
import {
  SortableTabRow,
  type TabActions,
  type TabLifecycleActions,
} from "./TabRow";
import type { ComponentProps } from "react";
import type { VaultTab, VaultGroup, TabViewMode } from "@/domain/library/types";
export { TabDragPreview } from "./TabRow";
export type { TabViewMode } from "@/domain/library/types";
export type TabListItem = VaultTab;
type Collections = {
  groups: VaultGroup[];
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  actions: ComponentProps<typeof GroupSeparator>["actions"];
  lifecycle: ComponentProps<typeof GroupSeparator>["lifecycle"];
};
type Props = {
  tabs: VaultTab[];
  dragOrigin: DragOrigin | null;
  viewMode: TabViewMode;
  navigation: {
    query: string;
    activeIndex: number;
    onActiveIndex: (index: number) => void;
  };
  collections: Collections;
  actions: TabActions;
  lifecycle: TabLifecycleActions;
};
/** Reuse the grouped list for active, hidden, and archived occurrences. @param {Props} props - Visible records and owner callbacks. @returns {React.ReactElement} Accessible grouped list. */
export function TabList({
  tabs,
  dragOrigin,
  viewMode,
  navigation,
  collections,
  actions,
  lifecycle,
}: Props) {
  const groups = collections.groups;
  // Build collection slots from collection order, never from tab membership.
  const buckets = new Map<string, VaultTab[]>([
    ["unassigned", []],
    ...groups.map(group => [group.id, []] as [string, VaultTab[]]),
  ]);
  for (const tab of tabs)
    buckets.get(tab.placement.groupId ?? "unassigned")?.push(tab);
  const orderedBuckets = [...buckets].filter(
    ([id, members]) =>
      members.length > 0 ||
      dragOrigin?.groupId === id ||
      (id !== "unassigned" &&
        lifecycle.lifecycleMode === "visible" &&
        !navigation.query)
  );
  return (
    <div data-testid="tab-list" className="border-t border-[#dcd7cc]">
      {orderedBuckets.map(([id, members]) => {
        const group = groups.find(g => g.id === id);
        const collapsed = collections.collapsed.has(id);
        const rowHeight = viewMode === "compact" ? 45 : 96;
        const startedHere = dragOrigin?.groupId === id;
        const containsDragged = members.some(tab => tab.id === dragOrigin?.id);
        const draggedHeight = dragOrigin?.height || rowHeight;
        // Exchange the reserved gap with the projected row so targets do not move
        // under a stationary pointer when the source loses its last tab.
        const dropGapHeight =
          rowHeight +
          (startedHere && !containsDragged
            ? draggedHeight
            : !startedHere && containsDragged
              ? -Math.min(rowHeight, draggedHeight)
              : 0);
        return (
          <DroppableGroup
            key={id}
            groupId={id}
            groupName={group?.details.name ?? "[Unassigned]"}
            groupColor={group?.details.accent}
            dropGapHeight={collapsed ? 0 : dropGapHeight}
            disabled={collapsed || lifecycle.lifecycleMode === "archived"}
          >
            <GroupSeparator
              group={{
                groupId: id,
                groupName: group?.details.name ?? "[Unassigned]",
                groupCategory: group?.details.category,
                groupColor: group?.details.accent,
                tabCount: members.length,
              }}
              collapse={{
                collapsible: true,
                collapsed,
                onToggle: collections.onToggle,
              }}
              actions={collections.actions}
              lifecycle={collections.lifecycle}
            />
            {!collapsed &&
              members.map((tab, index) => (
                <SortableTabRow
                  key={tab.id}
                  tab={tab}
                  groups={groups}
                  presentation={{ viewMode, index }}
                  navigation={{
                    active:
                      Boolean(navigation.query) &&
                      tabs[navigation.activeIndex]?.id === tab.id,
                    onActive: () => navigation.onActiveIndex(tabs.indexOf(tab)),
                  }}
                  actions={actions}
                  lifecycle={lifecycle}
                />
              ))}
          </DroppableGroup>
        );
      })}
    </div>
  );
}
