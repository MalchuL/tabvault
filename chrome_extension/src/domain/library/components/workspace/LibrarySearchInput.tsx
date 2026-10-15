import type { VaultGroup } from "@/domain/library/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Search, X } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

/** Search state and handlers for LibrarySearchInputProps. */
type LibrarySearchInputSearch = {
  query: string;
  activeResultId?: string;
  onQueryChange: (query: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};
/** Collection filtering state for LibrarySearchInputProps. */
type LibrarySearchInputFilter = {
  searchGroupFilter: string;
  groups: Array<Pick<VaultGroup, "id" | "details">>;
  onGroupFilterChange: (groupId: string) => void;
};
/** Properties supplied to LibrarySearchInput. */
type LibrarySearchInputProps = {
  search: LibrarySearchInputSearch;
  filter: LibrarySearchInputFilter;
};
/**
 * Show library search, collection filtering, and index state in one input row.
 * The workspace owns query state and keyboard navigation. Clearing the query
 * returns focus to the input so the user can immediately start another search.
 * @param {LibrarySearchInputProps} props - Search values and callbacks owned by the workspace.
 * @returns {React.ReactElement} Search and filter controls.
 */
export function LibrarySearchInput({
  search: { query, activeResultId, onQueryChange, onKeyDown },
  filter: { searchGroupFilter, groups, onGroupFilterChange },
}: LibrarySearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 py-2 sm:flex-nowrap border-b border-[#bcb6a8] bg-[#fffdf8] px-4 transition focus-within:border-[#e95224] focus-within:shadow-[0_8px_24px_rgba(24,38,31,0.04)]">
      <Search className="h-4 w-4 shrink-0 text-[#c1431b]" />
      <Input
        ref={inputRef}
        value={query}
        onChange={event => onQueryChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search tabs, tags, and properties…"
        aria-label="Search your TabVault library"
        aria-activedescendant={
          query && activeResultId
            ? `search-result-${activeResultId}`
            : undefined
        }
        className="h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-[15px] font-medium shadow-none outline-none placeholder:text-[#626a60] focus-visible:ring-0"
      />
      <NativeSelect
        value={searchGroupFilter}
        onChange={event => onGroupFilterChange(event.target.value)}
        aria-label="Filter search by collection"
        className="order-last h-9 w-full border-0 border-t bg-transparent px-0 text-sm text-[#596353] shadow-none outline-none sm:order-none sm:h-auto sm:w-auto sm:max-w-[200px] sm:border-t-0"
      >
        <option value="all">All collections</option>
        <option value="unassigned">[Unassigned]</option>
        {groups.map(group => (
          <option key={group.id} value={group.id}>
            {group.details.name}
          </option>
        ))}
      </NativeSelect>
      {query && (
        <span className="hidden rounded border border-[#ded9cd] px-1.5 py-1 text-xs text-[#626a60] 2xl:inline">
          ↑↓ navigate · ↵ open
        </span>
      )}
      {query && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear search"
          title="Clear search"
          className="text-[#6f756d] hover:text-[#e95224]"
          onClick={() => {
            onQueryChange("");
            inputRef.current?.focus();
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
