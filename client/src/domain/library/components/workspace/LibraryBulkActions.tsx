import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/shared/IconButton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { FolderInput, Trash2 } from "lucide-react";

/**
 * Show selection-wide move, tag, and archive controls.
 * The workspace owns the selected IDs and performs every mutation.
 * @param {object} props - Selection counts, destinations, and owner callbacks.
 * @returns {React.ReactElement | null} Bulk toolbar when selection is active.
 */
export function LibraryBulkActions({
  selectionActive,
  selectedCount,
  visibleCount,
  groups,
  bulkTag,
  isArchivePage,
  onToggleSelectAll,
  onMoveSelected,
  onBulkTagChange,
  onTagSelected,
  onRemoveSelected,
}: {
  selectionActive: boolean;
  selectedCount: number;
  visibleCount: number;
  groups: Array<{ id: string; name: string; category: string }>;
  bulkTag: string;
  isArchivePage: boolean;
  onToggleSelectAll: () => void;
  onMoveSelected: (groupId: string) => void;
  onBulkTagChange: (tag: string) => void;
  onTagSelected: () => void;
  onRemoveSelected: () => void;
}) {
  if (!selectionActive) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[#dfdbd0] bg-[#f9f7f1] px-3 py-2.5">
      <Button
        variant="ghost"
        onClick={onToggleSelectAll}
        className="rounded border border-[#d9d3c6] bg-[#fffdf8] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[#617066] hover:border-[#e95224] hover:text-[#e95224]"
      >
        {selectedCount === visibleCount && visibleCount
          ? "Clear"
          : "Select all"}
      </Button>
      <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#7b8078]">
        {selectedCount} marked
      </span>
      {selectedCount > 0 && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Move selected tabs to collection">
                <FolderInput />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {groups
                .filter(group => group.category === "manual")
                .map(group => (
                  <DropdownMenuItem
                    key={group.id}
                    onSelect={() => void onMoveSelected(group.id)}
                  >
                    {group.name}
                  </DropdownMenuItem>
                ))}
              {!groups.some(group => group.category === "manual") && (
                <DropdownMenuItem disabled>
                  No collections available
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex overflow-hidden rounded border border-[#d9d3c6] bg-[#fffdf8]">
            <Input
              value={bulkTag}
              onChange={event => onBulkTagChange(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") void onTagSelected();
              }}
              placeholder="Add tag"
              className="h-auto w-20 rounded-none border-0 bg-transparent px-2 py-1.5 text-[10px] shadow-none outline-none placeholder:text-[#aaa9a1] focus-visible:ring-0"
            />
            <Button
              variant="ghost"
              onClick={() => void onTagSelected()}
              className="border-l border-[#d9d3c6] px-2 font-mono text-[9px] uppercase tracking-[0.06em] text-[#617066] hover:bg-[#fff0ea] hover:text-[#e95224]"
            >
              Tag
            </Button>
          </div>
          <IconButton
            label={
              isArchivePage
                ? "Permanently delete selected tabs"
                : "Archive selected tabs"
            }
            onClick={onRemoveSelected}
            className="text-[#bd4a29] hover:bg-[#fff0ea] hover:text-[#bd4a29]"
          >
            <Trash2 />
          </IconButton>
        </>
      )}
    </div>
  );
}
