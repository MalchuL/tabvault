import type { VaultGroup } from "@/domain/library/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";
import { TabRowActions } from "@/domain/library/components/tabs/TabRowActions";
import { ReadableArticlePreview } from "@/domain/library/components/tabs/ReadableArticlePreview";
import {
  StandardTabContent,
  TabFavicon,
  ViewedCheckbox,
} from "@/domain/library/components/tabs/TabContentParts";
import { openSavedLink } from "@/domain/library/components/tabs/tabLinkEvents";
import type { TabListItem } from "@/domain/library/components/tabs/TabList";
import type { TabViewMode } from "@/domain/library/types";

/** Presentation settings for TabRowProps. */
type TabRowPresentation = {
  index: number;
  sortableIndex?: number;
  viewMode: TabViewMode;
  previewBackend?: { url: string; apiKey: string };
  sortable?: SortableBindings;
  overlay?: boolean;
};
/** Search state and handlers for TabRowProps. */
type TabRowSearch = {
  query: string;
  score?: number;
  fallbackMode?: "text_fallback" | "semantic";
};
/** Selection state and handlers for TabRowProps. */
type TabRowSelection = {
  selectionEnabled: boolean;
  isSelected: boolean;
  isKeyboardActive: boolean;
  onActiveIndex: (index: number) => void;
  onToggleSelection: (id: string) => void;
};
/** Interaction handlers for TabRowProps. */
type TabRowActions = {
  onMove: (id: string, groupId: string | null) => void;
  onEdit: (tab: TabListItem) => void;
  onOpen: (tab: TabListItem, url?: string) => void;
  onViewedChange: (id: string, viewed: boolean) => void;
  onDelete: (tab: TabListItem) => void;
  onOpenTagManager: () => void;
};
/** Archive and hidden state for TabRowProps. */
type TabRowLifecycle = {
  lifecycleMode: "visible" | "hidden" | "archived";
  onRestore?: (tab: TabListItem) => void;
  onHide?: (tab: TabListItem, durationMs: number) => void;
  onUnhide?: (tab: TabListItem) => void;
  onProlong?: (tab: TabListItem, durationMs: number) => void;
};
type TabRowProps = {
  tab: TabListItem;
  groups: Array<Pick<VaultGroup, "id" | "details">>;
  presentation: TabRowPresentation;
  search: TabRowSearch;
  selection: TabRowSelection;
  actions: TabRowActions;
  lifecycle: TabRowLifecycle;
};

type SortableBindings = Pick<
  ReturnType<typeof useSortable>,
  "ref" | "handleRef" | "isDragging"
>;

/**
 * Ignore interactions on a drag preview.
 *
 * Provide a no-op callback where the preview reuses an interactive tab row.
 * @returns {undefined} No action is taken.
 */
const ignore = () => undefined;

/** Presentation settings for TabDragPreviewProps. */
type TabDragPreviewPresentation = {
  viewMode: TabViewMode;
  previewBackend?: { url: string; apiKey: string };
};
/** Search state and handlers for TabDragPreviewProps. */
type TabDragPreviewSearch = {
  query: string;
  score?: number;
  fallbackMode?: "text_fallback" | "semantic";
};
/** Selection state and handlers for TabDragPreviewProps. */
type TabDragPreviewSelection = {
  selectionEnabled: boolean;
  isSelected: boolean;
};
/** Properties supplied to TabDragPreview. */
type TabDragPreviewProps = {
  tab: TabListItem;
  groups: Array<Pick<VaultGroup, "id" | "details">>;
  presentation: TabDragPreviewPresentation;
  search: TabDragPreviewSearch;
  selection: TabDragPreviewSelection;
};
/**
 * Render the floating preview shown during a tab drag.
 * It reuses the selected view mode without making the preview interactive.
 * @param {TabDragPreviewProps} props - Tab, current view mode, search context, and preview settings.
 * @returns {React.ReactElement} Floating visual drag preview.
 */
