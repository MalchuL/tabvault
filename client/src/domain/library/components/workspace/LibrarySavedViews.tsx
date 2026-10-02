import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContextHelp } from "@/components/shared/ContextHelp";
import { Trash2 } from "lucide-react";
import type { SavedSearch, VaultGroup } from "@/domain/library/types";

/** Saved view picker state for LibrarySavedViewsProps. */
type LibrarySavedViewsPicker = {
  showSavedSearches: boolean;
  onToggleSavedSearches: () => void;
};
/** Editable draft state for LibrarySavedViewsProps. */
type LibrarySavedViewsDraft = {
  savedSearchName: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
};
/** Saved view records and handlers for LibrarySavedViewsProps. */
type LibrarySavedViewsViews = {
  savedSearches: SavedSearch[];
  groups: VaultGroup[];
  onApply: (view: SavedSearch) => void;
  onDelete: (id: string) => void;
};
/** Undo state and handlers for LibrarySavedViewsProps. */
type LibrarySavedViewsUndo = {
  undoLabel: string | undefined;
  onUndo: () => void;
};
type LibrarySavedViewsProps = {
  query: string;
  picker: LibrarySavedViewsPicker;
  draft: LibrarySavedViewsDraft;
  views: LibrarySavedViewsViews;
  undo: LibrarySavedViewsUndo;
};

/**
 * Show saved searches and the available bulk-action undo notice.
 * The workspace retains the name draft and picker state when the query is cleared.
 * Saving, applying, deleting, and undoing are delegated to its callbacks.
 * @param {LibrarySavedViewsProps} props - Display values and callbacks supplied by the owner.
 * @returns {React.ReactElement} Saved-view controls and an optional undo notice.
 */
export function LibrarySavedViews({
  query,
  picker: { showSavedSearches, onToggleSavedSearches },
  draft: { savedSearchName, onNameChange, onSave },
  views: { savedSearches, groups, onApply, onDelete },
  undo: { undoLabel, onUndo },
}: LibrarySavedViewsProps) {
  return (
    <>
      {query && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#dfdbd0] bg-[#fffdf8] px-3 py-2">
          <Button
            variant="ghost"
            onClick={onToggleSavedSearches}
            className="rounded border border-[#d9d3c6] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[#617066] hover:border-[#e95224] hover:text-[#e95224]"
          >
            Views {savedSearches.length ? `· ${savedSearches.length}` : ""}
          </Button>
          <ContextHelp title="Saved views" side="bottom" align="start">
            A saved view remembers this search phrase and shelf filter. It does
            not duplicate or move your tabs.
          </ContextHelp>
          {undoLabel && (
            <div className="flex items-center gap-2 rounded border border-[#b7cbb4] bg-[#edf2ea] px-2 py-1.5 text-[10px] text-[#48644d]">
              <span>Undo {undoLabel}</span>
              <Button
                variant="ghost"
                onClick={onUndo}
                className="font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[#2f773c] hover:underline"
              >
                Undo
              </Button>
            </div>
          )}
        </div>
      )}
      {query && showSavedSearches && (
        <div className="border-b border-[#dfdbd0] bg-[#f9f7f1] p-3">
          <div className="flex gap-2">
            <Input
              value={savedSearchName}
              onChange={event => onNameChange(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") onSave();
              }}
              placeholder={query}
              className="h-auto min-w-0 flex-1 rounded-none border-x-0 border-t-0 border-b border-[#bcb6a8] bg-transparent px-1 py-1.5 text-[11px] shadow-none outline-none focus:border-[#e95224]"
            />
            <Button
              variant="ghost"
              onClick={onSave}
              className="rounded bg-[#e95224] px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-white hover:bg-[#d94a1e]"
            >
              Save view
            </Button>
          </div>
          {savedSearches.length > 0 && (
            <div className="mt-3 space-y-1">
              {savedSearches.map(view => (
                <div
                  key={view.id}
                  className="flex items-center gap-2 rounded bg-[#fffdf8] px-2 py-1.5"
                >
                  <Button
                    variant="ghost"
                    onClick={() => onApply(view)}
                    className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold text-[#425047] hover:text-[#e95224]"
                  >
                    {view.name}
                    <span className="ml-2 font-mono text-[8px] font-normal uppercase text-[#969991]">
                      {view.groupId === "all"
                        ? "all shelves"
                        : (groups.find(group => group.id === view.groupId)
                            ?.details.name ?? "collection")}
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => onDelete(view.id)}
                    className="rounded p-1 text-[#989990] hover:bg-[#fff0ea] hover:text-[#c84725]"
                    aria-label={`Delete ${view.name} saved search`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
