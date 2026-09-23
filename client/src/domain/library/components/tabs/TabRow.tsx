import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, GripVertical, MoreHorizontal, Trash2 } from "lucide-react";
import { HideDurationMenu } from "@/domain/library/components/shared/HideDurationMenu";
import { ReadableArticlePreview } from "@/domain/library/components/tabs/ReadableArticlePreview";
import {
  StandardTabContent,
  TabFavicon,
  ViewedCheckbox,
} from "@/domain/library/components/tabs/TabContentParts";
import { openSavedLink } from "@/domain/library/components/tabs/tabLinkEvents";
import type { TabListItem } from "@/domain/library/components/tabs/TabList";
import type { TabViewMode } from "@/domain/library/types";

type TabRowProps = {
  tab: TabListItem;
  index: number;
  viewMode: TabViewMode;
  query: string;
  selectionEnabled: boolean;
  isSelected: boolean;
  isKeyboardActive: boolean;
  score?: number;
  fallbackMode?: "text_fallback" | "semantic";
  onActiveIndex: (index: number) => void;
  onToggleSelection: (id: string) => void;
  onMove: (id: string, groupId: string | null) => void;
  onEdit: (tab: TabListItem) => void;
  onOpen: (tab: TabListItem, url?: string) => void;
  onViewedChange: (id: string, viewed: boolean) => void;
  onDelete: (tab: TabListItem) => void;
  lifecycleMode: "visible" | "hidden" | "archived";
  onRestore?: (tab: TabListItem) => void;
  onHide?: (tab: TabListItem, durationMs: number) => void;
  onUnhide?: (tab: TabListItem) => void;
  onProlong?: (tab: TabListItem, durationMs: number) => void;
  onOpenTagManager: () => void;
  groups: Array<{ id: string; name: string; category?: string }>;
  previewBackend?: { url: string; apiKey: string };
};

type SortableBindings = Pick<
  ReturnType<typeof useSortable>,
  | "attributes"
  | "listeners"
  | "setNodeRef"
  | "transform"
  | "transition"
  | "isDragging"
>;

/**
 * Ignore interactions on a drag preview.
 *
 * Provide a no-op callback where the preview reuses an interactive tab row.
 * @returns {undefined} No action is taken.
 */
const ignore = () => undefined;

/**
 * Render the floating preview shown during a tab drag.
 * It reuses the selected view mode without making the preview interactive.
 * @param {{ tab: TabListItem; viewMode: TabViewMode; query: string; selectionEnabled: boolean; isSelected: boolean; score?: number; fallbackMode?: "text_fallback" | "semantic"; groups: Array<{ id: string; name: string; category?: string }>; previewBackend?: { url: string; apiKey: string }; }} props - Tab, current view mode, search context, and preview settings.
 * @returns {React.ReactElement} Floating visual drag preview.
 */
export function TabDragPreview({
  tab,
  viewMode,
  query,
  selectionEnabled,
  isSelected,
  score,
  fallbackMode,
  groups,
  previewBackend,
}: {
  tab: TabListItem;
  viewMode: TabViewMode;
  query: string;
  selectionEnabled: boolean;
  isSelected: boolean;
  score?: number;
  fallbackMode?: "text_fallback" | "semantic";
  groups: Array<{ id: string; name: string; category?: string }>;
  previewBackend?: { url: string; apiKey: string };
}) {
  return (
    <TabRowPresentation
      tab={tab}
      index={0}
      viewMode={viewMode}
      query={query}
      selectionEnabled={selectionEnabled}
      isSelected={isSelected}
      isKeyboardActive={false}
      score={score}
      fallbackMode={fallbackMode}
      onActiveIndex={ignore}
      onToggleSelection={ignore}
      onMove={ignore}
      onEdit={ignore}
      onOpen={ignore}
      onViewedChange={ignore}
      onDelete={ignore}
      lifecycleMode="visible"
      onOpenTagManager={ignore}
      groups={groups}
      previewBackend={previewBackend}
      overlay
    />
  );
}

/**
 * Attach sortable drag behavior to one saved-tab row.
 * The presentation remains separate so drag state does not own tab actions.
 * @param {TabRowProps} props - Tab row properties passed to the sortable wrapper.
 * @returns {React.ReactElement} Sortable tab row.
 */
export function SortableTabRow(props: TabRowProps) {
  const sortable = useSortable({
    id: props.tab.id,
    disabled: props.viewMode === "preview",
  });
  return <TabRowPresentation {...props} sortable={sortable} />;
}

/**
 * Render one saved tab with search, selection, and lifecycle controls.
 * The view mode chooses the row layout while handlers stay with the parent workspace.
 * @param {TabRowProps & { sortable?: SortableBindings; overlay?: boolean }} props - Tab, display state, search evidence, and action callbacks.
 * @returns {React.ReactElement} Saved-tab row in the selected view mode.
 */
