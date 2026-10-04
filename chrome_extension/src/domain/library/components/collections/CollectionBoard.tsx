import { Button } from "@/components/ui/button";
import { useDragOperation, useDroppable } from "@dnd-kit/react";
import { pointerIntersection } from "@dnd-kit/collision";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { FolderOpen, FolderPlus, Pencil, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import type { GroupId, VaultGroup, VaultTab } from "@/domain/library/types";
import { groupColorBackground } from "@/domain/library/collectionColor";
import { CollectionColorPicker } from "./CollectionColorPicker";
import { CollectionCategoryToggle } from "./CollectionCategoryToggle";
import { CollectionNameEditor } from "./CollectionNameEditor";
import { HideDurationMenu } from "@/domain/library/components/shared/HideDurationMenu";

/** Interaction handlers for CollectionBoardProps. */
type CollectionBoardActions = {
  onOpen: { group: (id: GroupId) => void; tab: (tab: VaultTab) => void };
  onShare: (id: GroupId) => void;
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
  onColorChange: (id: string, color: string | undefined) => void;
  onCategoryToggle: (id: string) => void;
  onRename: (id: string, name: string) => void;
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
  onColorChange,
  onCategoryToggle,
  onRename,
}: CollectionBoardProps) {
  return (
    <div
      data-testid="group-board"
      className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3"
    >
      {(tabs.some(tab => tab.placement.groupId === null)
        ? [null, ...groups]
        : groups
      ).map(group => {
        const id = group?.id ?? "unassigned";
        const name = group?.details.name ?? "[Unassigned]";
        const groupTabs = tabs.filter(
          tab => tab.placement.groupId === (group?.id ?? null)
        );
        return (
          <CollectionCard key={id} group={group}>
            <header
              className="grid grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-2 px-3 py-2"
              style={{
                backgroundColor: groupColorBackground(
                  group?.details.accent,
                  18
                ),
              }}
            >
              {group ? (
                <CollectionColorPicker
                  name={name}
                  color={group.details.accent}
                  onChange={color => onColorChange(group.id, color)}
                />
              ) : (
                <span
                  className="flex size-8 items-center justify-center"
                  aria-hidden="true"
                >
                  <FolderOpen className="size-4" />
                </span>
              )}
              <CollectionNameEditor
                name={name}
                onRename={group ? name => onRename(group.id, name) : undefined}
                className="text-[15px] font-bold leading-5 text-[#26342c]"
              />
              {group ? (
                <CollectionCategoryToggle
                  name={name}
                  category={group.details.category}
                  onToggle={() => onCategoryToggle(group.id)}
                />
              ) : (
                <span aria-hidden="true" />
              )}
            </header>
            <div className="flex min-h-14 flex-wrap content-start items-center gap-2 px-3 py-2">
              {groupTabs.map((tab, index) => (
                <SortableCollectionTab
                  key={tab.id}
                  index={index}
                  tab={tab}
                  groupId={id}
                  onOpen={onOpen.tab}
                  searchActive={Boolean(query.trim())}
                  matched={matchedTabIds.has(tab.id)}
                />
              ))}
              {!groupTabs.length ? (
                <span className="text-sm text-[#626a60]">Empty collection</span>
              ) : null}
            </div>
            <div className="flex items-center gap-1 border-t border-[#e8e3d8] px-3 py-2 text-xs text-[#626a60]">
              <span>{groupTabs.length} tabs</span>
              <div
                className="ml-auto flex shrink-0 items-center gap-0.5"
                aria-label={`${name} collection actions`}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onOpen.group(id)}
                  className="rounded p-1 text-[#626a60] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                  aria-label={`Open all tabs in ${name}`}
                  title="Open all tabs"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onShare(id)}
                  className="rounded p-1 text-[#626a60] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                  aria-label={`Copy ${name} as Markdown`}
                  title="Copy as Markdown"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </Button>
                {group && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(group)}
                      className="rounded p-1 text-[#626a60] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                      aria-label={`Edit ${group.details.name}`}
                      title="Edit collection"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDelete(group)}
                      className="rounded p-1 text-[#626a60] hover:bg-[#fff0ea] hover:text-[#c84b26] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                      aria-label={`Delete ${group.details.name}`}
                      title="Delete collection"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <HideDurationMenu
                  mode="hide"
                  target={name}
                  onSelect={duration => onHide(id, duration)}
                />
              </div>

              <Button
                variant="ghost"
                onClick={() => onBrowse(id)}
                className="h-8 px-1 text-xs font-semibold text-[#596353] hover:text-[#c1431b]"
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
        className="flex h-auto min-h-20 items-center justify-center gap-3 self-start whitespace-normal border border-dashed border-[#c9c2b5] bg-[#f8f5ed]/60 p-4 text-center transition hover:border-[#e95224] hover:bg-[#fff7f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e95224]"
      >
        <FolderPlus className="h-5 w-5 text-[#e95224]" />
        <span className="text-sm font-semibold text-[#3b4a40]">
          Create collection
        </span>
      </Button>
    </div>
  );
}

/**
 * Make a collection card a grid-layout drop target.
 * The card highlights when a dragged tab is over its group.
 * @param {{ group: VaultGroup | null; children: React.ReactNode; }} props - Persisted group, or null for virtual Unassigned, and card contents.
 * @returns {React.ReactElement} Card surface with active-drop feedback.
 */
function CollectionCard({
  group,
  children,
}: {
  group: VaultGroup | null;
  children: React.ReactNode;
}) {
  const id = group?.id ?? "unassigned";
  const { isDropTarget, ref } = useDroppable({
    id: `group-container:${id}`,
    data: { groupId: id },
    collisionDetector: pointerIntersection,
    // Pointer hits on tabs (3) take priority over this collection background.
    collisionPriority: 2,
  });
  const { target } = useDragOperation();
  const active =
    isDropTarget || (target && isSortable(target) && target.group === id);
  return (
    <article
      ref={ref}
      data-testid={`group-card-${id}`}
      data-drop-active={active ? "true" : "false"}
      style={{
        backgroundColor: groupColorBackground(group?.details.accent, 8),
      }}
      className="group flex min-w-0 flex-col border border-[#dcd7cc] bg-[#fffdf8] shadow-[0_10px_24px_rgba(24,38,31,0.035)] transition hover:border-[#c7c1b4] data-[drop-active=true]:border-[#e95224]"
    >
      {children}
    </article>
  );
}

/**
 * Show one draggable tab favicon within a collection card.
 * Search dims nonmatches while preserving drag and link-opening actions.
 * @param {{ tab: VaultTab; index: number; groupId: GroupId; onOpen: (tab: VaultTab) => void; searchActive: boolean; matched: boolean; }} props - Tab, containing group, search match state, and link-opening handler.
 * @returns {React.ReactElement} Draggable tab favicon button.
 */
function SortableCollectionTab({
  tab,
  index,
  groupId,
  onOpen,
  searchActive,
  matched,
}: {
  tab: VaultTab;
  index: number;
  groupId: GroupId;
  onOpen: (tab: VaultTab) => void;
  searchActive: boolean;
  matched: boolean;
}) {
  const { ref, isDragging } = useSortable({
    id: tab.id,
    index,
    collisionDetector: pointerIntersection,
    collisionPriority: 3,
    group: groupId ?? "unassigned",
  });
  return (
    <Button
      variant="ghost"
      size="icon"
      ref={ref}
      type="button"
      onClick={() => onOpen(tab)}
      data-testid={`grouped-tab-${tab.id}`}
      data-tab-id={tab.id}
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
