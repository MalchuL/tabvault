import { Button } from "@/components/ui/button";
import { useDroppable } from "@dnd-kit/react";
import { pointerIntersection } from "@dnd-kit/collision";
import { useSortable } from "@dnd-kit/react/sortable";
import { FolderOpen, FolderPlus, Pencil, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import type { GroupId, VaultGroup, VaultTab } from "@/domain/library/types";
import { categoryColor } from "@/domain/library/categoryColor";
import { HideDurationMenu } from "@/domain/library/components/shared/HideDurationMenu";

/** Interaction handlers for CollectionBoardProps. */
type CollectionBoardActions = {
  onOpen: (group: VaultGroup) => void;
  onShare: (group: VaultGroup) => void;
  onDelete: (group: VaultGroup) => void;
  onEdit: (group: VaultGroup) => void;
  onBrowse: (groupId: GroupId) => void;
  onCreate: () => void;
  onHide: (groupId: GroupId, durationMs: number) => void;
};
/** Search state and handlers for CollectionBoardProps. */
type CollectionBoardSearch = { query: string; matchedTabIds: Set<string> };
type CollectionBoardProps = {
  groups: VaultGroup[];
  tabs: VaultTab[];
  actions: CollectionBoardActions;
  search: CollectionBoardSearch;
};

/**
 * Renders every active tab within its collection and emphasizes current search matches.
 *
 * @param {CollectionBoardProps} props - Collection data and collection-level actions.
 * @returns {JSX.Element} The responsive collection board.
 */
export function CollectionBoard({
  groups,
  tabs,
  actions: { onOpen, onShare, onDelete, onEdit, onBrowse, onCreate, onHide },
  search: { query, matchedTabIds },
}: CollectionBoardProps) {
  return (
    <div
      data-testid="group-board"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {groups.map(group => {
        const groupTabs = tabs.filter(
          tab => tab.placement.groupId === group.id
        );
        return (
          <CollectionCard key={group.id} group={group}>
            <div className="flex items-start gap-3">
              <Button
                variant="ghost"
                onClick={() => onBrowse(group.id)}
                data-testid={`group-browse-${group.id}`}
                className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e95224]"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: categoryColor(group.details.category),
                  }}
                />
                <span className="truncate text-[15px] font-bold tracking-[-0.025em] text-[#26342c]">
                  {group.details.name}
                </span>
              </Button>
              <div
                className="flex shrink-0 items-center gap-0.5"
                aria-label={`${group.details.name} collection actions`}
              >
                <Button
                  variant="ghost"
                  onClick={() => onOpen(group)}
                  className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                  aria-label={`Open all tabs in ${group.details.name}`}
                  title="Open all tabs"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => onShare(group)}
                  className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                  aria-label={`Copy ${group.details.name} as Markdown`}
                  title="Copy as Markdown"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => onEdit(group)}
                  className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                  aria-label={`Edit ${group.details.name}`}
                  title="Edit collection"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => onDelete(group)}
                  className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#c84b26] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                  aria-label={`Delete ${group.details.name}`}
                  title="Delete collection"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="mt-5 flex flex-1 flex-wrap content-start gap-2">
              {groupTabs.map((tab, index) => (
                <SortableCollectionTab
                  key={tab.id}
                  index={index}
                  tab={tab}
                  groupId={group.id}
                  onBrowse={onBrowse}
                  searchActive={Boolean(query.trim())}
                  matched={matchedTabIds.has(tab.id)}
                />
              ))}
              {!groupTabs.length ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#92958d]">
                  Empty collection
                </span>
              ) : null}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-[#e8e3d8] pt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[#858980]">
              <span>{groupTabs.length} tabs</span>
              <span style={{ color: categoryColor(group.details.category) }}>
                {group.details.category}
              </span>
              <HideDurationMenu
                mode="hide"
                target={group.details.name}
                onSelect={duration => onHide(group.id, duration)}
              />
              <Button
                variant="ghost"
                onClick={() => onBrowse(group.id)}
                className="font-semibold text-[#667268] hover:text-[#e95224]"
              >
                Browse →
              </Button>
            </div>
          </CollectionCard>
        );
      })}
      <Button
        variant="ghost"
        onClick={onCreate}
        data-testid="create-collection-card"
        className="flex min-h-[210px] flex-col items-center justify-center border border-dashed border-[#c9c2b5] bg-[#f8f5ed]/60 px-6 text-center transition hover:border-[#e95224] hover:bg-[#fff7f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e95224]"
      >
        <FolderPlus className="h-5 w-5 text-[#e95224]" />
        <span className="mt-4 text-[14px] font-bold tracking-[-0.02em] text-[#3b4a40]">
          Create collection
        </span>
        <span className="mt-1 text-[11px] leading-5 text-[#7c8179]">
          Add a new place for related links.
        </span>
      </Button>
    </div>
  );
}