export function TabDragPreview({
  tab,
  groups,
  presentation: { viewMode, previewBackend },
  search: { query, score, fallbackMode },
  selection: { selectionEnabled, isSelected },
}: TabDragPreviewProps) {
  return (
    <TabRow
      tab={tab}
      groups={groups}
      presentation={{
        overlay: true,
        index: 0,
        viewMode: viewMode,
        previewBackend: previewBackend,
      }}
      search={{ query: query, score: score, fallbackMode: fallbackMode }}
      selection={{
        selectionEnabled: selectionEnabled,
        isSelected: isSelected,
        isKeyboardActive: false,
        onActiveIndex: ignore,
        onToggleSelection: ignore,
      }}
      actions={{
        onMove: ignore,
        onEdit: ignore,
        onOpen: ignore,
        onViewedChange: ignore,
        onDelete: ignore,
        onOpenTagManager: ignore,
      }}
      lifecycle={{ lifecycleMode: "visible" }}
    />
  );
}

/**
 * Attach sortable drag behavior to one saved-tab row.
 * The presentation remains separate so drag state does not own tab actions.
 * @param {TabRowProps} props - Tab row properties and position within its visible collection.
 * @returns {React.ReactElement} Sortable tab row.
 */
export function SortableTabRow(props: TabRowProps) {
  const sortable = useSortable({
    id: props.tab.id,
    index: props.presentation.sortableIndex ?? 0,
    group: props.tab.placement.groupId ?? "unassigned",
  });
  return (
    <TabRow {...props} presentation={{ ...props.presentation, sortable }} />
  );
}

/**
 * Render one saved tab with search, selection, and lifecycle controls.
 * The view mode chooses the row layout while handlers stay with the parent workspace.
 * @param {TabRowProps} props - Tab, display state, search evidence, and action callbacks.
 * @returns {React.ReactElement} Saved-tab row in the selected view mode.
 */
