import { useEffect, useState, type KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { PointerSensor, PointerActivationConstraints } from "@dnd-kit/dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLibrary } from "@/domain/library/library-context";
import {
  captureTabs,
  changeTag,
  deleteGroup,
  toggleCollectionCategory,
  deleteTab,
  moveTab,
  setViewed,
  updateTab,
} from "@/domain/library/operations";
import {
  isCurrentlyHidden,
  libraryStats,
  searchTabs,
  sortTabs,
  sortGroups,
} from "@/domain/library/selectors";
import type {
  SavedSearch,
  VaultGroup,
  VaultTab,
  TabPatch,
} from "@/domain/library/types";
import {
  LibraryHeader,
  LibraryResultSummary,
  LibraryViewControls,
  LibraryEmptyState,
} from "./LibraryWorkspaceParts";
import { LibrarySearchInput } from "./LibrarySearchInput";
import { LibrarySavedViews } from "./LibrarySavedViews";
import { useLibraryDrag } from "./useLibraryDrag";
import { TabList, TabDragPreview } from "../tabs/TabList";
import { EditTabDialog } from "../tabs/EditTabDialog";
import { CollectionBoard } from "../collections/CollectionBoard";
import { CollectionDropShelf } from "../collections/CollectionDropShelf";
import {
  DeleteCollectionDialog,
  EditCollectionDialog,
} from "../collections/CollectionDialogs";
import { TagManagerDialog } from "../tags/TagManagerDialog";
import {
  LIBRARY_OPEN_TAGS_FLAG,
  useRegisterLibrarySidebar,
} from "@/components/shell/workspace-sidebar-context";
import {
  addExtensionMessageListener,
  getActiveChromeTab,
  isExtensionContext,
  openTabUrls,
  type ChromeTabSnapshot,
} from "@/extension/bridge";
import {
  readStorageMode,
  type StorageMode,
} from "@/domain/server/browserStorage";
import { createSessionGroup } from "@/domain/library/session";
import {
  isGroupColor,
  regenerateGroupColor,
  setCollectionColor,
} from "@/domain/library/collectionColor";
import { buildQuickCleanPlan } from "@/domain/deduplication/model";
import { executeDedupePlan } from "@/domain/deduplication/execution";

/** Compose library views; domain commands own persistence and synchronization. @returns {React.ReactElement} Saved-tab workspace. */
export function LibraryWorkspace() {
  const [location, navigate] = useLocation();
  const { vault, mutate, dispatch, syncStatus, synchronize } = useLibrary();
  const tabView = vault.preferences.tabView;
  const archived = location === "/archive",
    hidden = location === "/hidden";
  const board = tabView === "groups" && !archived && !hidden;
  const drag = useLibraryDrag({ vault, mutate, list: !board });
  const { tabs, vaultGroups, savedSearches } = drag.preview.library;
  const groups = sortGroups(vaultGroups);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [editingTab, setEditingTab] = useState<VaultTab | null>(null);
  const [editingGroup, setEditingGroup] = useState<VaultGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<VaultGroup | null>(null);
  const [showTags, setShowTags] = useState(() =>
    Boolean(sessionStorage.getItem(LIBRARY_OPEN_TAGS_FLAG))
  );
  const [newTag, setNewTag] = useState("");
  const [showViews, setShowViews] = useState(false);
  const [viewName, setViewName] = useState("");
  const [storageMode, setStorageMode] = useState<StorageMode>("local");
  const [refreshing, setRefreshing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [undo, setUndo] = useState<{ label: string; tabs: VaultTab[] } | null>(
    null
  );
  const lifecycle = archived ? "archived" : hidden ? "hidden" : "visible";
  const pageTabs = tabs.filter(t =>
    archived
      ? t.lifecycle.archived
      : hidden
        ? isCurrentlyHidden(t, now)
        : !t.lifecycle.archived && !isCurrentlyHidden(t, now)
  );
  const filtered = pageTabs.filter(
    t => filter === "all" || t.placement.groupId === filter
  );
  const visible = searchTabs(sortTabs(filtered, vault), query, vault);
  const visibleGroups = groups.filter(
    g =>
      (filter === "all" || g.id === filter) &&
      !archived &&
      (pageTabs.some(t => t.placement.groupId === g.id) ||
        (!hidden && !tabs.some(t => t.placement.groupId === g.id)))
  );
  const tagCatalog = Object.fromEntries(
    vault.library.tags.map(t => [t.name, t.description])
  );
  const run = (work: Promise<unknown>) =>
    void work.catch(error =>
      toast.error(error instanceof Error ? error.message : String(error))
    );
  const refresh = async () => {
    setRefreshing(true);
    try {
      await synchronize();
      toast.success("Library synchronized");
    } finally {
      setRefreshing(false);
    }
  };
  const capture = async (source?: ChromeTabSnapshot) => {
    const tab = source ?? (await getActiveChromeTab());
    if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
      toast.error("Open an HTTP(S) page to capture");
      return;
    }
    await mutate(v => captureTabs(v, [{ url: tab.url!, title: tab.title }]));
    toast.success("Saved to a new Session");
  };
  useRegisterLibrarySidebar({
    counts: libraryStats(vault, now),
    connection: {
      storageMode,
      serverOnline: syncStatus?.state === "synced",
      isRefreshing: refreshing,
    },
    actions: {
      onOpenTags: () => setShowTags(true),
      onRefreshLibrary: () => run(refresh()),
      onCaptureTab: isExtensionContext() ? () => run(capture()) : undefined,
    },
  });
  useEffect(() => {
    void readStorageMode().then(setStorageMode);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    if (sessionStorage.getItem(LIBRARY_OPEN_TAGS_FLAG)) {
      sessionStorage.removeItem(LIBRARY_OPEN_TAGS_FLAG);
    }
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() =>
    addExtensionMessageListener(message => {
      if (
        typeof message !== "object" ||
        message === null ||
        !("type" in message && "tab" in message)
      )
        return;
      if (message.type === "TABVAULT_CAPTURE_ACTIVE")
        run(capture((message as { tab: ChromeTabSnapshot }).tab));
    })
  );
  const patch = async (tab: VaultTab, changes: TabPatch, label: string) => {
    await mutate(v => updateTab(v, tab.id, changes));
    setUndo({ label, tabs: [tab] });
  };
  const visibility = async (
    ids: string[],
    mode: "hide" | "unhide" | "prolong",
    duration = 0
  ) => {
    const previous = tabs.filter(
      t => ids.includes(t.id) && !t.lifecycle.archived
    );
    await mutate(v =>
      previous.reduce((next, tab) => {
        const live = next.library.tabs.find(t => t.id === tab.id);
        if (!live || live.lifecycle.archived) return next;
        const start =
          mode === "prolong"
            ? Math.max(
                Date.now(),
                Date.parse(live.lifecycle.hiddenUntil ?? "") || 0
              )
            : Date.now();
        return updateTab(next, tab.id, {
          lifecycle: {
            hiddenUntil:
              mode === "unhide"
                ? null
                : new Date(start + duration).toISOString(),
          },
        });
      }, v)
    );
    setUndo({ label: mode, tabs: previous });
  };
  const groupVisibility = (
    id: string,
    mode: "hide" | "unhide" | "prolong",
    duration = 0
  ) =>
    visibility(
      tabs
        .filter(t => t.placement.groupId === (id === "unassigned" ? null : id))
        .map(t => t.id),
      mode,
      duration
    );
  const open = async (tab: VaultTab, url = tab.content.url) => {
    const result = await openTabUrls([url]);
    if (result.openedCount) await mutate(v => setViewed(v, tab.id, true));
  };
  const openGroup = async (id: string) => {
    const members = pageTabs.filter(
      t => t.placement.groupId === (id === "unassigned" ? null : id)
    );
    if (!members.length) return;
    const collection = groups.find(g => g.id === id);
    const color = collection?.details.accent ?? "grey";
    if (!isGroupColor(color)) {
      toast.error("Color is incorrect", {
        action: {
          label: "Regenerate color",
          onClick: () =>
            run(mutate(v => setCollectionColor(v, id, regenerateGroupColor()))),
        },
      });
      return;
    }
    const result = await openTabUrls(
      members.map(t => t.content.url),
      {
        title: collection?.details.name ?? "[Unassigned]",
        color,
      }
    );
    await mutate(v =>
      members
        .filter(t => result.openedUrls.includes(t.content.url))
        .reduce((next, t) => setViewed(next, t.id, true), v)
    );
    if (result.groupError)
      toast.error("Tabs opened, but Chrome could not create the group", {
        description: result.groupError,
      });
  };
  const shareGroup = async (id: string) => {
    await navigator.clipboard.writeText(
      [
        `## ${groups.find(g => g.id === id)?.details.name ?? "[Unassigned]"}`,
        ...pageTabs
          .filter(
            t => t.placement.groupId === (id === "unassigned" ? null : id)
          )
          .map(t => `- [${t.content.title}](${t.content.url})`),
      ].join("\n")
    );
    toast.success("Collection copied as Markdown");
  };
  const createGroup = () =>
    run(
      mutate(v => {
        const group = createSessionGroup();
        group.details = {
          ...group.details,
          category: "manual",
          description: "",
        };
        return {
          ...v,
          library: {
            ...v.library,
            vaultGroups: [
              group,
              ...v.library.vaultGroups.map(g => ({
                ...g,
                placement: { position: g.placement.position + 1 },
              })),
            ],
          },
        };
      })
    );
  const saveGroup = async () => {
    if (!editingGroup?.details.name.trim()) return;
    const draft = editingGroup;
    await mutate(v => ({
      ...v,
      library: {
        ...v.library,
        vaultGroups: v.library.vaultGroups.some(g => g.id === draft.id)
          ? v.library.vaultGroups.map(g => (g.id === draft.id ? draft : g))
          : [...v.library.vaultGroups, draft],
      },
    }));
    setEditingGroup(null);
  };
  const saveTab = async (draft: VaultTab) => {
    await mutate(v => {
      let next = updateTab(v, draft.id, {
        content: draft.content,
        annotations: draft.annotations,
        placement: draft.placement,
      });
      for (const name of draft.annotations.tags)
        if (
          !next.library.tags.some(
            t => t.name.toLowerCase() === name.toLowerCase()
          )
        )
          next = changeTag(next, name, {});
      return next;
    });
    setEditingTab(null);
  };
  const removeGroup = (group: VaultGroup) => {
    if (tabs.some(t => t.placement.groupId === group.id))
      setDeletingGroup(group);
    else run(mutate(v => deleteGroup(v, group.id)));
  };
  const removeTab = async (tab: VaultTab) => {
    if (tab.lifecycle.archived) {
      if (window.confirm(`Permanently delete ${tab.content.title}?`))
        await mutate(v => deleteTab(v, tab.id));
    } else await patch(tab, { lifecycle: { archived: true } }, "archive");
  };
  const quickClean = async () => {
    setCleaning(true);
    try {
      const plan = await buildQuickCleanPlan(pageTabs);
      const count = plan.clusters.reduce(
        (n, c) => n + c.duplicateIds.length,
        0
      );
      if (!count) {
        toast("No exact duplicate records found");
        return;
      }
      if (
        !window.confirm(
          `Quick Clean will archive ${count} duplicate Saved Tabs. Continue?`
        )
      )
        return;
      const result = await executeDedupePlan(
        plan,
        async mutation => {
          await mutate(v => updateTab(v, mutation.id, mutation.updates));
        },
        () => undefined
      );
      toast(
        result.failed
          ? `${result.failed} changes failed`
          : `Archived ${count} duplicates`
      );
    } finally {
      setCleaning(false);
    }
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(i => Math.min(i + 1, visible.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(i => Math.max(0, i - 1));
    }
    if (event.key === "Enter" && visible[activeIndex])
      run(open(visible[activeIndex]));
    if (event.key === "Escape") {
      setQuery("");
      setActiveIndex(0);
    }
  };
  const savedView = (view: SavedSearch) => {
    setShowViews(false);
    setQuery(view.query);
    setFilter(view.groupId);
    setActiveIndex(0);
  };
  const withGroup = (id: string, action: (group: VaultGroup) => void) => {
    const group = groups.find(g => g.id === id);
    if (group) action(group);
  };
  return (
    <DragDropProvider
      sensors={defaults => [
        ...defaults.filter(sensor => sensor !== PointerSensor),
        PointerSensor.configure({
          activationConstraints: [
            new PointerActivationConstraints.Distance({ value: 6 }),
          ],
          activatorElements: source => [
            source.handle ?? source.element,
            source.element?.querySelector("[data-tab-drag-space]") ?? undefined,
          ],
        }),
      ]}
      onDragStart={drag.handleLibraryDragStart}
      onDragOver={drag.handleLibraryDragOver}
      onDragMove={drag.handleLibraryDragMove}
      onDragEnd={event => run(drag.handleLibraryDragEnd(event))}
    >
      <main className="min-h-screen bg-[#f6f3ec] text-[#18261f]">
        <div className="mx-auto max-w-[1540px] px-5 py-5 sm:px-7">
          <LibraryHeader
            title={archived ? "Archive" : hidden ? "Hidden" : "All tabs"}
            libraryStorageLabel={
              syncStatus?.state === "synced"
                ? "Synced to server"
                : syncStatus?.state === "pending"
                  ? "Stored locally · sync pending"
                  : "Stored locally"
            }
            onOpenDashboard={() => navigate("/dashboard")}
          />
          {syncStatus?.error && (
            <p role="status" className="my-3 text-sm text-[#a33b21]">
              {syncStatus.error}{" "}
              <button
                className="underline"
                onClick={() => navigate("/settings")}
              >
                Connection and recovery settings
              </button>
            </p>
          )}
          <div className="mt-4">
            <LibraryResultSummary
              search={{
                query,
                visibleCount: visible.length,
                searchStatusCopy:
                  "Search titles, URLs, tags, and custom properties.",
              }}
              page={{
                isAllTabsPage: !archived && !hidden,
              }}
              cleanup={{
                isQuickCleaning: cleaning,
                onQuickClean: () => run(quickClean()),
                onAdvancedDedupe: () => navigate("/deduplicate"),
              }}
            />
            <div
              data-testid="library-search-toolbar"
              className="sticky top-14 z-20 mt-3 bg-[#f6f3ec] py-2 lg:top-0"
            >
              <LibrarySearchInput
                search={{
                  query,
                  activeResultId: visible[activeIndex]?.id,
                  onQueryChange: value => {
                    setQuery(value);
                    setActiveIndex(0);
                  },
                  onKeyDown: keyDown,
                }}
                filter={{
                  searchGroupFilter: filter,
                  groups,
                  onGroupFilterChange: setFilter,
                }}
              />
              {!archived && !hidden && <CollectionDropShelf groups={groups} />}
            </div>
            <LibrarySavedViews
              query={query}
              picker={{
                showSavedSearches: showViews,
                onToggleSavedSearches: () => setShowViews(!showViews),
              }}
              draft={{
                savedSearchName: viewName,
                onNameChange: setViewName,
                onSave: () => {
                  dispatch({
                    type: "update",
                    group: "library",
                    key: "savedSearches",
                    value: current => [
                      ...current,
                      {
                        id: crypto.randomUUID(),
                        name: viewName || query,
                        query,
                        groupId: filter,
                      },
                    ],
                  });
                  setViewName("");
                  setShowViews(false);
                },
              }}
              views={{
                savedSearches,
                groups,
                onApply: savedView,
                onDelete: id =>
                  dispatch({
                    type: "update",
                    group: "library",
                    key: "savedSearches",
                    value: current => current.filter(v => v.id !== id),
                  }),
              }}
              undo={{ undoLabel: undefined, onUndo: () => undefined }}
            />
            {undo && (
              <Button
                variant="ghost"
                onClick={() =>
                  run(
                    mutate(v =>
                      undo.tabs.reduce(
                        (next, t) =>
                          updateTab(next, t.id, {
                            lifecycle: t.lifecycle,
                            placement: t.placement,
                          }),
                        v
                      )
                    ).then(() => setUndo(null))
                  )
                }
              >
                Undo {undo.label}
              </Button>
            )}
            <div className="flex items-center justify-between">
              <LibraryViewControls
                tabView={tabView}
                onViewChange={value =>
                  dispatch({
                    type: "update",
                    group: "preferences",
                    key: "tabView",
                    value,
                  })
                }
              />
              {!archived && !hidden && (
                <Button variant="ghost" onClick={createGroup}>
                  New collection
                </Button>
              )}
            </div>
            {board ? (
              <CollectionBoard
                groups={visibleGroups}
                onCategoryToggle={id =>
                  run(mutate(v => toggleCollectionCategory(v, id)))
                }
                onColorChange={(id, color) =>
                  run(mutate(v => setCollectionColor(v, id, color)))
                }
                tabs={sortTabs(pageTabs, vault)}
                search={{
                  query,
                  matchedTabIds: new Set(visible.map(t => t.id)),
                }}
                actions={{
                  onOpen: g => run(openGroup(g.id)),
                  onShare: g => run(shareGroup(g.id)),
                  onDelete: removeGroup,
                  onEdit: g => setEditingGroup(structuredClone(g)),
                  onBrowse: id => {
                    setFilter(id);
                    dispatch({
                      type: "update",
                      group: "preferences",
                      key: "tabView",
                      value: "standard",
                    });
                  },
                  onCreate: createGroup,
                  onHide: (id, duration) =>
                    run(groupVisibility(id, "hide", duration)),
                }}
              />
            ) : visible.length || visibleGroups.length ? (
              <TabList
                tabs={visible}
                dragOrigin={drag.origin}
                viewMode={tabView === "groups" ? "standard" : tabView}
                navigation={{
                  query,
                  activeIndex,
                  onActiveIndex: setActiveIndex,
                }}
                collections={{
                  groups: visibleGroups,
                  collapsed,
                  onToggle: id =>
                    setCollapsed(current => {
                      const next = new Set(current);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    }),
                  actions: {
                    onOpen: id => run(openGroup(id)),
                    onShare: id => run(shareGroup(id)),
                    onDelete: id => withGroup(id, removeGroup),
                    onEdit: id =>
                      withGroup(id, g => setEditingGroup(structuredClone(g))),
                    onColorChange: (id, color) =>
                      run(mutate(v => setCollectionColor(v, id, color))),
                    onCategoryToggle: id =>
                      run(mutate(v => toggleCollectionCategory(v, id))),
                  },
                  lifecycle: {
                    lifecycleMode: lifecycle,
                    onHide: (id, duration) =>
                      run(groupVisibility(id, "hide", duration)),
                    onUnhide: id => run(groupVisibility(id, "unhide")),
                    onProlong: (id, duration) =>
                      run(groupVisibility(id, "prolong", duration)),
                  },
                }}
                actions={{
                  onMove: (id, groupId) =>
                    run(mutate(v => moveTab(v, id, groupId))),
                  onEdit: t => setEditingTab(structuredClone(t)),
                  onOpen: (t, url) => run(open(t, url)),
                  onViewedChange: (id, value) =>
                    run(mutate(v => setViewed(v, id, value))),
                  onDelete: t => run(removeTab(t)),
                  onOpenTagManager: () => setShowTags(true),
                }}
                lifecycle={{
                  lifecycleMode: lifecycle,
                  onRestore: t =>
                    run(
                      patch(t, { lifecycle: { archived: false } }, "restore")
                    ),
                  onHide: (t, duration) =>
                    run(visibility([t.id], "hide", duration)),
                  onUnhide: t => run(visibility([t.id], "unhide")),
                  onProlong: (t, duration) =>
                    run(visibility([t.id], "prolong", duration)),
                }}
              />
            ) : (
              <LibraryEmptyState
                query={query}
                isArchivePage={archived}
                isHiddenPage={hidden}
                workspaceLabel={
                  archived ? "Archive" : hidden ? "Hidden" : "All tabs"
                }
              />
            )}
          </div>
        </div>
        {editingTab && (
          <EditTabDialog
            key={editingTab.id}
            tab={editingTab}
            groups={groups}
            propertySchema={vault.propertySchema}
            actions={{
              onChange: setEditingTab,
              onClose: () => setEditingTab(null),
              onSave: saveTab,
            }}
          />
        )}
        {editingGroup && (
          <EditCollectionDialog
            collection={editingGroup}
            categories={[
              ...new Set([
                "manual",
                "session",
                ...groups.map(g => g.details.category),
              ]),
            ]}
            onChange={setEditingGroup}
            onClose={() => setEditingGroup(null)}
            onSave={() => run(saveGroup())}
          />
        )}
        {deletingGroup && (
          <DeleteCollectionDialog
            collection={deletingGroup}
            onClose={() => setDeletingGroup(null)}
            onDelete={() =>
              run(
                mutate(v => deleteGroup(v, deletingGroup.id)).then(() =>
                  setDeletingGroup(null)
                )
              )
            }
          />
        )}
        {showTags && (
          <TagManagerDialog
            tags={tagCatalog}
            draft={{
              newTagName: newTag,
              onNewTagNameChange: setNewTag,
              onAdd: () =>
                run(
                  mutate(v => changeTag(v, newTag, {})).then(() =>
                    setNewTag("")
                  )
                ),
            }}
            actions={{
              onDescriptionChange: (name, description) =>
                run(mutate(v => changeTag(v, name, { description }))),
              onRename: (name, next) =>
                run(mutate(v => changeTag(v, name, { name: next }))),
              onRemove: name => {
                if (
                  window.confirm(`Remove ${name} and detach it from all tabs?`)
                )
                  run(mutate(v => changeTag(v, name, null)));
              },
              onClose: () => setShowTags(false),
            }}
          />
        )}
      </main>
      <DragOverlay dropAnimation={null}>
        {source => {
          const tab = tabs.find(t => t.id === source.id);
          return tab ? <TabDragPreview tab={tab} /> : null;
        }}
      </DragOverlay>
    </DragDropProvider>
  );
}
