/**
 * Signal Library design reminder: Compact mode is a pure favicon-and-title index.
 * Instant Preview is a Telegram-like stream of individual link cards; movement keeps
 * the physical index-rail gap while the drag overlay preserves the user’s grab point.
 */
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowUpRight,
  BookOpenText,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  GripVertical,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Share2,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { parseReadableArticle, type ReadableArticle } from "@/lib/readability";

export type TabViewMode = "standard" | "compact" | "preview";

export type TabListItem = {
  id: string;
  groupId: string;
  title: string;
  url: string;
  domain: string;
  note: string;
  tags: string[];
  color: string;
  icon: string;
  updated: string;
};

type Props = {
  tabs: TabListItem[];
  viewMode: TabViewMode;
  query: string;
  selectionEnabled?: boolean;
  collapsibleGroups?: boolean;
  collapsedGroupIds?: Set<string>;
  onToggleGroup?: (groupId: string) => void;
  activeResultIndex: number;
  selectedResultIds: Set<string>;
  semanticScores: Map<string, number>;
  fallbackMode?: "text_fallback" | "semantic";
  onActiveIndex: (index: number) => void;
  onToggleSelection: (id: string) => void;
  onMove: (id: string, groupId: string) => void;
  onEdit: (tab: TabListItem) => void;
  onDelete: (tab: TabListItem) => void;
  onOpenTagManager: () => void;
  onOpenGroup?: (groupId: string) => void;
  onShareGroup?: (groupId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  groups: Array<{ id: string; name: string }>;
};

export function TabList({
  tabs,
  viewMode,
  query,
  selectionEnabled = false,
  collapsibleGroups = false,
  collapsedGroupIds = new Set(),
  onToggleGroup,
  activeResultIndex,
  selectedResultIds,
  semanticScores,
  fallbackMode,
  onActiveIndex,
  onToggleSelection,
  onMove,
  onEdit,
  onDelete,
  onOpenTagManager,
  onOpenGroup,
  onShareGroup,
  onDeleteGroup,
  groups,
}: Props) {
  const tabGroups = useMemo(
    () =>
      Array.from(
        tabs.reduce<Map<string, TabListItem[]>>((groupsById, tab) => {
          const groupTabs = groupsById.get(tab.groupId) ?? [];
          groupTabs.push(tab);
          groupsById.set(tab.groupId, groupTabs);
          return groupsById;
        }, new Map())
      ),
    [tabs]
  );

  return (
    <div
      data-testid="tab-list"
      className={`catalog-rule overflow-hidden border-t border-[#dcd7cc] ${viewMode === "compact" ? "pl-2 sm:pl-3" : "pl-3 sm:pl-4"}`}
    >
      <SortableContext
        items={tabs.map(tab => tab.id)}
        strategy={verticalListSortingStrategy}
      >
        {tabGroups.map(([groupId, groupTabs]) => {
          const groupName =
            groups.find(group => group.id === groupId)?.name ?? "Collection";
          const showGroupLabel = tabGroups.length > 1;
          const isCollapsed = collapsedGroupIds.has(groupId);
          return (
            <section key={groupId} data-testid={`tab-group-${groupId}`}>
              {showGroupLabel && (
                <div className="flex items-center justify-between gap-3 border-b border-[#dfdbd0] bg-[#f9f7f1] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#777d75]">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {collapsibleGroups ? (
                      <button
                        onClick={() => onToggleGroup?.(groupId)}
                        className="inline-flex min-w-0 items-center gap-1.5 truncate hover:text-[#e95224]"
                        aria-expanded={!isCollapsed}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-3 w-3 shrink-0" />
                        ) : (
                          <ChevronDown className="h-3 w-3 shrink-0" />
                        )}
                        <span className="truncate">{groupName}</span>
                      </button>
                    ) : (
                      <span>{groupName}</span>
                    )}
                    {collapsibleGroups && (
                      <div
                        className="flex shrink-0 items-center gap-0.5 border-l border-[#d9d3c6] pl-1.5"
                        aria-label={`${groupName} collection actions`}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenGroup?.(groupId)}
                          className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                          aria-label={`Open all tabs in ${groupName}`}
                          title="Open all tabs"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onShareGroup?.(groupId)}
                          className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                          aria-label={`Copy ${groupName} as Markdown`}
                          title="Copy as Markdown"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteGroup?.(groupId)}
                          disabled={groupId === "inbox"}
                          className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#c84b26] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224] disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={
                            groupId === "inbox"
                              ? "Inbox cannot be deleted"
                              : `Delete ${groupName}`
                          }
                          title={
                            groupId === "inbox"
                              ? "Inbox is protected"
                              : "Delete collection"
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="shrink-0">{groupTabs.length} tabs</span>
                </div>
              )}
              {!isCollapsed && (
                <>
                  {groupTabs.map(tab => {
                    const index = tabs.findIndex(item => item.id === tab.id);
                    return (
                      <SortableTabRow
                        key={tab.id}
                        tab={tab}
                        index={index}
                        viewMode={viewMode}
                        query={query}
                        selectionEnabled={selectionEnabled}
                        isSelected={selectedResultIds.has(tab.id)}
                        isKeyboardActive={
                          query.length > 0 && activeResultIndex === index
                        }
                        score={semanticScores.get(tab.id)}
                        fallbackMode={fallbackMode}
                        onActiveIndex={onActiveIndex}
                        onToggleSelection={onToggleSelection}
                        onMove={onMove}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onOpenTagManager={onOpenTagManager}
                        groups={groups}
                      />
                    );
                  })}
                </>
              )}
            </section>
          );
        })}
      </SortableContext>
    </div>
  );
}

