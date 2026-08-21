import { FolderOpen, FolderPlus, Share2, Trash2 } from "lucide-react";
import type { GroupId, VaultGroup, VaultTab } from "../types";

type CollectionBoardProps = {
  groups: VaultGroup[];
  tabs: VaultTab[];
  onOpen: (group: VaultGroup) => void;
  onShare: (group: VaultGroup) => void;
  onDelete: (group: VaultGroup) => void;
  onBrowse: (groupId: GroupId) => void;
  onCreate: () => void;
};

export function CollectionBoard({
  groups,
  tabs,
  onOpen,
  onShare,
  onDelete,
  onBrowse,
  onCreate,
}: CollectionBoardProps) {
  const collectionIds = (groupId: GroupId) => {
    const ids = new Set<GroupId>([groupId]);
    let changed = true;
    while (changed) {
      changed = false;
      groups.forEach(group => {
        if (group.parent && ids.has(group.parent) && !ids.has(group.id)) {
          ids.add(group.id);
          changed = true;
        }
      });
    }
    return ids;
  };
  const collections = groups.filter(group => !group.parent);

  return (
    <div
      data-testid="group-board"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {collections.map(group => {
        const groupTabs = tabs.filter(tab =>
          collectionIds(group.id).has(tab.groupId)
        );
        return (
          <article
            key={group.id}
            data-testid={`group-card-${group.id}`}
            className="group flex min-h-[210px] flex-col border border-[#dcd7cc] bg-[#fffdf8] p-5 shadow-[0_10px_24px_rgba(24,38,31,0.035)] transition hover:-translate-y-0.5 hover:border-[#c7c1b4]"
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => onBrowse(group.id)}
                data-testid={`group-browse-${group.id}`}
                className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e95224]"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: group.accent }}
                />
                <span className="truncate text-[15px] font-bold tracking-[-0.025em] text-[#26342c]">
                  {group.name}
                </span>
              </button>
              <div
                className="flex shrink-0 items-center gap-0.5"
                aria-label={`${group.name} collection actions`}
              >
                <button
                  onClick={() => onOpen(group)}
                  className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                  aria-label={`Open all tabs in ${group.name}`}
                  title="Open all tabs"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onShare(group)}
                  className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                  aria-label={`Copy ${group.name} as Markdown`}
                  title="Copy as Markdown"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDelete(group)}
                  disabled={group.id === "inbox"}
                  className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#c84b26] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224] disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label={
                    group.id === "inbox"
                      ? "Inbox cannot be deleted"
                      : `Delete ${group.name}`
                  }
                  title={
                    group.id === "inbox"
                      ? "Inbox is protected"
                      : "Delete collection"
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <button
              onClick={() => onBrowse(group.id)}
              className="mt-6 flex flex-1 items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e95224]"
              aria-label={`Browse ${group.name}`}
            >
              {groupTabs.slice(0, 4).map(tab => (
                <span
                  key={tab.id}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e2ddd2] bg-[#f8f5ed] text-[11px] font-bold text-[#536259]"
                  title={tab.title}
                >
                  {tab.icon.slice(0, 2)}
                </span>
              ))}
              {groupTabs.length > 4 ? (
                <span className="flex h-9 min-w-9 items-center justify-center rounded-md border border-[#e2ddd2] bg-[#f8f5ed] px-2 font-mono text-[10px] text-[#667268]">
                  +{groupTabs.length - 4}
                </span>
              ) : null}
              {!groupTabs.length ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#92958d]">
                  Empty collection
                </span>
              ) : null}
            </button>
            <div className="mt-5 flex items-center justify-between border-t border-[#e8e3d8] pt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[#858980]">
              <span>{groupTabs.length} tabs</span>
              <button
                onClick={() => onBrowse(group.id)}
                className="font-semibold text-[#667268] hover:text-[#e95224]"
              >
                Browse →
              </button>
            </div>
          </article>
        );
      })}
      <button
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
      </button>
    </div>
  );
}