/**
 * Make a collection card a grid-layout drop target.
 * The card highlights when a dragged tab is over its group.
 * @param {{ group: VaultGroup; children: React.ReactNode; }} props - Group record and card contents to register as a drop target.
 * @returns {React.ReactElement} Card surface with active-drop feedback.
 */
function CollectionCard({
  group,
  children,
}: {
  group: VaultGroup;
  children: React.ReactNode;
}) {
  const { isDropTarget, ref } = useDroppable({
    id: `group-container:${group.id}`,
    data: { groupId: group.id },
    collisionDetector: pointerIntersection,
    // Pointer hits on tabs (3) take priority over this collection background.
    collisionPriority: 2,
  });
  return (
    <article
      ref={ref}
      data-testid={`group-card-${group.id}`}
      data-drop-active={isDropTarget ? "true" : "false"}
      className="group flex min-h-[210px] flex-col border border-[#dcd7cc] bg-[#fffdf8] p-5 shadow-[0_10px_24px_rgba(24,38,31,0.035)] transition hover:border-[#c7c1b4] data-[drop-active=true]:border-[#e95224]"
    >
      {children}
    </article>
  );
}

/**
 * Show one draggable tab favicon within a collection card.
 * Search dims nonmatches while preserving drag and browse actions.
 * @param {{ tab: VaultTab; index: number; groupId: GroupId; onBrowse: (groupId: GroupId) => void; searchActive: boolean; matched: boolean; }} props - Tab, containing group, search match state, and browse handler.
 * @returns {React.ReactElement} Draggable tab favicon button.
 */
function SortableCollectionTab({
  tab,
  index,
  groupId,
  onBrowse,
  searchActive,
  matched,
}: {
  tab: VaultTab;
  index: number;
  groupId: GroupId;
  onBrowse: (groupId: GroupId) => void;
  searchActive: boolean;
  matched: boolean;
}) {
  const { ref, isDragging } = useSortable({
    id: tab.id,
    index,
    group: groupId ?? "unassigned",
  });
  return (
    <Button
      variant="ghost"
      ref={ref}
      type="button"
      onClick={() => onBrowse(groupId)}
      data-testid={`grouped-tab-${tab.id}`}
      data-search-state={searchActive ? (matched ? "match" : "dimmed") : "idle"}
      aria-label={tab.content.title}
      className={`flex h-9 w-9 shrink-0 touch-none items-center justify-center rounded-md border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224] ${
        searchActive
          ? matched
            ? "border-[#e95224] bg-[#fff7f1] shadow-[0_0_0_1px_rgba(233,82,36,0.12)]"
            : "border-transparent bg-[#f8f5ed]/45 opacity-35"
          : "border-transparent bg-[#f8f5ed]/70 hover:border-[#d8d2c5]"
      }`}
      style={{
        opacity: isDragging ? 0 : undefined,
      }}
      title={tab.content.title}
    >
      <CollectionTabIcon tab={tab} />
    </Button>
  );
}

/**
 * Display a tab favicon with a local colored fallback.
 * A failed favicon request switches to the tab initials.
 * @param {{ tab: VaultTab }} props - Saved tab whose URL, color, and initials provide icon sources.
 * @returns {React.ReactElement} Favicon or colored fallback.
 */
export function CollectionTabIcon({ tab }: { tab: VaultTab }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white"
        style={{ backgroundColor: tab.content.color }}
        aria-hidden="true"
      >
        {tab.content.icon.slice(0, 2)}
      </span>
    );
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(tab.content.url)}&sz=64`}
      alt=""
      data-testid={`grouped-tab-icon-${tab.id}`}
      className="h-6 w-6 shrink-0 rounded-md bg-[#ece7dc] object-cover"
      onError={() => setFailed(true)}
    />
  );
}
