import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/shared/IconButton";
import { ContextHelp } from "@/components/shared/ContextHelp";
import {
  Boxes,
  SlidersHorizontal,
  ChevronRight,
  LayoutList,
  Rows3,
  Search,
} from "lucide-react";
import type { LibraryViewMode } from "@/domain/library/types";

const logoUrl = "/icon-128.png";

/**
 * Display the TabVault icon at a caller-selected size.
 * The image retains its product alt text for screen readers.
 * @param {{ className?: string }} props - Optional CSS classes controlling the icon size.
 * @returns {React.ReactElement} Branded image.
 */
function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="TabVault"
      className={`${className} object-contain`}
    />
  );
}

type LibraryHeaderProps = {
  title: string;
  libraryStorageLabel: string;
  onOpenDashboard: () => void;
};

/**
 * Show the library page title and storage status link.
 * Opening Dashboard is delegated to the workspace navigation callback.
 * @param {LibraryHeaderProps} props - Display values and callbacks supplied by the owner.
 * @returns {React.ReactElement} Page title and storage status link.
 */
export function LibraryHeader({
  title,
  libraryStorageLabel,
  onOpenDashboard,
}: LibraryHeaderProps) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3">
      <div className="max-w-2xl">
        <h1 className="font-['DM_Sans'] text-2xl font-bold tracking-[-0.04em] text-[#18261f]">
          {title}
        </h1>
      </div>
      <Button
        variant="ghost"
        onClick={onOpenDashboard}
        className="inline-flex shrink-0 items-center gap-2 rounded px-2 py-2 text-left font-mono text-[9px] uppercase tracking-[0.09em] text-[#6d746b] transition hover:text-[#e95224] active:scale-[0.98]"
        title="Open dashboard"
      >
        <BrandMark className="h-3.5 w-3.5 shrink-0" />
        {libraryStorageLabel}
        <ChevronRight className="h-3 w-3" />
      </Button>
    </section>
  );
}

/** Search state and handlers for LibraryResultSummaryProps. */
type LibraryResultSummarySearch = {
  query: string;
  visibleCount: number;
  searchStatusCopy: string;
};
/** Workspace page state for LibraryResultSummaryProps. */
type LibraryResultSummaryPage = {
  isAllTabsPage: boolean;
};
/** Duplicate cleanup state for LibraryResultSummaryProps. */
type LibraryResultSummaryCleanup = {
  isQuickCleaning: boolean;
  onQuickClean: () => void;
  onAdvancedDedupe: () => void;
};
type LibraryResultSummaryProps = {
  search: LibraryResultSummarySearch;
  page: LibraryResultSummaryPage;
  cleanup: LibraryResultSummaryCleanup;
};

/**
 * Show result counts and duplicate-cleanup actions.
 * @param {LibraryResultSummaryProps} props - Display values and callbacks supplied by the owner.
 * @returns {React.ReactElement} Result count and available workspace actions.
 */
export function LibraryResultSummary({
  search: { query, visibleCount, searchStatusCopy },
  page: { isAllTabsPage },
  cleanup: { isQuickCleaning, onQuickClean, onAdvancedDedupe },
}: LibraryResultSummaryProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <h2 className="font-['DM_Sans'] text-sm font-semibold tracking-[-0.02em]">
            {query ? `${visibleCount} matches` : `${visibleCount} tabs`}
          </h2>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {query && (
          <p className="hidden max-w-[250px] text-right text-[11px] leading-5 text-[#80847d] md:block">
            {searchStatusCopy}
          </p>
        )}
        {!query && isAllTabsPage && (
          <>
            <Button
              variant="ghost"
              onClick={onQuickClean}
              disabled={isQuickCleaning}
              className="rounded border border-[#d9d3c6] bg-[#fffdf8] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[#687067] hover:border-[#e95224] hover:text-[#e95224] disabled:opacity-50"
            >
              {isQuickCleaning ? "Cleaning…" : "Quick clean"}
            </Button>
            <IconButton
              label="Advanced deduplication"
              onClick={onAdvancedDedupe}
            >
              <SlidersHorizontal />
            </IconButton>
          </>
        )}
      </div>
    </div>
  );
}

type LibraryViewControlsProps = {
  tabView: LibraryViewMode;
  onViewChange: (view: LibraryViewMode) => void;
};

/**
 * Show library display modes and reordering guidance.
 * @param {LibraryViewControlsProps} props - Display values and callbacks supplied by the owner.
 * @returns {React.ReactElement} View-mode buttons and reordering help.
 */
export function LibraryViewControls({
  tabView,
  onViewChange,
}: LibraryViewControlsProps) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#838980]">
        <ContextHelp
          title="Tab views and reordering"
          side="bottom"
          align="start"
        >
          Standard shows details, Compact shows only a favicon and title, and
          Group board summarizes collections. Drag a row by its handle to change
          its order within that collection.
        </ContextHelp>
      </p>
      <div
        className="flex overflow-hidden rounded-md border border-[#d9d3c6] bg-[#fffdf8]"
        role="group"
        aria-label="Tab view mode"
      >
        <IconButton
          onClick={() => onViewChange("groups")}
          className={`p-2 ${tabView === "groups" ? "bg-[#edf2ea] text-[#36533a]" : "text-[#858980] hover:bg-[#f7f4ed]"}`}
          label="Collection-group board view"
          aria-pressed={tabView === "groups"}
        >
          <Boxes className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          onClick={() => onViewChange("standard")}
          className={`border-l border-[#d9d3c6] p-2 ${tabView === "standard" ? "bg-[#edf2ea] text-[#36533a]" : "text-[#858980] hover:bg-[#f7f4ed]"}`}
          label="Standard tab view"
          aria-pressed={tabView === "standard"}
        >
          <LayoutList className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          onClick={() => onViewChange("compact")}
          className={`border-l border-[#d9d3c6] p-2 ${tabView === "compact" ? "bg-[#edf2ea] text-[#36533a]" : "text-[#858980] hover:bg-[#f7f4ed]"}`}
          label="Compact tab view"
          aria-pressed={tabView === "compact"}
        >
          <Rows3 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

type LibraryEmptyStateProps = {
  query: string;
  isArchivePage: boolean;
  isHiddenPage: boolean;
  workspaceLabel: string;
};

/**
 * Describe empty archive, hidden, or search-result views.
 * Lifecycle pages explain their contents; a search with no matches offers search guidance.
 * @param {LibraryEmptyStateProps} props - Query and lifecycle page used to choose the message.
 * @returns {React.ReactElement} Empty-state message for the current page and query.
 */
export function LibraryEmptyState({
  query,
  isArchivePage,
  isHiddenPage,
  workspaceLabel,
}: LibraryEmptyStateProps) {
  return (
    <div className="border-t border-[#dcd7cc] bg-[#fffdf8] px-5 py-12 text-center">
      <Search className="mx-auto h-5 w-5 text-[#e95224]" />
      <p className="mt-3 text-[13px] font-bold">
        {(isArchivePage || isHiddenPage) && !query
          ? `${workspaceLabel} is empty.`
          : "No links matched that query."}
      </p>
      <p className="mt-1 text-[11px] text-[#7b8078]">
        {isArchivePage && !query
          ? "Archived links remain recoverable here until you permanently delete them."
          : isHiddenPage && !query
            ? "Tabs with future hide deadlines appear here."
            : "Try a topic, note, or tag. Search includes custom-property values."}
      </p>
    </div>
  );
}