function SortableTabRow({
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
  onDelete,
  onOpenTagManager,
  groups,
}: {
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
  onMove: (id: string, groupId: string) => void;
  onEdit: (tab: TabListItem) => void;
  onDelete: (tab: TabListItem) => void;
  onOpenTagManager: () => void;
  groups: Array<{ id: string; name: string }>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tab.id,
    animateLayoutChanges: ({ isSorting, wasDragging }) =>
      isSorting || !wasDragging,
  });
  const compact = viewMode === "compact";
  const instantPreview = viewMode === "preview";
  const style = {
    transform: CSS.Transform.toString(transform),
    ...(isDragging ? {} : { transition }),
  };
  const rowState = isDragging
    ? "bg-[#fff4ee] opacity-30 outline outline-2 outline-[#eaa889]"
    : isSelected
      ? "bg-[#edf2ea] outline outline-1 outline-[#b7cbb4]"
      : isKeyboardActive
        ? "bg-[#fff7f1] outline outline-1 outline-[#eab79d]"
        : "bg-[#f6f3ec]/55 hover:bg-[#fffdf8]";

  return (
    <article
      ref={setNodeRef}
      style={style}
      id={`search-result-${tab.id}`}
      data-testid={`tab-row-${tab.id}`}
      data-dragging={isDragging ? "true" : "false"}
      data-drag-gap={isDragging ? "visible" : undefined}
      onMouseEnter={() => {
        if (query) onActiveIndex(index);
      }}
      className={`group relative border-b border-[#dfdbd0] ${isDragging ? "transition-none" : "transition-[opacity,margin,background-color] duration-200"} ${compact ? "flex items-center gap-2.5 px-2 py-2.5" : "flex gap-3 pr-2 sm:px-2 " + (instantPreview ? "py-3" : "py-4")} ${rowState}`}
    >
      {(query || selectionEnabled) && (
        <label
          className={`${compact ? "" : "mt-1"} flex h-4 w-4 shrink-0 items-center justify-center`}
          onPointerDown={event => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(tab.id)}
            className="h-3.5 w-3.5 accent-[#e95224]"
            aria-label={`Select ${tab.title}`}
          />
        </label>
      )}

      {!compact && (
        <button
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${tab.title}`}
          className="mt-0.5 hidden shrink-0 touch-none text-[#c3c3bb] transition hover:text-[#e95224] sm:block"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      {compact ? (
        <>
          <button
            {...attributes}
            {...listeners}
            data-testid={`tab-drag-handle-${tab.id}`}
            aria-label={`Reorder ${tab.title}`}
            className="shrink-0 touch-none cursor-grab p-0.5 text-[#b3b4ac] transition hover:text-[#e95224] active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e95224]"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <TabFavicon tab={tab} size="compact" />
          <a
            href={tab.url}
            target="_blank"
            rel="noreferrer"
            onPointerDown={event => event.stopPropagation()}
            className="min-w-0 flex-1 truncate text-[12px] font-bold tracking-[-0.015em] text-[#26342c] hover:text-[#e95224] hover:underline"
            title={tab.title}
          >
            {tab.title}
          </a>
          <span
            {...attributes}
            {...listeners}
            data-testid={`tab-drag-space-${tab.id}`}
            aria-label={`Reorder ${tab.title} from empty row space`}
            className="hidden h-6 min-w-5 flex-1 touch-none cursor-grab sm:block"
          />
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              onEdit(tab);
            }}
            onPointerDown={event => event.stopPropagation()}
            className="shrink-0 rounded p-1 text-[#92958d] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e95224]"
            aria-label={`Edit ${tab.title}`}
            title={`Edit ${tab.title}`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              onDelete(tab);
            }}
            onPointerDown={event => event.stopPropagation()}
            className="shrink-0 rounded p-1 text-[#92958d] hover:bg-[#fff0ea] hover:text-[#c84b26] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e95224]"
            aria-label={`Archive ${tab.title}`}
            title={`Archive ${tab.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      ) : instantPreview ? (
        <div className="min-w-0 flex-1">
          <ReadableArticlePreview tab={tab} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1">
            <button
              onClick={onOpenTagManager}
              className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#747a72] hover:text-[#e95224]"
            >
              Manage tags
            </button>
            <div className="flex items-center gap-2">
              {query && score === undefined && (
                <span className="font-mono text-[9px] text-[#be742e]">
                  {fallbackMode === "text_fallback"
                    ? "text match"
                    : "local match"}
                </span>
              )}
              <select
                aria-label={`Move ${tab.title}`}
                value={tab.groupId}
                onChange={event => onMove(tab.id, event.target.value)}
                className="max-w-[120px] appearance-none bg-transparent py-1 pr-1 text-right font-mono text-[9px] uppercase tracking-[0.06em] text-[#8a8e85] outline-none hover:text-[#e95224]"
              >
                {groups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onEdit(tab)}
                className="rounded p-0.5 text-[#aaa9a1] hover:bg-[#efede6] hover:text-[#e95224]"
                aria-label={`Edit ${tab.title}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              <button
                onClick={() => onDelete(tab)}
                className="rounded p-0.5 text-[#aaa9a1] hover:bg-[#fff0ea] hover:text-[#c84b26]"
                aria-label={`Archive ${tab.title}`}
                title={`Archive ${tab.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <StandardTabContent
          tab={tab}
          query={query}
          score={score}
          fallbackMode={fallbackMode}
          onOpenTagManager={onOpenTagManager}
          onEdit={onEdit}
        />
      )}

      {!compact && !instantPreview && (
        <div className="hidden items-start gap-2 pt-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 sm:flex">
          <select
            aria-label={`Move ${tab.title}`}
            value={tab.groupId}
            onChange={event => onMove(tab.id, event.target.value)}
            className="max-w-[120px] appearance-none bg-transparent py-1 pr-4 text-right font-mono text-[9px] uppercase tracking-[0.06em] text-[#8a8e85] outline-none hover:text-[#e95224]"
          >
            {groups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => onEdit(tab)}
            className="mt-0.5 rounded p-0.5 text-[#aaa9a1] hover:bg-[#efede6] hover:text-[#e95224]"
            aria-label={`Edit ${tab.title}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(tab)}
            className="mt-0.5 rounded p-0.5 text-[#aaa9a1] hover:bg-[#fff0ea] hover:text-[#c84b26]"
            aria-label={`Archive ${tab.title}`}
            title={`Archive ${tab.title}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
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

function TabFavicon({
  tab,
  size,
}: {
  tab: TabListItem;
  size: "compact" | "standard";
}) {
  const [failed, setFailed] = useState(false);
  const dimensions = size === "compact" ? "h-6 w-6" : "h-8 w-8";
  if (failed) {
    return (
      <span
        className={`flex ${dimensions} shrink-0 items-center justify-center rounded-[7px] text-[9px] font-bold text-white shadow-sm`}
        style={{ backgroundColor: tab.color }}
        aria-hidden="true"
      >
        {tab.icon}
      </span>
    );
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(tab.url)}&sz=64`}
      alt=""
      className={`${dimensions} shrink-0 rounded-[7px] bg-[#ece7dc] object-cover`}
      onError={() => setFailed(true)}
    />
  );
}

function StandardTabContent({
  tab,
  query,
  score,
  fallbackMode,
  onOpenTagManager,
  onEdit,
}: {
  tab: TabListItem;
  query: string;
  score?: number;
  fallbackMode?: "text_fallback" | "semantic";
  onOpenTagManager: () => void;
  onEdit: (tab: TabListItem) => void;
}) {
  return (
    <>
      <TabFavicon tab={tab} size="standard" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <a
            href={tab.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 text-[13px] font-bold leading-5 tracking-[-0.015em] text-[#26342c] hover:text-[#e95224] hover:underline"
          >
            {tab.title}
          </a>
          <ArrowUpRight className="mt-1 hidden h-3.5 w-3.5 shrink-0 text-[#9a9c95] group-hover:block" />
        </div>
        <p className="mt-1 text-[10px] font-medium text-[#84877f]">
          {tab.domain} <span className="mx-1.5 text-[#c4c1b9]">·</span> updated{" "}
          {tab.updated}
        </p>
        <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#666d65]">
          {tab.note}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {tab.tags.map(tag => (
            <button
              key={tag}
              onClick={onOpenTagManager}
              className="rounded border border-[#ded9cd] bg-[#f9f7f1] px-1.5 py-[3px] font-mono text-[9px] text-[#747a72] transition hover:border-[#e95224] hover:text-[#e95224]"
            >
              {tag}
            </button>
          ))}
          <button
            onClick={() => onEdit(tab)}
            className="ml-1 inline-flex items-center gap-1 font-mono text-[9px] text-[#858a82] hover:text-[#e95224]"
          >
            <Pencil className="h-3 w-3" /> edit
          </button>
          {query && score === undefined && (
            <span className="ml-1 font-mono text-[9px] text-[#be742e]">
              {fallbackMode === "text_fallback" ? "text match" : "local match"}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

type ReadabilityState =
  | { status: "loading"; url: string }
  | { status: "ready"; url: string; article: ReadableArticle }
  | { status: "unavailable"; url: string; reason: string };

function ReadableArticlePreview({ tab }: { tab: TabListItem }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReadabilityState>({
    status: "loading",
    url: tab.url,
  });

  useEffect(() => {
    let cancelled = false;
    void parseReadableArticle(tab.url)
      .then(article => {
        if (!cancelled) setState({ status: "ready", url: tab.url, article });
      })
      .catch(error => {
        if (!cancelled)
          setState({
            status: "unavailable",
            url: tab.url,
            reason:
              error instanceof Error
                ? error.message
                : "Reader preview is unavailable for this page.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [tab.url, attempt]);

  if (state.status === "loading" || state.url !== tab.url) {
    return (
      <section className="overflow-hidden border border-[#d7d1c4] bg-[#fffdf8]">
        <ReaderHeader tab={tab} label="Preparing reader preview" />
        <div className="flex min-h-[156px] items-center gap-3 px-4 py-6 text-[11px] text-[#727970]">
          <LoaderCircle className="h-4 w-4 animate-spin text-[#e95224]" />
          Mozilla Readability is extracting the article…
        </div>
      </section>
    );
  }

  if (state.status === "unavailable") {
    return (
      <section className="overflow-hidden border border-[#d7d1c4] bg-[#fffdf8]">
        <ReaderHeader tab={tab} label="Saved link" />
        <div className="min-h-[156px] px-4 py-4">
          <div className="flex items-center gap-2 text-[#536057]">
            <BookOpenText className="h-4 w-4 text-[#e95224]" />
            <p className="text-[12px] font-bold">Reader preview unavailable</p>
          </div>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#667068]">
            {tab.note ||
              "This site did not provide readable article HTML to the current TabVault context."}
          </p>
          <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.08em] text-[#9a7a5f]">
            {state.reason}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setAttempt(current => current + 1)}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#e95224] hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry reader
            </button>
            <a
              href={tab.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#43554a] hover:text-[#e95224] hover:underline"
            >
              Open original <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>
    );
  }

  const { article } = state;
  return (
    <section className="overflow-hidden border border-[#d7d1c4] bg-[#fffdf8] shadow-[0_7px_18px_rgba(24,38,31,0.04)]">
      <ReaderHeader tab={tab} label="Reader preview" />
      <div className="px-4 pt-4 pb-2">
        <h3 className="max-w-3xl font-['DM_Sans'] text-[20px] font-bold leading-[1.08] tracking-[-0.045em] text-[#26342c]">
          {article.title || tab.title}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[8px] uppercase tracking-[0.09em] text-[#7f867d]">
          {article.byline && <span>{article.byline}</span>}
          {article.siteName && <span>{article.siteName}</span>}
          <span>{Math.max(1, Math.ceil(article.length / 900))} min read</span>
        </div>
        {article.excerpt && (
          <p className="mt-3 border-l-2 border-[#e95224] pl-3 text-[11px] leading-5 text-[#5c665e]">
            {article.excerpt}
          </p>
        )}
      </div>
      <div
        className="reader-preview max-h-[360px] overflow-y-auto border-y border-[#e9e3d8] bg-[#fdfbf6] px-4 py-4 text-[13px] leading-7 text-[#38463d] [&_a]:text-[#c64b27] [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[#d7b091] [&_blockquote]:pl-3 [&_figcaption]:mt-1 [&_figcaption]:text-[10px] [&_figcaption]:text-[#7b8078] [&_h1]:mt-5 [&_h1]:font-['DM_Sans'] [&_h1]:text-[24px] [&_h1]:font-bold [&_h2]:mt-5 [&_h2]:font-['DM_Sans'] [&_h2]:text-[20px] [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:font-bold [&_img]:my-4 [&_img]:max-h-72 [&_img]:w-auto [&_img]:max-w-full [&_img]:object-contain [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-4"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
      <div className="flex flex-wrap items-center gap-1.5 bg-[#fffdf8] px-4 py-3">
        {tab.tags.map(tag => (
          <span
            key={tag}
            className="rounded border border-[#ded9cd] bg-[#f9f7f1] px-1.5 py-[3px] font-mono text-[8px] text-[#747a72]"
          >
            {tag}
          </span>
        ))}
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[#e95224] hover:underline"
        >
          Open original <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>
    </section>
  );
}

function ReaderHeader({ tab, label }: { tab: TabListItem; label: string }) {
  return (
    <div
      className="relative flex items-center justify-between gap-3 border-b border-[#e5dfd4] px-4 py-2.5"
      style={{ backgroundColor: `${tab.color}18` }}
    >
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: tab.color }}
      />
      <div className="flex min-w-0 items-center gap-2">
        <TabFavicon tab={tab} size="compact" />
        <span className="truncate font-mono text-[9px] uppercase tracking-[0.11em] text-[#617066]">
          {tab.domain}
        </span>
      </div>
      <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#758077]">
        {label}
      </span>
    </div>
  );
}
