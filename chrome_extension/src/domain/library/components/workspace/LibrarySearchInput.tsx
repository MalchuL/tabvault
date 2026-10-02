import type { VaultGroup } from "@/domain/library/types";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Search } from "lucide-react";
import type { KeyboardEvent } from "react";

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
 * The workspace owns query state and keyboard navigation.
 * @param {LibrarySearchInputProps} props - Search values and callbacks owned by the workspace.
 * @returns {React.ReactElement} Search and filter controls.
 */
export function LibrarySearchInput({
  search: { query, activeResultId, onQueryChange, onKeyDown },
  filter: { searchGroupFilter, groups, onGroupFilterChange },
}: LibrarySearchInputProps) {
  return (
    <label className="flex h-10 items-center gap-3 border-b border-[#bcb6a8] bg-[#fffdf8] px-4 transition focus-within:border-[#e95224] focus-within:shadow-[0_8px_24px_rgba(24,38,31,0.04)]">
      <Search className="h-4 w-4 text-[#e95224]" />
      <Input
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
        className="h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-[13px] font-medium shadow-none outline-none placeholder:text-[#a1a39b] focus-visible:ring-0"
      />
      <NativeSelect
        value={searchGroupFilter}
        onChange={event => onGroupFilterChange(event.target.value)}
        aria-label="Filter search by collection"
        className="h-auto max-w-[118px] border-0 bg-transparent px-0 font-mono text-[9px] uppercase tracking-[0.06em] text-[#6f756d] shadow-none outline-none"
      >
        <option value="all">All collections</option>
        {groups.map(group => (
          <option key={group.id} value={group.id}>
            {group.details.name}
          </option>
        ))}
      </NativeSelect>
      {query && (
        <span className="hidden rounded border border-[#ded9cd] px-1.5 py-1 font-mono text-[8px] text-[#858980] 2xl:inline">
          ↑↓ navigate · ↵ open
        </span>
      )}
    </label>
  );
}
