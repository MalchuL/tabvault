import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Search, Sparkles } from "lucide-react";
import type { KeyboardEvent } from "react";

/**
 * Show library search, collection filtering, and index state in one input row.
 * The workspace owns query state and keyboard navigation.
 * @param {object} props - Search values and callbacks owned by the workspace.
 * @returns {React.ReactElement} Search and filter controls.
 */
export function LibrarySearchInput({
  query,
  activeResultId,
  searchGroupFilter,
  groups,
  semanticLensTone,
  semanticLensLabel,
  isRemoteSearching,
  onQueryChange,
  onGroupFilterChange,
  onKeyDown,
}: {
  query: string;
  activeResultId?: string;
  searchGroupFilter: string;
  groups: Array<{ id: string; name: string }>;
  semanticLensTone: string;
  semanticLensLabel: string;
  isRemoteSearching: boolean;
  onQueryChange: (query: string) => void;
  onGroupFilterChange: (groupId: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex h-10 items-center gap-3 border-b border-[#bcb6a8] bg-[#fffdf8] px-4 transition focus-within:border-[#e95224] focus-within:shadow-[0_8px_24px_rgba(24,38,31,0.04)]">
      <Search className="h-4 w-4 text-[#e95224]" />
      <Input
        value={query}
        onChange={event => onQueryChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search tabs, notes, and tags…"
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
            {group.name}
          </option>
        ))}
      </NativeSelect>
      <span
        className={`hidden items-center gap-1.5 pl-2 font-mono text-[9px] uppercase tracking-[0.08em] sm:flex ${semanticLensTone}`}
        title="Semantic lens: local matching and meaning-based ranking when the index is ready"
      >
        <Sparkles
          className={`h-3 w-3 ${isRemoteSearching ? "animate-pulse" : ""}`}
        />

        <span>{semanticLensLabel}</span>
      </span>
      {query && (
        <span className="hidden rounded border border-[#ded9cd] px-1.5 py-1 font-mono text-[8px] text-[#858980] 2xl:inline">
          ↑↓ navigate · ↵ open
        </span>
      )}
    </label>
  );
}
