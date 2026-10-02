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
  viewMode,
  navigation,
  collections,
  actions,
  lifecycle,
}: Props) {
  const groups = collections.groups;
  const buckets = new Map<string, VaultTab[]>();
  for (const tab of tabs) {
    const key = tab.placement.groupId ?? "unassigned";
    buckets.set(key, [...(buckets.get(key) ?? []), tab]);
  }
  if (lifecycle.lifecycleMode === "visible" && !navigation.query)
    for (const group of groups)
      if (!buckets.has(group.id)) buckets.set(group.id, []);
  return (
    <div data-testid="tab-list" className="border-t border-[#dcd7cc]">
      {[...buckets].map(([id, members]) => {
        const group = groups.find(g => g.id === id);
        const collapsed = collections.collapsed.has(id);
        return (
          <DroppableGroup
            key={id}
            groupId={id}
            groupName={group?.details.name ?? "[Unassigned]"}
            dropGapHeight={collapsed ? 0 : viewMode === "compact" ? 45 : 96}
            disabled={collapsed || lifecycle.lifecycleMode === "archived"}
          >
            <GroupSeparator
              group={{
                groupId: id,
                groupName: group?.details.name ?? "[Unassigned]",
                groupCategory: group?.details.category,
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