function TabRowPresentation({
  tab,
  index,
  viewMode,
  query,
  selectionEnabled,
  isSelected,
  isKeyboardActive,
  score,
  fallbackMode,
  onActiveIndex,
  onToggleSelection,
  onMove,
  onEdit,
  onOpen,
  onViewedChange,
  onDelete,
  lifecycleMode,
  onRestore,
  onHide,
  onUnhide,
  onProlong,
  onOpenTagManager,
  groups,
  previewBackend,
  sortable,
  overlay = false,
}: TabRowProps & { sortable?: SortableBindings; overlay?: boolean }) {
  const attributes = sortable?.attributes;
  const listeners = sortable?.listeners;
  const setNodeRef = sortable?.setNodeRef;
  const transform = sortable?.transform;
  const transition = sortable?.transition;
  const isDragging = sortable?.isDragging ?? false;
  const compact = viewMode === "compact";
  const instantPreview = viewMode === "preview";
  const style = {
    transform: CSS.Transform.toString(transform ?? null),
    transition,
  };
  const rowState = overlay
    ? "pointer-events-none cursor-grabbing bg-[#fffdf8] shadow-lg"
    : isDragging
      ? "pointer-events-none cursor-grabbing opacity-0"
      : isSelected
        ? "bg-[#edf2ea] outline outline-1 outline-[#b7cbb4]"
        : isKeyboardActive
          ? "bg-[#fff7f1] outline outline-1 outline-[#eab79d]"
          : "bg-[#f6f3ec]/55 hover:bg-[#fffdf8]";
  const destructiveAction =
    lifecycleMode === "archived" ? "Permanently delete" : "Archive";

  return (
    <article
      ref={setNodeRef}
      style={style}
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
            aria-label={`Select ${tab.title}`}
          />
        </label>
      )}

      {!compact && !instantPreview && (
        <Button
          variant="ghost"
          size="icon-sm"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${tab.title}`}
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
            {...attributes}
            {...listeners}
            data-testid={`tab-drag-handle-${tab.id}`}
            aria-label={`Reorder ${tab.title}`}
            className="size-6 shrink-0 touch-none cursor-grab p-0.5 text-[#b3b4ac] transition hover:text-[#e95224] active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e95224]"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </Button>
          <TabFavicon tab={tab} size="compact" />
          <a
            href={tab.url}
            target="_blank"
            rel="noreferrer"
            onClick={event => openSavedLink(event, tab, onOpen)}
            onAuxClick={event => openSavedLink(event, tab, onOpen)}
            onPointerDown={event => event.stopPropagation()}
            className="min-w-0 truncate text-[12px] font-bold tracking-[-0.015em] text-[#26342c] hover:text-[#e95224] hover:underline"
            title={tab.title}
          >
            {tab.title}
          </a>
          <ViewedCheckbox
            tab={tab}
            hidden={lifecycleMode === "hidden"}
            onChange={onViewedChange}
          />
          <span
            {...attributes}
            {...listeners}
            data-testid={`tab-drag-space-${tab.id}`}
            aria-label={`Reorder ${tab.title} from empty row space`}
            className="hidden h-6 min-w-5 flex-1 touch-none cursor-grab sm:block"
          />
          <ManualGroupMoveSelect
            tab={tab}
            groups={groups}
            onMove={onMove}
            className="max-w-24 py-1 text-right"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            onClick={event => {
              event.stopPropagation();
              onEdit(tab);
            }}
            onPointerDown={event => event.stopPropagation()}
            className="size-6 shrink-0 rounded p-1 text-[#92958d] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e95224]"
            aria-label={`Edit ${tab.title}`}
            title={`Edit ${tab.title}`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
          <TabLifecycleActions
            tab={tab}
            mode={lifecycleMode}
            onRestore={onRestore}
            onHide={onHide}
            onUnhide={onUnhide}
            onProlong={onProlong}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            onClick={event => {
              event.stopPropagation();
              onDelete(tab);
            }}
            onPointerDown={event => event.stopPropagation()}
            className="size-6 shrink-0 rounded p-1 text-[#92958d] hover:bg-[#fff0ea] hover:text-[#c84b26] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e95224]"
            aria-label={`${destructiveAction} ${tab.title}`}
            title={`${destructiveAction} ${tab.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
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
              <ManualGroupMoveSelect
                tab={tab}
                groups={groups}
                onMove={onMove}
                className="max-w-[120px] py-1 pr-1 text-right"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onEdit(tab)}
                className="size-6 rounded p-0.5 text-[#aaa9a1] hover:bg-[#efede6] hover:text-[#e95224]"
                aria-label={`Edit ${tab.title}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              <TabLifecycleActions
                tab={tab}
                mode={lifecycleMode}
                onRestore={onRestore}
                onHide={onHide}
                onUnhide={onUnhide}
                onProlong={onProlong}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(tab)}
                className="size-6 rounded p-0.5 text-[#aaa9a1] hover:bg-[#fff0ea] hover:text-[#c84b26]"
                aria-label={`${destructiveAction} ${tab.title}`}
                title={`${destructiveAction} ${tab.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <StandardTabContent
          tab={tab}
          query={query}
          score={score}
          fallbackMode={fallbackMode}
          hidden={lifecycleMode === "hidden"}
          onOpenTagManager={onOpenTagManager}
          onOpen={onOpen}
          onViewedChange={onViewedChange}
        />
      )}

      {!compact && !instantPreview && (
        <div className="hidden items-start gap-2 pt-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 sm:flex">
          <ManualGroupMoveSelect
            tab={tab}
            groups={groups}
            onMove={onMove}
            className="max-w-[120px] py-1 pr-4 text-right"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(tab)}
            className="size-6 mt-0.5 rounded p-0.5 text-[#aaa9a1] hover:bg-[#efede6] hover:text-[#e95224]"
            aria-label={`Edit ${tab.title}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          <TabLifecycleActions
            tab={tab}
            mode={lifecycleMode}
            onRestore={onRestore}
            onHide={onHide}
            onUnhide={onUnhide}
            onProlong={onProlong}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(tab)}
            className="size-6 mt-0.5 rounded p-0.5 text-[#aaa9a1] hover:bg-[#fff0ea] hover:text-[#c84b26]"
            aria-label={`${destructiveAction} ${tab.title}`}
            title={`${destructiveAction} ${tab.title}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
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

/**
 * Offer manual groups as destinations for a saved tab.
 * Session and automatic groups are not user-selected move targets.
 * @param {{ tab: TabListItem; groups: Array<{ id: string; name: string; category?: string }>; onMove: (id: string, groupId: string | null) => void; className: string; }} props - Tab, manual destinations, move handler, and optional style.
 * @returns {React.ReactElement} Group destination selector.
 */
function ManualGroupMoveSelect({
  tab,
  groups,
  onMove,
  className,
}: {
  tab: TabListItem;
  groups: Array<{ id: string; name: string; category?: string }>;
  onMove: (id: string, groupId: string | null) => void;
  className: string;
}) {
  const manualGroups = groups.filter(group => group.category === "manual");
  if (!manualGroups.length) return null;
  const currentManualGroupId = manualGroups.some(
    group => group.id === tab.groupId
  )
    ? tab.groupId
    : "";

  return (
    <NativeSelect
      aria-label={`Move ${tab.title}`}
      value={currentManualGroupId ?? ""}
      onChange={event => onMove(tab.id, event.target.value)}
      className={`h-auto appearance-none border-0 bg-transparent px-0 shadow-none font-mono text-[9px] uppercase tracking-[0.06em] text-[#8a8e85] outline-none hover:text-[#e95224] ${className}`}
    >
      <option value="" disabled>
        Move to…
      </option>
      {manualGroups.map(group => (
        <option
          key={group.id}
          value={group.id}
          disabled={group.id === tab.groupId}
        >
          {group.name}
        </option>
      ))}
    </NativeSelect>
  );
}

/**
 * Show restore, hide, or prolong controls for a tab.
 * Available actions follow the tab’s current visible, hidden, or archived view.
 * @param {{ tab: TabListItem; mode: "visible" | "hidden" | "archived"; onRestore?: (tab: TabListItem) => void; onHide?: (tab: TabListItem, durationMs: number) => void; onUnhide?: (tab: TabListItem) => void; onProlong?: (tab: TabListItem, durationMs: number) => void; }} props - Tab, lifecycle view, and available transition callbacks.
 * @returns {React.ReactElement} Controls allowed in the current lifecycle view.
 */
function TabLifecycleActions({
  tab,
  mode,
  onRestore,
  onHide,
  onUnhide,
  onProlong,
}: {
  tab: TabListItem;
  mode: "visible" | "hidden" | "archived";
  onRestore?: (tab: TabListItem) => void;
  onHide?: (tab: TabListItem, durationMs: number) => void;
  onUnhide?: (tab: TabListItem) => void;
  onProlong?: (tab: TabListItem, durationMs: number) => void;
}) {
  if (mode === "archived")
    return (
      <Button
        variant="ghost"
        type="button"
        onClick={() => onRestore?.(tab)}
        className="rounded px-1.5 py-1 font-mono text-[8px] uppercase text-[#56815d] hover:bg-[#edf2ea]"
      >
        Restore
      </Button>
    );
  return (
    <div className="flex items-center gap-1">
      {mode === "hidden" && (
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          onClick={() => onUnhide?.(tab)}
          className="size-6 rounded p-1 text-[#56815d] hover:bg-[#edf2ea] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#56815d]"
          aria-label={`Unhide ${tab.title}`}
          title={`Unhide ${tab.title}`}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      )}
      <HideDurationMenu
        mode={mode === "hidden" ? "prolong" : "hide"}
        target={tab.title}
        onSelect={duration =>
          mode === "hidden"
            ? onProlong?.(tab, duration)
            : onHide?.(tab, duration)
        }
      />
    </div>
  );
}