export function TabRow({
  tab,
  groups,
  presentation: { index, viewMode, previewBackend, sortable, overlay = false },
  search: { query, score, fallbackMode },
  selection: {
    selectionEnabled,
    isSelected,
    isKeyboardActive,
    onActiveIndex,
    onToggleSelection,
  },
  actions: {
    onMove,
    onEdit,
    onOpen,
    onViewedChange,
    onDelete,
    onOpenTagManager,
  },
  lifecycle: { lifecycleMode, onRestore, onHide, onUnhide, onProlong },
}: TabRowProps) {
  const isDragging = sortable?.isDragging ?? false;
  const compact = viewMode === "compact";
  const instantPreview = viewMode === "preview";
  const rowState = overlay
    ? "pointer-events-none cursor-grabbing bg-[#fffdf8] shadow-lg"
    : isDragging
      ? "pointer-events-none cursor-grabbing opacity-0"
      : isSelected
        ? "bg-[#edf2ea] outline outline-1 outline-[#b7cbb4]"
        : isKeyboardActive
          ? "bg-[#fff7f1] outline outline-1 outline-[#eab79d]"
          : "bg-[#f6f3ec]/55 hover:bg-[#fffdf8]";

  return (
    <article
      ref={sortable?.ref}
      id={overlay ? undefined : `search-result-${tab.id}`}
      data-testid={overlay ? "tab-drag-preview" : `tab-row-${tab.id}`}
      data-dragging={isDragging ? "true" : "false"}
      onMouseEnter={() => {
        if (query) onActiveIndex(index);
      }}
      className={`group relative overflow-hidden border-b border-[#dfdbd0] transition-[background-color,box-shadow] duration-150 ${compact ? "flex h-[45px] items-center gap-2.5 px-2 py-2.5" : "flex gap-3 pr-2 sm:px-2 " + (instantPreview ? "py-3" : "h-32 py-3")} ${rowState}`}
    >
      {(query || selectionEnabled) && (
        <label
          className={`${compact ? "" : "mt-1"} flex h-4 w-4 shrink-0 items-center justify-center`}
          onPointerDown={event => event.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelection(tab.id)}
            className="h-3.5 w-3.5 accent-[#e95224]"
            aria-label={`Select ${tab.content.title}`}
          />
        </label>
      )}

      {!compact && !instantPreview && (
        <Button
          variant="ghost"
          size="icon-sm"
          ref={sortable?.handleRef}
          aria-label={`Reorder ${tab.content.title}`}
          className="size-6 mt-0.5 hidden shrink-0 touch-none cursor-grab text-[#c3c3bb] transition hover:text-[#e95224] active:cursor-grabbing sm:block"
        >
          <GripVertical className="h-4 w-4" />
        </Button>
      )}

      {compact ? (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            ref={sortable?.handleRef}
            data-testid={`tab-drag-handle-${tab.id}`}
            aria-label={`Reorder ${tab.content.title}`}
            className="size-6 shrink-0 touch-none cursor-grab p-0.5 text-[#b3b4ac] transition hover:text-[#e95224] active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e95224]"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </Button>
          <TabFavicon tab={tab} size="compact" />
          <a
            href={tab.content.url}
            target="_blank"
            rel="noreferrer"
            onClick={event => openSavedLink(event, tab, onOpen)}
            onAuxClick={event => openSavedLink(event, tab, onOpen)}
            onPointerDown={event => event.stopPropagation()}
            className="min-w-0 truncate text-[12px] font-bold tracking-[-0.015em] text-[#26342c] hover:text-[#e95224] hover:underline"
            title={tab.content.title}
          >
            {tab.content.title}
          </a>
          <ViewedCheckbox
            tab={tab}
            hidden={lifecycleMode === "hidden"}
            onChange={onViewedChange}
          />
          <span
            data-tab-drag-space
            data-testid={`tab-drag-space-${tab.id}`}
            aria-label={`Reorder ${tab.content.title} from empty row space`}
            className="hidden h-6 min-w-5 flex-1 touch-none cursor-grab sm:block"
          />
          <TabRowActions
            tab={tab}
            viewMode={viewMode}
            groups={groups}
            actions={{ onMove: onMove, onEdit: onEdit, onDelete: onDelete }}
            lifecycle={{
              lifecycleMode: lifecycleMode,
              onRestore: onRestore,
              onHide: onHide,
              onUnhide: onUnhide,
              onProlong: onProlong,
            }}
          />
        </>
      ) : instantPreview ? (
        <div className="min-w-0 flex-1">
          <ReadableArticlePreview
            tab={tab}
            backend={previewBackend}
            hidden={lifecycleMode === "hidden"}
            onViewedChange={onViewedChange}
            onOpen={onOpen}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1">
            <Button
              variant="ghost"
              onClick={onOpenTagManager}
              className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#747a72] hover:text-[#e95224]"
            >
              Manage tags
            </Button>
            <div className="flex items-center gap-2">
              {query && score === undefined && (
                <span className="font-mono text-[9px] text-[#be742e]">
                  {fallbackMode === "text_fallback"
                    ? "text match"
                    : "local match"}
                </span>
              )}
              <TabRowActions
                tab={tab}
                viewMode={viewMode}
                groups={groups}
                actions={{ onMove: onMove, onEdit: onEdit, onDelete: onDelete }}
                lifecycle={{
                  lifecycleMode: lifecycleMode,
                  onRestore: onRestore,
                  onHide: onHide,
                  onUnhide: onUnhide,
                  onProlong: onProlong,
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <StandardTabContent
          tab={tab}
          hidden={lifecycleMode === "hidden"}
          search={{ query: query, score: score, fallbackMode: fallbackMode }}
          actions={{
            onOpenTagManager: onOpenTagManager,
            onOpen: onOpen,
            onViewedChange: onViewedChange,
          }}
        />
      )}

      {!compact && !instantPreview && (
        <div className="hidden items-start gap-2 pt-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 sm:flex">
          <TabRowActions
            tab={tab}
            viewMode={viewMode}
            groups={groups}
            actions={{ onMove: onMove, onEdit: onEdit, onDelete: onDelete }}
            lifecycle={{
              lifecycleMode: lifecycleMode,
              onRestore: onRestore,
              onHide: onHide,
              onUnhide: onUnhide,
              onProlong: onProlong,
            }}
          />
        </div>
      )}

      {query && score !== undefined && !compact && (
        <span className="absolute right-3 top-2 rounded bg-[#edf2ea] px-1.5 py-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[#56815d]">
          {Math.round(score * 100)}% relevance
        </span>
      )}
    </article>
  );
}
