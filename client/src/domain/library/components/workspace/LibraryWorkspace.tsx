import { patchTab } from "@/domain/library/patch";
/**
 * Signal Library design reminder: This page is an asymmetric link-library workspace.
 * The left rail indexes collections, the center is a calm reading surface, and orange signals active work.
 */
import {
  LibraryHeader,
  LibraryResultSummary,
  LibraryViewControls,
  LibraryEmptyState,
} from "@/domain/library/components/workspace/LibraryWorkspaceParts";
import { LibrarySavedViews } from "@/domain/library/components/workspace/LibrarySavedViews";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { useLocation } from "wouter";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import {
  createGroupOnLocalServer,
  deleteGroupOnLocalServer,
  refreshLibraryFromServer,
  saveTabToLocalServer,
  updateTabOnLocalServer,
  updateGroupOnLocalServer,
} from "@/domain/server/libraryApi";
import {
  checkLocalServer,
  getSemanticIndexStatus,
  searchLocalServer,
  type LocalSearchResponse,
  type SemanticIndexStatus,
} from "@/domain/server/search";
import {
  addExtensionMessageListener,
  getActiveChromeTab,
  isExtensionContext,
  openTabUrls,
  type ChromeTabSnapshot,
} from "@/extension/bridge";
import {
  DEFAULT_TABVAULT_API_KEY,
  DEFAULT_TABVAULT_SERVER_URL,
  readApiKey,
  readBrowserVault,
  readLibraryRefreshInterval,
  readLocalServerUrl,
  readStorageMode,
  readSyncStatus,
  type StorageMode,
  type SyncStatus,
} from "@/domain/server/browserStorage";
import {
  DEFAULT_PROPERTY_SCHEMA,
  domainFromUrl,
  orderKey,
} from "@/domain/library/codec";
import {
  TabDragPreview,
  TabList,
} from "@/domain/library/components/tabs/TabList";
import {
  LIBRARY_OPEN_TAGS_FLAG,
  useRegisterLibrarySidebar,
} from "@/components/shell/workspace-sidebar-context";
import {
  CollectionBoard,
  CollectionTabIcon,
} from "@/domain/library/components/collections/CollectionBoard";
import {
  DeleteCollectionDialog,
  EditCollectionDialog,
} from "@/domain/library/components/collections/CollectionDialogs";
import { EditTabDialog } from "@/domain/library/components/tabs/EditTabDialog";
import { TagManagerDialog } from "@/domain/library/components/tags/TagManagerDialog";
import { CollectionDropShelf } from "@/domain/library/components/collections/CollectionDropShelf";
import { LibrarySearchInput } from "@/domain/library/components/workspace/LibrarySearchInput";
import { LibraryBulkActions } from "@/domain/library/components/workspace/LibraryBulkActions";
import { useLibraryDrag } from "@/domain/library/components/workspace/useLibraryDrag";
import { useLibrarySelection } from "@/domain/library/components/workspace/useLibrarySelection";
import { useLibrary } from "@/domain/library/library-context";
import {
  currentSearchResponse,
  isCurrentlyHidden,
  searchResultTabs,
  sortTabs,
} from "@/domain/library/selectors";
import { createSessionGroup, sessionName } from "@/domain/library/session";
import type {
  GroupId,
  LibraryViewMode,
  PersistedVault,
  SavedSearch,
  VaultGroup,
  VaultTab,
} from "@/domain/library/types";
import { buildQuickCleanPlan } from "@/domain/deduplication/model";
import {
  executeDedupePlan,
  type DedupeMutation,
} from "@/domain/deduplication/execution";
import { toast } from "sonner";

/**
 * Coordinate saved-tab browsing, search, grouping, and persistence.
 * It reads the shared library provider and keeps extension and server behavior in the current workspace.
 * @returns {React.ReactElement} Interactive saved-tab workspace.
 */
export function LibraryWorkspace() {
  const [location, setLocation] = useLocation();
  const { vault, dispatch } = useLibrary();
  const {
    library: { tabs, vaultGroups, tagCatalog, tabOrders },
  } = vault;
  const savedSearches = vault.library.savedSearches ?? [];
  const tabView = vault.preferences.tabView ?? "standard";
  /**
   * Update the saved-tab collection through the library provider.
   * Keeps mutations on the shared vault rather than local component state.
   * @param {SetStateAction<VaultTab[]>} value - New tab array or updater.
   */
  const setTabs = (value: SetStateAction<VaultTab[]>) =>
    dispatch({ type: "update", group: "library", key: "tabs", value });
  /**
   * Update the saved groups through the library provider.
   * Keeps group changes in the persisted vault.
   * @param {SetStateAction<VaultGroup[]>} value - New group array or updater.
   */
  const setVaultGroups = (value: SetStateAction<VaultGroup[]>) =>
    dispatch({ type: "update", group: "library", key: "vaultGroups", value });
  /**
   * Update the library tag descriptions.
   * Changes flow through the shared vault dispatch.
   * @param {SetStateAction<Record<string, string>>} value - New tag catalog or updater.
   */
  const setTagCatalog = (value: SetStateAction<Record<string, string>>) =>
    dispatch({ type: "update", group: "library", key: "tagCatalog", value });
  /**
   * Update the per-group saved-tab order.
   * Changes flow through the shared vault dispatch.
   * @param {SetStateAction<Record<string, string[]>>} value - New order buckets or updater.
   */
  const setTabOrders = (value: SetStateAction<Record<string, string[]>>) =>
    dispatch({ type: "update", group: "library", key: "tabOrders", value });
  /**
   * Update saved searches within the current library.
   * Optional search state starts as an empty list.
   * @param {SetStateAction<SavedSearch[]>} value - New saved searches or updater.
   */
  const setSavedSearches = (value: SetStateAction<SavedSearch[]>) =>
    dispatch({
      type: "update",
      group: "library",
      key: "savedSearches",
      value: current =>
        typeof value === "function" ? value(current ?? []) : value,
    });
  /**
   * Update the preferred tab presentation mode.
   * Missing view state starts in standard mode.
   * @param {SetStateAction<LibraryViewMode>} value - New view mode or updater.
   */
  const setTabView = (value: SetStateAction<LibraryViewMode>) =>
    dispatch({
      type: "update",
      group: "preferences",
      key: "tabView",
      value: current =>
        typeof value === "function" ? value(current ?? "standard") : value,
    });
  const extensionContext = isExtensionContext();
  const [query, setQuery] = useState("");
  const [searchGroupFilter, setSearchGroupFilter] = useState<"all" | GroupId>(
    "all"
  );
  const [remoteSearch, setRemoteSearch] = useState<LocalSearchResponse | null>(
    null
  );
  const [isRemoteSearching, setIsRemoteSearching] = useState(false);
  const [remoteSearchError, setRemoteSearchError] = useState<string | null>(
    null
  );
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<GroupId>>(
    new Set()
  );
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [savedSearchName, setSavedSearchName] = useState("");
  const [semanticIndexStatus, setSemanticIndexStatus] =
    useState<SemanticIndexStatus | null>(null);
  const [serverOnline, setServerOnline] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>("local");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>();
  const [localServerUrl, setLocalServerUrl] = useState(
    DEFAULT_TABVAULT_SERVER_URL
  );
  const [serverApiKey, setServerApiKey] = useState(DEFAULT_TABVAULT_API_KEY);
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [editingTab, setEditingTab] = useState<VaultTab | null>(null);
  const [editingCollection, setEditingCollection] = useState<VaultGroup | null>(
    null
  );
  const [collectionPendingDelete, setCollectionPendingDelete] =
    useState<VaultGroup | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [visibilityNow, setVisibilityNow] = useState(() => Date.now());
  const [isRefreshingLibrary, setIsRefreshingLibrary] = useState(false);
  const [isQuickCleaning, setIsQuickCleaning] = useState(false);
  const libraryRefreshInFlight = useRef(false);
  const vaultRef = useRef<PersistedVault | null>(null);
  const tombstonesRef = useRef(
    vault.library.tombstones ?? { tabs: [] as string[], groups: [] as string[] }
  );
  const refreshLibraryRef = useRef<
    (options?: { silent?: boolean }) => Promise<void>
  >(async () => undefined);
  const propertySchemaRef = useRef(
    vault.propertySchema ?? DEFAULT_PROPERTY_SCHEMA
  );

  const {
    sensors,
    collisionDetectionStrategy,
    activeDragId,
    handleLibraryDragStart,
    handleLibraryDragOver,
    handleLibraryDragEnd,
    cancelLibraryDrag,
  } = useLibraryDrag({
    tabView,
    library: { tabs, tabOrders, setTabs, setTabOrders, vaultGroups },
    connection: {
      storageMode,
      serverOnline,
      setServerOnline,
      localServerUrl,
      serverApiKey,
    },
  });

  /**
   * Assemble the current browser vault for synchronization.
   * Refs supply the latest property schema and tombstones while visible state supplies tabs and preferences.
   * @returns {PersistedVault} Complete schema-v4 vault snapshot.
   */
  const currentVault = (): PersistedVault => ({
    schemaVersion: 4,
    propertySchema: propertySchemaRef.current,
    library: {
      tabs,
      vaultGroups,
      tagCatalog,
      tabOrders,
      savedSearches,
      tombstones: tombstonesRef.current,
    },
    preferences: { tabView },
  });

  const applyVault = useCallback(
    (vault: PersistedVault) => {
      propertySchemaRef.current = vault.propertySchema;
      tombstonesRef.current = vault.library.tombstones ?? {
        tabs: [],
        groups: [],
      };
      dispatch({ type: "replace", vault });
    },
    [dispatch]
  );
  vaultRef.current = currentVault();

  const sortByStoredOrder = useCallback(
    (items: VaultTab[]) =>
      sortTabs(items, { library: { vaultGroups, tabOrders } }),
    [tabOrders, vaultGroups]
  );

  const isArchivePage = location === "/archive";
  const isHiddenPage = location === "/hidden";
  const isAllTabsPage = !isArchivePage && !isHiddenPage;
  const workspaceLabel = isArchivePage
    ? "Archive"
    : isHiddenPage
      ? "Hidden"
      : "All Tabs";
  const isGroupBoard = tabView === "groups" && !isArchivePage && !isHiddenPage;
  const activeTabs = useMemo(
    () =>
      tabs.filter(
        tab => !tab.lifecycle.archived && !isCurrentlyHidden(tab, visibilityNow)
      ),
    [tabs, visibilityNow]
  );
  const hiddenTabs = useMemo(
    () => tabs.filter(tab => isCurrentlyHidden(tab, visibilityNow)),
    [tabs, visibilityNow]
  );
  const archivedTabs = useMemo(
    () => tabs.filter(tab => tab.lifecycle.archived),
    [tabs]
  );
  const selectedGroupTabs = sortByStoredOrder(
    isArchivePage
      ? archivedTabs
      : (isHiddenPage ? hiddenTabs : activeTabs).filter(
          tab =>
            searchGroupFilter === "all" ||
            tab.placement.groupId === searchGroupFilter
        )
  );
  const pageTabs = isArchivePage
    ? archivedTabs
    : isHiddenPage
      ? hiddenTabs
      : activeTabs;
  const visibleGroupIds =
    searchGroupFilter === "all"
      ? new Set(
          vaultGroups
            .filter(group => {
              const members = tabs.filter(
                tab => tab.placement.groupId === group.id
              );
              if (!members.length) return !isHiddenPage && !isArchivePage;
              return pageTabs.some(tab => tab.placement.groupId === group.id);
            })
            .map(group => group.id)
        )
      : new Set([searchGroupFilter]);
  const searchResponse = currentSearchResponse(
    remoteSearch,
    query,
    searchGroupFilter,
    isAllTabsPage
  );
  const semanticScores = useMemo(
    () =>
      new Map(
        searchResponse?.results.map(result => [result.tab.id, result.score]) ??
          []
      ),
    [searchResponse]
  );
  const visibleTabs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return selectedGroupTabs;
    if (searchResponse)
      return searchResultTabs(searchResponse.results, activeTabs, vaultGroups);
    return sortByStoredOrder(
      pageTabs.filter(
        tab =>
          (searchGroupFilter === "all" ||
            tab.placement.groupId === searchGroupFilter) &&
          [
            tab.content.title,
            tab.annotations.note,
            tab.annotations.agentReview,
            tab.content.domain,
            ...tab.annotations.tags,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalized)
      )
    );
  }, [
    activeTabs,
    selectedGroupTabs,
    query,
    pageTabs,
    vaultGroups,
    searchResponse,
    searchGroupFilter,
    sortByStoredOrder,
  ]);

  const {
    selection: {
      selectedResultIds,
      setSelectedResultIds,
      selectionMode,
      setSelectionMode,
      selectionActive,
      toggleResultSelection,
      toggleSelectionMode,
    },
    bulk: {
      bulkTag,
      setBulkTag,
      bulkMoveSelected,
      bulkTagSelected,
      permanentlyDeleteTabs,
      toggleSelectAll,
      removeSelected,
    },
    undo: { undoSnapshot, createUndoSnapshot, undoLastBulkAction },
  } = useLibrarySelection({
    library: {
      tabs,
      tabOrders,
      tagCatalog,
      setTabs,
      setTabOrders,
      setTagCatalog,
      recordTombstones: ids => {
        const tombstones = {
          ...tombstonesRef.current,
          tabs: Array.from(new Set([...tombstonesRef.current.tabs, ...ids])),
        };
        tombstonesRef.current = tombstones;
        dispatch({
          type: "update",
          group: "library",
          key: "tombstones",
          value: tombstones,
        });
      },
    },
    view: { visibleTabs, query, isArchivePage },
    connection: {
      storageMode,
      serverOnline,
      setServerOnline,
      localServerUrl,
      serverApiKey,
    },
  });

  useEffect(() => {
    const nextDeadline = tabs
      .filter(
        tab => !tab.lifecycle.archived && isCurrentlyHidden(tab, visibilityNow)
      )
      .map(tab => Date.parse(tab.lifecycle.hiddenUntil ?? ""))
      .filter(deadline => Number.isFinite(deadline))
      .sort((left, right) => left - right)[0];
    if (!nextDeadline) return;
    const timer = window.setTimeout(
      () => setVisibilityNow(Date.now()),
      Math.min(60_000, Math.max(0, nextDeadline - Date.now()) + 25)
    );
    return () => window.clearTimeout(timer);
  }, [tabs, visibilityNow]);

  useEffect(() => {
    if (location.startsWith("/collections") || location === "/all-tabs") {
      setLocation("/");
    }
  }, [location, setLocation]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      readSyncStatus(),
      readStorageMode(),
      readLibraryRefreshInterval(),
    ])
      .then(([savedSyncStatus, savedStorageMode, interval]) => {
        if (cancelled) return;
        setRefreshInterval(interval);
        setSyncStatus(savedSyncStatus);
        setStorageMode(savedStorageMode);
        setStorageReady(true);
      })
      .catch(() => {
        if (!cancelled) setStorageReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([readLocalServerUrl(), readApiKey()]).then(
      async ([url, apiKey]) => {
        if (cancelled) return;
        setLocalServerUrl(url);
        setServerApiKey(apiKey);
        try {
          const health = await checkLocalServer(url, apiKey);
          if (!cancelled) {
            setServerOnline(health.status === "ok");
            setSemanticIndexStatus(health.semanticIndex ?? null);
          }
        } catch {
          if (!cancelled) {
            setServerOnline(false);
            setSemanticIndexStatus(null);
          }
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!serverOnline) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void getSemanticIndexStatus(localServerUrl, serverApiKey)
        .then(status => {
          if (!cancelled) setSemanticIndexStatus(status);
        })
        .catch(() => {
          if (!cancelled) setServerOnline(false);
        });
    }, 3000);
    void getSemanticIndexStatus(localServerUrl, serverApiKey)
      .then(status => {
        if (!cancelled) setSemanticIndexStatus(status);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [serverOnline, localServerUrl, serverApiKey]);

  useEffect(() => {
    if (!storageReady || storageMode !== "backend" || !serverOnline) return;
    void refreshLibraryRef.current({ silent: true });
  }, [storageReady, storageMode, serverOnline, localServerUrl, serverApiKey]);

  useEffect(() => {
    if (
      !storageReady ||
      storageMode !== "backend" ||
      !serverOnline ||
      refreshInterval < 60
    )
      return;
    const timer = window.setInterval(() => {
      void refreshLibraryRef.current({ silent: true });
    }, refreshInterval * 1000);
    return () => window.clearInterval(timer);
  }, [
    storageReady,
    storageMode,
    serverOnline,
    refreshInterval,
    localServerUrl,
    serverApiKey,
  ]);

  useEffect(() => {
    const searchTerm = query.trim();
    if (!searchTerm) {
      setRemoteSearch(null);
      setRemoteSearchError(null);
      setIsRemoteSearching(false);
      return;
    }
    if (
      isArchivePage ||
      isHiddenPage ||
      storageMode !== "backend" ||
      !serverOnline
    ) {
      setRemoteSearch(null);
      setRemoteSearchError(
        extensionContext
          ? "Configured server unavailable"
          : "Browser storage uses local matching"
      );
      setIsRemoteSearching(false);
      return;
    }
    let cancelled = false;
    setIsRemoteSearching(true);
    const timer = window.setTimeout(() => {
      void searchLocalServer(
        localServerUrl,
        searchTerm,
        searchGroupFilter === "all" ? undefined : searchGroupFilter,
        serverApiKey
      )
        .then(response => {
          if (!cancelled) {
            setRemoteSearch(response);
            setRemoteSearchError(null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setRemoteSearch(null);
            setRemoteSearchError("Local server search failed");
            setServerOnline(false);
          }
        })
        .finally(() => {
          if (!cancelled) setIsRemoteSearching(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    query,
    extensionContext,
    storageMode,
    serverOnline,
    localServerUrl,
    searchGroupFilter,
    serverApiKey,
    isArchivePage,
    isHiddenPage,
  ]);

  useEffect(() => {
    setSelectedResultIds(new Set());
    setActiveResultIndex(0);
  }, [query, searchGroupFilter, setSelectedResultIds]);

  /**
   * Merge the browser library with the connected server.
   * Ignores overlapping requests and backend-offline states; silent refresh suppresses UI progress and toasts.
   * @param {{ silent?: boolean; } | undefined} options - Whether to suppress progress and success messages.
   * @returns {Promise<void>} Resolves after the action finishes.
   */
  const refreshLibrary = async (options?: { silent?: boolean }) => {
    if (
      storageMode !== "backend" ||
      !serverOnline ||
      libraryRefreshInFlight.current
    )
      return;
    libraryRefreshInFlight.current = true;
    if (!options?.silent) setIsRefreshingLibrary(true);
    try {
      const { vault } = await refreshLibraryFromServer(
        localServerUrl,
        serverApiKey,
        vaultRef.current ?? currentVault()
      );
      applyVault(vault);
      if (!options?.silent) {
        toast.success("Library refreshed", {
          description: `${vault.library.tabs.length} tabs merged with the server.`,
        });
      }
    } catch {
      if (!options?.silent)
        toast.error("Could not refresh tabs and collections");
    } finally {
      libraryRefreshInFlight.current = false;
      if (!options?.silent) setIsRefreshingLibrary(false);
    }
  };
  refreshLibraryRef.current = refreshLibrary;

  /**
   * Store the active query and group filter as a named search.
   * Rejects an empty query and uses it as the name when no name was entered.
   */
  const saveCurrentSearch = () => {
    const cleanName = savedSearchName.trim() || query.trim();
    if (!cleanName || !query.trim()) {
      toast.error("Enter a search before saving a view");
      return;
    }
    const view: SavedSearch = {
      id: crypto.randomUUID(),
      name: cleanName,
      query: query.trim(),
      groupId: searchGroupFilter,
    };
    setSavedSearches(current => [...current, view]);
    setSavedSearchName("");
    setShowSavedSearches(false);
    toast.success(`Saved “${cleanName}”`);
  };

  /**
   * Restore a saved query and group filter.
   * Closes the saved-search picker after applying the view.
   * @param {SavedSearch} view - Saved search to activate.
   */
  const applySavedSearch = (view: SavedSearch) => {
    setQuery(view.query);
    setSearchGroupFilter(view.groupId);
    setShowSavedSearches(false);
    toast.success(`Applied “${view.name}”`);
  };

  /**
   * Archive one tab, or permanently delete it from the Archive page.
   * Normal-page removal records undo state and removes the tab from group order.
   * @param {VaultTab} tab - Tab targeted by the delete action.
   * @returns {Promise<void>} Resolves after the action finishes.
   */
  const deleteTab = async (tab: VaultTab) => {
    if (isArchivePage) {
      await permanentlyDeleteTabs([tab]);
      return;
    }
    createUndoSnapshot("archiving 1 tab");
    const archivedAt = new Date().toISOString();
    setTabs(current =>
      current.map(item =>
        item.id === tab.id
          ? {
              ...item,
              placement: { ...item.placement, groupId: null },
              lifecycle: { ...item.lifecycle, archived: true, archivedAt },
              timestamps: {
                ...item.timestamps,
                updatedAt: new Date().toISOString(),
              },
            }
          : item
      )
    );
    setTabOrders(
      current =>
        Object.fromEntries(
          Object.entries(current).map(([groupId, orderedIds]) => [
            groupId,
            orderedIds.filter(id => id !== tab.id),
          ])
        ) as Record<GroupId, string[]>
    );
    setSelectedResultIds(current => {
      const next = new Set(current);
      next.delete(tab.id);
      return next;
    });
    if (storageMode === "backend" && serverOnline) {
      await updateTabOnLocalServer(
        localServerUrl,
        tab.id,
        { lifecycle: { archived: true }, placement: { groupId: null } },
        serverApiKey
      );
    }
    toast.success(`Archived “${tab.content.title}”`);
  };

  /**
   * Apply one tab visibility transition locally and on the server.
   * Server failures mark the connection offline; the local state remains available.
   * @param {VaultTab} tab - Tab being changed.
   * @param {Pick<VaultTab, "hiddenUntil" | "archived" | "archivedAt"> & Partial<Pick<VaultTab, "groupId">>} changes - Visibility and optional group fields to replace.
   * @param {string} message - Success text shown to the user.
   */
  const patchTabVisibility = (
    tab: VaultTab,
    changes: Pick<VaultTab, "lifecycle"> & Partial<Pick<VaultTab, "placement">>,
    message: string
  ) => {
    setTabs(current =>
      current.map(item =>
        item.id === tab.id
          ? patchTab(item, {
              ...changes,
              timestamps: { updatedAt: new Date().toISOString() },
            })
          : item
      )
    );
    if (storageMode === "backend" && serverOnline) {
      const updates: Record<string, unknown> = {};
      if ("hiddenUntil" in changes) updates.hiddenUntil = changes.hiddenUntil;
      if ("archived" in changes) updates.archived = changes.archived;
      if ("groupId" in changes) updates.groupId = changes.groupId;
      void updateTabOnLocalServer(
        localServerUrl,
        tab.id,
        updates,
        serverApiKey
      ).catch(() => setServerOnline(false));
    }
    toast.success(message);
  };

  /**
   * Hide a tab for a duration starting now.
   * Preserves archive fields while setting a future hide deadline.
   * @param {VaultTab} tab - Tab to hide.
   * @param {number} durationMs - Duration in milliseconds.
   */
  const hideTabFor = (tab: VaultTab, durationMs: number) =>
    patchTabVisibility(
      tab,
      {
        lifecycle: {
          hiddenUntil: new Date(Date.now() + durationMs).toISOString(),
          archived: Boolean(tab.lifecycle.archived),
          archivedAt: tab.lifecycle.archivedAt,
        },
      },
      `Hidden “${tab.content.title}”`
    );

  /**
   * Extend a tab hide deadline without shortening it.
   * Starts from the later of the current deadline and now.
   * @param {VaultTab} tab - Hidden tab to prolong.
   * @param {number} durationMs - Additional duration in milliseconds.
   */
  const prolongTabFor = (tab: VaultTab, durationMs: number) => {
    const currentDeadline = Date.parse(tab.lifecycle.hiddenUntil ?? "");
    const base = Number.isFinite(currentDeadline)
      ? Math.max(Date.now(), currentDeadline)
      : Date.now();
    patchTabVisibility(
      tab,
      {
        lifecycle: {
          hiddenUntil: new Date(base + durationMs).toISOString(),
          archived: Boolean(tab.lifecycle.archived),
          archivedAt: tab.lifecycle.archivedAt,
        },
      },
      `Prolonged “${tab.content.title}”`
    );
  };

  /**
   * Clear a tab hide deadline.
   * Preserves the tab’s archive state.
   * @param {VaultTab} tab - Tab to make visible.
   */
  const unhideTab = (tab: VaultTab) =>
    patchTabVisibility(
      tab,
      {
        lifecycle: {
          hiddenUntil: null,
          archived: Boolean(tab.lifecycle.archived),
          archivedAt: tab.lifecycle.archivedAt,
        },
      },
      `Unhidden “${tab.content.title}”`
    );

  /**
   * Restore an archived tab to the unassigned bucket.
   * Clears archive fields and places the restored tab first in unassigned order.
   * @param {VaultTab} tab - Archived tab to restore.
   */
  const restoreTab = (tab: VaultTab) => {
    patchTabVisibility(
      tab,
      {
        placement: { groupId: null },
        lifecycle: {
          archived: false,
          archivedAt: null,
          hiddenUntil: tab.lifecycle.hiddenUntil,
        },
      },
      `Restored “${tab.content.title}”`
    );
    setTabOrders(current => ({
      ...current,
      unassigned: [
        tab.id,
        ...(current.unassigned ?? []).filter(id => id !== tab.id),
      ],
    }));
  };

  /**
   * Change hide state for all active tabs in a group.
   * Applies local updates first and reports partial server failures because the API writes each member separately.
   * @param {string} groupId - Group ID, including the unassigned bucket.
   * @param {"hide" | "unhide" | "prolong"} action - Hide, unhide, or prolong action.
   * @param {number} durationMs - Duration in milliseconds for hide or prolong.
   * @returns {Promise<void>} Resolves after the action finishes.
   */
  const changeGroupVisibility = async (
    groupId: string,
    action: "hide" | "unhide" | "prolong",
    durationMs = 0
  ) => {
    const members = tabs.filter(
      tab =>
        !tab.lifecycle.archived &&
        (groupId === "unassigned"
          ? tab.placement.groupId === null
          : tab.placement.groupId === groupId)
    );
    const updates = members.map(tab => {
      if (action === "unhide") return { tab, hiddenUntil: null };
      const currentDeadline = Date.parse(tab.lifecycle.hiddenUntil ?? "");
      const base =
        action === "prolong" && Number.isFinite(currentDeadline)
          ? Math.max(Date.now(), currentDeadline)
          : Date.now();
      return {
        tab,
        hiddenUntil: new Date(base + durationMs).toISOString(),
      };
    });
    setTabs(current =>
      current.map(tab => {
        const update = updates.find(item => item.tab.id === tab.id);
        return update
          ? {
              ...tab,
              lifecycle: { ...tab.lifecycle, hiddenUntil: update.hiddenUntil },
              timestamps: {
                ...tab.timestamps,
                updatedAt: new Date().toISOString(),
              },
            }
          : tab;
      })
    );
    let failures = 0;
    if (storageMode === "backend" && serverOnline) {
      const results = await Promise.allSettled(
        updates.map(({ tab, hiddenUntil }) =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            { lifecycle: { hiddenUntil } },
            serverApiKey
          )
        )
      );
      failures = results.filter(result => result.status === "rejected").length;
      if (failures) setServerOnline(false);
    }
    const completed = updates.length - failures;
    if (failures)
      toast.error(`${completed} updated, ${failures} failed`, {
        description: "The group action used one request per Saved Tab.",
      });
    else
      toast.success(
        `${updates.length} tab${updates.length === 1 ? "" : "s"} updated`
      );
  };

  /**
   * Mirror a completed dedupe mutation into local vault state.
   * Archiving a duplicate also removes it from every tab-order bucket.
   * @param {DedupeMutation} mutation - Mutation already accepted by the executor.
   */
  const applyDedupeMutation = (mutation: DedupeMutation) => {
    const now = new Date().toISOString();
    setTabs(
      current =>
        current.map(tab =>
          tab.id === mutation.id
            ? mutation.role === "duplicate"
              ? {
                  ...tab,
                  placement: { ...tab.placement, groupId: null },
                  lifecycle: {
                    ...tab.lifecycle,
                    archived: true,
                    archivedAt: now,
                  },
                  timestamps: { ...tab.timestamps, updatedAt: now },
                }
              : patchTab(tab, {
                  ...mutation.updates,
                  timestamps: { updatedAt: now },
                })
            : tab
        ) as VaultTab[]
    );
    if (mutation.role === "duplicate")
      setTabOrders(
        current =>
          Object.fromEntries(
            Object.entries(current).map(([groupId, ids]) => [
              groupId,
              ids.filter(id => id !== mutation.id),
            ])
          ) as Record<string, string[]>
      );
  };

  /**
   * Plan and confirm exact duplicate cleanup.
   * Updates the survivor before archiving duplicates, and reports individual failures without losing other clusters.
   * @returns {Promise<void>} Resolves after the action finishes.
   */
  const quickClean = async () => {
    setIsQuickCleaning(true);
    try {
      const plan = await buildQuickCleanPlan(activeTabs);
      if (!plan.clusters.length) {
        toast("No exact duplicate records found");
        return;
      }
      const duplicateCount = plan.clusters.reduce(
        (count, cluster) => count + cluster.duplicateIds.length,
        0
      );
      if (
        !window.confirm(
          `Quick Clean will archive ${duplicateCount} duplicate Saved Tab${duplicateCount === 1 ? "" : "s"}. Continue?`
        )
      )
        return;
      const result = await executeDedupePlan(
        plan,
        async mutation => {
          if (storageMode === "backend" && serverOnline)
            await updateTabOnLocalServer(
              localServerUrl,
              mutation.id,
              mutation.updates,
              serverApiKey
            );
        },
        applyDedupeMutation
      );
      if (result.failed)
        toast.error(
          `${result.succeeded} changes saved, ${result.failed} failed`
        );
      else toast.success(`Archived ${duplicateCount} duplicate occurrence(s)`);
    } finally {
      setIsQuickCleaning(false);
    }
  };

  /**
   * Handle keyboard navigation in search results.
   *
   * Arrow keys cycle through visible tabs; Enter opens one; Escape clears the query and releases focus.
   * @param {React.KeyboardEvent<HTMLInputElement>} event - Keyboard event from the search input.
   */
  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (!query || !visibleTabs.length) {
      if (event.key === "Escape") {
        setQuery("");
        event.currentTarget.blur();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResultIndex(current => (current + 1) % visibleTabs.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResultIndex(
        current => (current - 1 + visibleTabs.length) % visibleTabs.length
      );
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const tab =
        visibleTabs[Math.min(activeResultIndex, visibleTabs.length - 1)];
      if (tab) void openSavedTab(tab);
    }
    if (event.key === "Escape") {
      setQuery("");
      event.currentTarget.blur();
    }
  };

  /**
   * Move a saved tab to another collection.
   *
   * Update local membership and ordering immediately, then mirror membership to the connected server.
   * @param {string} tabId - Identifier of the tab to move.
   * @param {string | null} groupId - Destination collection ID, or null for Unassigned.
   */
  const moveTab = (tabId: string, groupId: GroupId | null) => {
    const sourceGroup = tabs.find(tab => tab.id === tabId)?.placement.groupId;
    const destination =
      vaultGroups.find(group => group.id === groupId)?.details.name ??
      "Unassigned";
    setTabs(current =>
      current.map(tab =>
        tab.id === tabId
          ? {
              ...tab,
              placement: { ...tab.placement, groupId },
              timestamps: {
                ...tab.timestamps,
                updatedAt: new Date().toISOString(),
              },
            }
          : tab
      )
    );
    setTabOrders(current => {
      const withoutTab = Object.fromEntries(
        Object.entries(current).map(([id, orderedIds]) => [
          id,
          orderedIds.filter(id => id !== tabId),
        ])
      ) as Record<GroupId, string[]>;
      return {
        ...withoutTab,
        ...(sourceGroup
          ? { [sourceGroup]: withoutTab[sourceGroup] ?? [] }
          : {}),
        [orderKey(groupId)]: [...(withoutTab[orderKey(groupId)] ?? []), tabId],
      };
    });
    toast.success(`Moved to ${destination}`, {
      description: "The local index is updated.",
    });
    if (storageMode === "backend" && serverOnline)
      void updateTabOnLocalServer(
        localServerUrl,
        tabId,
        { placement: { groupId } },
        serverApiKey
      ).catch(() => setServerOnline(false));
  };

  /**
   * Save the active browser tab as a new session occurrence.
   *
   * Accept only HTTP(S) pages, create a local session and tab first, then mirror both to the server when available; leave the browser tab open.
   * @param {ChromeTabSnapshot | undefined} providedTab - Optional tab snapshot supplied by the extension message.
   * @returns {Promise<void>} Resolves after the save attempt and user feedback.
   */
  const captureCurrentTab = async (providedTab?: ChromeTabSnapshot) => {
    if (!extensionContext) {
      toast.error("Active-tab capture is available in the Chrome extension");
      return;
    }
    const activeTab = providedTab ?? (await getActiveChromeTab());
    if (!activeTab?.url) {
      toast.error("No active web tab is available to save");
      return;
    }
    if (activeTab?.url && !/^https?:\/\//i.test(activeTab.url)) {
      toast.error("TabVault saves http and https pages only", {
        description: "Chrome internal pages are not part of the link library.",
      });
      return;
    }
    const url = activeTab.url;
    const title = activeTab.title?.trim() || "Browser capture — current tab";
    const capturedAt = new Date();
    const now = capturedAt.toISOString();
    const sessionGroup = createSessionGroup(capturedAt);
    const newTab: VaultTab = {
      id: crypto.randomUUID(),
      placement: { groupId: sessionGroup.id },
      content: {
        title,
        url,
        domain: domainFromUrl(url),
        color: "#F05A28",
        icon: "●",
      },
      annotations: {
        note: "",
        agentReview: "",
        viewed: false,
        customProperties: { viewed: false },
        tags: [],
      },
      timestamps: { createdAt: now, updatedAt: now },
      lifecycle: { archived: false, archivedAt: null },
    };
    setVaultGroups(current => [sessionGroup, ...current]);
    setTabs(current => [newTab, ...current]);
    setTabOrders(current => ({
      ...current,
      [sessionGroup.id]: [newTab.id],
    }));
    setSearchGroupFilter("all");
    if (storageMode === "backend" && serverOnline) {
      try {
        await createGroupOnLocalServer(
          localServerUrl,
          {
            id: sessionGroup.id,
            details: {
              name: sessionGroup.details.name,
              description: sessionGroup.details.description,
              category: sessionGroup.details.category,
              color: sessionGroup.details.accent,
            },
            timestamps: {
              createdAt: sessionGroup.timestamps.createdAt,
              updatedAt: sessionGroup.timestamps.updatedAt,
            },
          },
          serverApiKey
        );
        await saveTabToLocalServer(
          localServerUrl,
          {
            id: newTab.id,
            content: { url, title },
            annotations: {
              note: newTab.annotations.note,
              agentReview: newTab.annotations.agentReview,
              viewed: newTab.annotations.viewed,
              tags: newTab.annotations.tags,
            },
            placement: { groupId: sessionGroup.id },
          },
          serverApiKey
        );
        toast.success("Saved as a new occurrence", {
          description:
            "The active tab is stored in both the local index and offline extension cache.",
        });
        return;
      } catch {
        setServerOnline(false);
      }
    }
    toast.success("Saved as a new occurrence", {
      description:
        "Stored in the extension cache. The local server is unavailable.",
    });
  };

  const captureCurrentTabRef = useRef(captureCurrentTab);
  captureCurrentTabRef.current = captureCurrentTab;

  useRegisterLibrarySidebar({
    counts: {
      activeCount: activeTabs.length,
      archivedCount: archivedTabs.length,
      hiddenCount: hiddenTabs.length,
      tagCount: Object.keys(tagCatalog).length,
    },
    connection: {
      storageMode,
      serverOnline,
      isRefreshing: isRefreshingLibrary,
    },
    actions: {
      onOpenTags: () => setShowTagManager(true),
      onRefreshLibrary: () => void refreshLibrary(),
      onCaptureTab: extensionContext
        ? () => void captureCurrentTab()
        : undefined,
    },
  });

  useEffect(() => {
    if (sessionStorage.getItem(LIBRARY_OPEN_TAGS_FLAG) !== "1") return;
    sessionStorage.removeItem(LIBRARY_OPEN_TAGS_FLAG);
    setShowTagManager(true);
  }, []);

  useEffect(() => {
    if (!extensionContext) return;
    return addExtensionMessageListener(message => {
      const captureMessage = message as {
        type?: string;
        tab?: ChromeTabSnapshot;
      };
      if (captureMessage.type === "TABVAULT_CAPTURE_ACTIVE")
        void captureCurrentTabRef.current(captureMessage.tab);
      if (
        captureMessage.type === "TABVAULT_LIBRARY_UPDATED" ||
        captureMessage.type === "TABVAULT_LIBRARY_REFRESHED"
      ) {
        void readBrowserVault().then(saved => {
          if (
            saved?.library.tabs &&
            saved.library.vaultGroups &&
            saved.library.tagCatalog &&
            saved.library.tabOrders
          ) {
            applyVault(saved);
            if (captureMessage.type === "TABVAULT_LIBRARY_UPDATED")
              toast.success("Fast-saved tabs added to a new Session");
          }
        });
      }
    });
  }, [extensionContext, applyVault]);

  /**
   * Create an empty manual collection.
   *
   * Add it to local state and ordering, then mirror it to the connected server when available.
   */
  const createGroup = () => {
    const createdAt = new Date();
    const name = sessionName(createdAt);
    const id = crypto.randomUUID();
    const now = createdAt.toISOString();
    const group: VaultGroup = {
      id,
      details: { name, description: "", category: "manual", accent: "#8a9c92" },
      timestamps: { createdAt: now, updatedAt: now },
    };
    setVaultGroups(current => [group, ...current]);
    if (storageMode === "backend" && serverOnline)
      void createGroupOnLocalServer(
        localServerUrl,
        {
          id: group.id,
          details: {
            name: group.details.name,
            description: group.details.description,
            category: "manual",
            color: group.details.accent,
          },
          timestamps: {
            createdAt: group.timestamps.createdAt,
            updatedAt: group.timestamps.updatedAt,
          },
        },
        serverApiKey
      ).catch(() => setServerOnline(false));
    setTabOrders(current => ({ ...current, [id]: [] }));
    toast.success(`“${name}” is ready`, {
      description: "You can now drag a tab onto its collection row.",
    });
  };

  /**
   * Save edits to the selected collection.
   *
   * Require a nonempty name, normalize editable fields, and update local state before attempting server persistence.
   * @returns {Promise<void>} Resolves after the server update attempt.
   */
  const saveCollection = async () => {
    if (!editingCollection) return;
    const name = editingCollection.details.name.trim();
    if (!name) {
      toast.error("A collection needs a name");
      return;
    }
    const category = editingCollection.details.category.trim() || "manual";
    setVaultGroups(current =>
      current.map(group =>
        group.id === editingCollection.id
          ? {
              ...editingCollection,
              details: {
                ...editingCollection.details,
                name,
                description: editingCollection.details.description.trim(),
                category,
              },
              timestamps: {
                ...editingCollection.timestamps,
                updatedAt: new Date().toISOString(),
              },
            }
          : group
      )
    );
    if (storageMode === "backend" && serverOnline) {
      await updateGroupOnLocalServer(
        localServerUrl,
        editingCollection.id,
        {
          details: {
            name,
            description: editingCollection.details.description.trim(),
            category,
          },
        },
        serverApiKey
      ).catch(() => setServerOnline(false));
    }
    toast.success("Collection updated", {
      description: "Its name and agent-facing description are saved.",
    });
    setEditingCollection(null);
  };

  /**
   * Get tabs in a collection in their stored order.
   *
   * Filter current tabs by collection ID before applying the saved ordering.
   * @param {string} groupId - Collection identifier to filter by.
   * @returns {VaultTab[]} Tabs belonging to the collection in display order.
   */
  const tabsForCollection = (groupId: GroupId) =>
    sortByStoredOrder(tabs.filter(tab => tab.placement.groupId === groupId));

  /**
   * Set one tab's viewed state.
   *
   * Update the local record and timestamp, then mirror the flag to the connected server when available.
   * @param {string} tabId - Identifier of the tab to update.
   * @param {boolean} viewed - Whether the tab has been viewed.
   */
  const setTabViewed = (tabId: string, viewed: boolean) => {
    setTabs(current =>
      current.map(tab =>
        tab.id === tabId
          ? {
              ...tab,
              annotations: { ...tab.annotations, viewed },
              timestamps: {
                ...tab.timestamps,
                updatedAt: new Date().toISOString(),
              },
            }
          : tab
      )
    );
    if (storageMode === "backend" && serverOnline)
      void updateTabOnLocalServer(
        localServerUrl,
        tabId,
        { annotations: { viewed } },
        serverApiKey
      ).catch(() => setServerOnline(false));
  };

  /**
   * Mark successfully opened page URLs as viewed.
   *
   * Update matching local tabs and send updates for nonarchived matches to the server; failed remote writes mark it offline.
   * @param {string[]} openedUrls - URLs confirmed opened by the browser.
   */
  const markOpenedUrlsViewed = (openedUrls: string[]) => {
    const opened = new Set(openedUrls);
    const affected = tabs.filter(
      tab => !tab.lifecycle.archived && opened.has(tab.content.url)
    );
    setTabs(current =>
      current.map(tab =>
        opened.has(tab.content.url)
          ? {
              ...tab,
              annotations: { ...tab.annotations, viewed: true },
              timestamps: {
                ...tab.timestamps,
                updatedAt: new Date().toISOString(),
              },
            }
          : tab
      )
    );
    if (storageMode === "backend" && serverOnline)
      void Promise.allSettled(
        affected.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            { annotations: { viewed: true } },
            serverApiKey
          )
        )
      ).then(results => {
        if (results.some(result => result.status === "rejected"))
          setServerOnline(false);
      });
  };

  /**
   * Open a saved tab and mark it viewed on success.
   *
   * Show an error if the browser blocks the new tab; an optional URL can override the stored opening target.
   * @param {VaultTab} tab - Saved tab whose viewed state may change.
   * @param {string} url - URL to open, defaulting to the tab URL.
   * @returns {Promise<void>} Resolves after the browser open attempt.
   */
  const openSavedTab = async (tab: VaultTab, url = tab.content.url) => {
    const result = await openTabUrls([url]);
    if (result.openedCount) {
      markOpenedUrlsViewed([tab.content.url]);
      return;
    }
    toast.error("The browser blocked this tab");
  };

  /**
   * Open every tab in a collection.
   *
   * Only URLs the browser reports as opened are marked viewed; report partial popup blocking.
   * @param {VaultGroup} group - Collection whose saved tabs should be opened.
   * @returns {Promise<void>} Resolves after the browser open attempt.
   */
  const openCollectionTabs = async (group: VaultGroup) => {
    const collectionTabs = tabsForCollection(group.id);
    if (!collectionTabs.length) {
      toast("This collection is empty");
      return;
    }
    const result = await openTabUrls(
      collectionTabs.map(tab => tab.content.url)
    );
    markOpenedUrlsViewed(result.openedUrls ?? []);
    if (result.openedCount === result.requestedCount) {
      toast.success(
        `Opened ${result.openedCount} tab${result.openedCount === 1 ? "" : "s"}`
      );
      return;
    }
    toast.error(
      `Opened ${result.openedCount} of ${result.requestedCount} tabs`,
      {
        description:
          "Your browser blocked some new tabs. Allow pop-ups for TabVault, then try again.",
      }
    );
  };

  /**
   * Copy a collection's links as Markdown.
   *
   * Include the collection heading and ordered tab links; report clipboard permission failures.
   * @param {VaultGroup} group - Collection to export to the clipboard.
   * @returns {Promise<void>} Resolves after the clipboard attempt.
   */
  const shareCollectionAsMarkdown = async (group: VaultGroup) => {
    const collectionTabs = tabsForCollection(group.id);
    const markdown = [
      `# ${group.details.name}`,
      "",
      ...collectionTabs.map(
        tab => `- [${tab.content.title}](${tab.content.url})`
      ),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success("Markdown copied", {
        description: `${collectionTabs.length} link${collectionTabs.length === 1 ? "" : "s"} from ${group.details.name}.`,
      });
    } catch {
      toast.error("Clipboard permission was unavailable");
    }
  };

  /**
   * Delete a collection while retaining its tabs in the archive.
   *
   * Record a tombstone, archive and unassign member tabs locally, clear their ordering and selection, then mirror deletion when connected.
   * @param {VaultGroup} group - Collection to delete.
   */
  const deleteCollection = (group: VaultGroup) => {
    const tombstones = {
      ...tombstonesRef.current,
      groups: Array.from(new Set([...tombstonesRef.current.groups, group.id])),
    };
    tombstonesRef.current = tombstones;
    dispatch({
      type: "update",
      group: "library",
      key: "tombstones",
      value: tombstones,
    });
    const movedTabs = tabs.filter(tab => tab.placement.groupId === group.id);
    const movedTabIds = new Set(movedTabs.map(tab => tab.id));
    setTabs(current =>
      current.map(tab =>
        tab.placement.groupId === group.id
          ? {
              ...tab,
              placement: { ...tab.placement, groupId: null },
              lifecycle: {
                ...tab.lifecycle,
                archived: true,
                archivedAt: new Date().toISOString(),
              },
              timestamps: {
                ...tab.timestamps,
                updatedAt: new Date().toISOString(),
              },
            }
          : tab
      )
    );
    setTabOrders(current => {
      const remaining = Object.fromEntries(
        Object.entries(current).filter(([id]) => id !== group.id)
      ) as Record<string, string[]>;
      return {
        ...remaining,
        unassigned: (remaining.unassigned ?? []).filter(
          id => !movedTabIds.has(id)
        ),
      };
    });
    setVaultGroups(current => current.filter(item => item.id !== group.id));
    setSelectedResultIds(
      current => new Set(Array.from(current).filter(id => !movedTabIds.has(id)))
    );
    setCollectionPendingDelete(null);
    setSearchGroupFilter("all");
    if (storageMode === "backend" && serverOnline)
      void deleteGroupOnLocalServer(
        localServerUrl,
        group.id,
        serverApiKey
      ).catch(() => setServerOnline(false));
    toast.success(`Deleted ${group.details.name}`, {
      description: `${movedTabs.length} tab${movedTabs.length === 1 ? "" : "s"} archived and Unassigned.`,
    });
  };

  /**
   * Request deletion of a collection.
   *
   * Require confirmation when it still contains tabs; delete empty collections immediately.
   * @param {VaultGroup} group - Collection selected for deletion.
   */
  const requestCollectionDelete = (group: VaultGroup) => {
    if (tabs.some(tab => tab.placement.groupId === group.id)) {
      setCollectionPendingDelete(group);
      return;
    }
    deleteCollection(group);
  };

  /**
   * Open an editable copy of a saved tab.
   *
   * Clone the tag array so draft edits cannot mutate the current saved record.
   * @param {VaultTab} tab - Saved tab to edit.
   */
  const openTabEditor = (tab: VaultTab) =>
    setEditingTab({
      ...tab,
      annotations: { ...tab.annotations, tags: [...tab.annotations.tags] },
    });

  /**
   * Save the edited tab fields.
   *
   * Require a title and absolute HTTP(S) URL, normalize tags and text locally, then mirror the update when connected.
   */
  const saveTab = () => {
    if (!editingTab) return;
    const title = editingTab.content.title.trim();
    const url = editingTab.content.url.trim();
    if (!title || !url) {
      toast.error("A title and URL are required");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Use an absolute http:// or https:// URL");
      return;
    }
    const updatedTab = {
      ...editingTab,
      content: {
        ...editingTab.content,
        title,
        url,
        domain: domainFromUrl(url),
      },
      annotations: {
        ...editingTab.annotations,
        note: editingTab.annotations.note.trim(),
        agentReview: editingTab.annotations.agentReview.trim(),
        tags: editingTab.annotations.tags
          .map(tag => tag.trim())
          .filter(Boolean),
      },
      timestamps: {
        ...editingTab.timestamps,
        updatedAt: new Date().toISOString(),
      },
    };
    setTabs(current =>
      current.map(tab => (tab.id === updatedTab.id ? updatedTab : tab))
    );
    setTagCatalog(current =>
      updatedTab.annotations.tags.reduce(
        (next, tag) => ({ ...next, [tag]: next[tag] ?? "" }),
        current
      )
    );
    if (storageMode === "backend" && serverOnline)
      void updateTabOnLocalServer(
        localServerUrl,
        updatedTab.id,
        {
          content: {
            url: updatedTab.content.url,
            title: updatedTab.content.title,
          },
          annotations: {
            note: updatedTab.annotations.note,
            agentReview: updatedTab.annotations.agentReview,
            viewed: updatedTab.annotations.viewed,
            customProperties: updatedTab.annotations.customProperties,
            tags: updatedTab.annotations.tags,
          },
          placement: { groupId: updatedTab.placement.groupId },
          lifecycle: { hiddenUntil: updatedTab.lifecycle.hiddenUntil ?? null },
        },
        serverApiKey
      ).catch(() => setServerOnline(false));
    toast.success("Tab updated", {
      description: "Your local index and tags reflect the new details.",
    });
    setEditingTab(null);
  };

  /**
   * Add the draft tag to the tab editor.
   *
   * Ignore blank or case-insensitive duplicate names and clear the draft afterward.
   */
  const addTagToTab = () => {
    const value = tagDraft.trim();
    if (!value || !editingTab) return;
    if (
      editingTab.annotations.tags.some(
        tag => tag.toLowerCase() === value.toLowerCase()
      )
    ) {
      setTagDraft("");
      return;
    }
    setEditingTab({
      ...editingTab,
      annotations: {
        ...editingTab.annotations,
        tags: [...editingTab.annotations.tags, value],
      },
    });
    setTagDraft("");
  };

  const tagSuggestions = useMemo(() => {
    const normalized = tagDraft.trim().toLowerCase();
    if (!editingTab) return [];
    return Object.keys(tagCatalog)
      .filter(
        tag =>
          !editingTab.annotations.tags.some(
            existing => existing.toLowerCase() === tag.toLowerCase()
          )
      )
      .filter(tag => !normalized || tag.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [editingTab, tagCatalog, tagDraft]);

  /**
   * Rename a tag across the catalog and saved tabs.
   *
   * Preserve its description, update affected tabs locally, and mirror their tag lists when connected.
   * @param {string} oldName - Existing tag name.
   * @param {string} nextName - Requested replacement name before trimming.
   */
  const renameTag = (oldName: string, nextName: string) => {
    const cleanName = nextName.trim();
    if (!cleanName || cleanName === oldName) return;
    setTagCatalog(current => {
      const { [oldName]: description = "", ...rest } = current;
      return { ...rest, [cleanName]: description };
    });
    const affected = tabs.filter(tab => tab.annotations.tags.includes(oldName));
    setTabs(current =>
      current.map(tab => ({
        ...tab,
        annotations: {
          ...tab.annotations,
          tags: tab.annotations.tags.map(tag =>
            tag === oldName ? cleanName : tag
          ),
        },
        timestamps: {
          ...tab.timestamps,
          updatedAt: tab.annotations.tags.includes(oldName)
            ? new Date().toISOString()
            : tab.timestamps.updatedAt,
        },
      }))
    );
    if (storageMode === "backend" && serverOnline)
      void Promise.allSettled(
        affected.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            {
              annotations: {
                tags: tab.annotations.tags.map(tag =>
                  tag === oldName ? cleanName : tag
                ),
              },
            },
            serverApiKey
          )
        )
      ).then(results => {
        const failed = results.filter(
          result => result.status === "rejected"
        ).length;
        if (failed) toast.error(`${failed} tab tag update(s) failed`);
      });
    toast.success("Tag renamed", {
      description: `“${oldName}” is now “${cleanName}”.`,
    });
  };

  /**
   * Remove a tag from the catalog and saved tabs.
   *
   * Update local tab timestamps and mirror affected tag lists when connected.
   * @param {string} name - Tag name to remove.
   */
  const removeTag = (name: string) => {
    const affected = tabs.filter(tab => tab.annotations.tags.includes(name));
    setTagCatalog(current => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setTabs(current =>
      current.map(tab => ({
        ...tab,
        annotations: {
          ...tab.annotations,
          tags: tab.annotations.tags.filter(tag => tag !== name),
        },
        timestamps: {
          ...tab.timestamps,
          updatedAt: tab.annotations.tags.includes(name)
            ? new Date().toISOString()
            : tab.timestamps.updatedAt,
        },
      }))
    );
    if (storageMode === "backend" && serverOnline)
      void Promise.allSettled(
        affected.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            {
              annotations: {
                tags: tab.annotations.tags.filter(tag => tag !== name),
              },
            },
            serverApiKey
          )
        )
      ).then(results => {
        const failed = results.filter(
          result => result.status === "rejected"
        ).length;
        if (failed) toast.error(`${failed} tab tag update(s) failed`);
      });
    toast("Tag removed", {
      description: `“${name}” was removed from the library and linked tabs.`,
    });
  };

  /**
   * Add a new catalog tag.
   *
   * Ignore blank names and reject an exact existing name before clearing the draft.
   */
  const addLibraryTag = () => {
    const name = newTagName.trim();
    if (!name) return;
    if (tagCatalog[name]) {
      toast.error("That tag already exists");
      return;
    }
    setTagCatalog(current => ({ ...current, [name]: "" }));
    setNewTagName("");
    toast.success("Tag added", {
      description: `Add a description or use “${name}” while editing a tab.`,
    });
  };

  const searchModeLabel = !query
    ? ""
    : isRemoteSearching
      ? "consulting local index"
      : searchResponse?.mode === "semantic"
        ? "semantic index"
        : searchResponse?.mode === "text_fallback"
          ? "text fallback"
          : extensionContext
            ? "offline cache"
            : "preview match";
  const searchStatusCopy = !query
    ? "Drag a tab handle to reorder its collection. Use the collection menu to file it elsewhere, then edit its title, note, URL, tags, or destination."
    : isRemoteSearching
      ? "Ranking results against your local index…"
      : searchResponse?.mode === "semantic"
        ? `${searchResponse.semanticIndex?.indexedTabs ?? 0} indexed tabs · ${searchResponse.semanticIndex?.model ?? "local model"}`
        : (remoteSearchError ?? "Local title, note, and tag matching.");
  const semanticLensTone =
    searchResponse?.mode === "semantic"
      ? "text-[#56815d]"
      : searchResponse?.mode === "text_fallback"
        ? "text-[#be742e]"
        : "text-[#747970]";
  const semanticLensLabel = isRemoteSearching
    ? "searching"
    : query
      ? searchModeLabel
      : serverOnline && semanticIndexStatus?.status === "ready"
        ? "meaning ready"
        : "keyword + tags";
  const libraryStorageLabel =
    syncStatus?.state === "synced"
      ? "Synced to server"
      : syncStatus?.state === "pending"
        ? "Stored locally · sync pending"
        : "Stored locally";
  const activeDragTab = activeDragId
    ? tabs.find(tab => tab.id === activeDragId)
    : undefined;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      onDragStart={handleLibraryDragStart}
      onDragOver={handleLibraryDragOver}
      onDragEnd={handleLibraryDragEnd}
      onDragCancel={cancelLibraryDrag}
    >
      <div className="min-h-screen bg-[#f6f3ec] text-[#18261f]">
        <main className="min-h-screen">
          <div className="mx-auto max-w-[1540px] px-5 py-5 sm:px-7">
            <LibraryHeader
              title={
                isArchivePage ? "Archive" : isHiddenPage ? "Hidden" : "All tabs"
              }
              libraryStorageLabel={libraryStorageLabel}
              onOpenDashboard={() => setLocation("/dashboard")}
            />

            <div className="mt-4">
              <section>
                <LibraryResultSummary
                  search={{
                    query: query,
                    isRemoteSearching: isRemoteSearching,
                    visibleCount: visibleTabs.length,
                    isSemanticSearch: searchResponse?.mode === "semantic",
                    searchStatusCopy: searchStatusCopy,
                  }}
                  page={{
                    isAllTabsPage: isAllTabsPage,
                    isGroupBoard: isGroupBoard,
                  }}
                  cleanup={{
                    isQuickCleaning: isQuickCleaning,
                    onQuickClean: () => void quickClean(),
                    onAdvancedDedupe: () => setLocation("/deduplicate"),
                  }}
                  selection={{
                    selectionMode: selectionMode,
                    onToggleSelectionMode: toggleSelectionMode,
                  }}
                />
                <div
                  data-testid="library-search-toolbar"
                  className="sticky top-14 z-20 mt-3 bg-[#f6f3ec] py-2 lg:top-0"
                >
                  <LibrarySearchInput
                    search={{
                      query: query,
                      activeResultId: visibleTabs[activeResultIndex]?.id,
                      onQueryChange: nextQuery => {
                        setQuery(nextQuery);
                        setActiveResultIndex(0);
                      },
                      onKeyDown: handleSearchKeyDown,
                    }}
                    filter={{
                      searchGroupFilter: searchGroupFilter,
                      groups: vaultGroups,
                      onGroupFilterChange: groupId =>
                        setSearchGroupFilter(groupId),
                    }}
                    index={{
                      semanticLensTone: semanticLensTone,
                      semanticLensLabel: semanticLensLabel,
                      isRemoteSearching: isRemoteSearching,
                    }}
                  />
                  <LibraryBulkActions
                    groups={vaultGroups}
                    isArchivePage={isArchivePage}
                    selection={{
                      selectionActive: selectionActive,
                      selectedCount: selectedResultIds.size,
                      visibleCount: visibleTabs.length,
                      onToggleSelectAll: toggleSelectAll,
                    }}
                    tagging={{
                      bulkTag: bulkTag,
                      onBulkTagChange: setBulkTag,
                      onTagSelected: () => void bulkTagSelected(),
                    }}
                    actions={{
                      onMoveSelected: groupId => void bulkMoveSelected(groupId),
                      onRemoveSelected: () => void removeSelected(),
                    }}
                  />
                </div>
                <LibrarySavedViews
                  query={query}
                  picker={{
                    showSavedSearches: showSavedSearches,
                    onToggleSavedSearches: () =>
                      setShowSavedSearches(!showSavedSearches),
                  }}
                  draft={{
                    savedSearchName: savedSearchName,
                    onNameChange: setSavedSearchName,
                    onSave: saveCurrentSearch,
                  }}
                  views={{
                    savedSearches: savedSearches,
                    groups: vaultGroups,
                    onApply: applySavedSearch,
                    onDelete: id =>
                      setSavedSearches(current =>
                        current.filter(item => item.id !== id)
                      ),
                  }}
                  undo={{
                    undoLabel: undoSnapshot?.label,
                    onUndo: () => void undoLastBulkAction(),
                  }}
                />
                <LibraryViewControls
                  tabView={tabView}
                  onViewChange={view => {
                    if (view === "groups") {
                      setSearchGroupFilter("all");
                      setSelectionMode(false);
                      setSelectedResultIds(new Set());
                    }
                    setTabView(view);
                  }}
                />
                {isGroupBoard ? (
                  <CollectionBoard
                    groups={vaultGroups}
                    tabs={sortByStoredOrder(activeTabs)}
                    search={{
                      query: query,
                      matchedTabIds: new Set(visibleTabs.map(tab => tab.id)),
                    }}
                    actions={{
                      onOpen: group => void openCollectionTabs(group),
                      onShare: group => void shareCollectionAsMarkdown(group),
                      onDelete: requestCollectionDelete,
                      onEdit: group => setEditingCollection({ ...group }),
                      onBrowse: groupId => {
                        setSearchGroupFilter(groupId);
                        setQuery("");
                        setTabView("standard");
                      },
                      onCreate: createGroup,
                      onHide: (groupId, duration) =>
                        void changeGroupVisibility(groupId, "hide", duration),
                    }}
                  />
                ) : visibleTabs.length ||
                  (!isArchivePage && !isHiddenPage && !query) ? (
                  <>
                    {!isArchivePage &&
                      !isHiddenPage &&
                      tabView !== "preview" && (
                        <CollectionDropShelf groups={vaultGroups} />
                      )}
                    <TabList
                      tabs={visibleTabs}
                      presentation={{
                        viewMode: tabView === "groups" ? "standard" : tabView,
                        previewBackend:
                          storageMode === "backend" && serverOnline
                            ? { url: localServerUrl, apiKey: serverApiKey }
                            : undefined,
                      }}
                      search={{
                        query: query,
                        semanticScores: semanticScores,
                        fallbackMode: searchResponse?.mode,
                      }}
                      selection={{
                        selectionEnabled: selectionMode,
                        activeResultIndex: activeResultIndex,
                        selectedResultIds: selectedResultIds,
                        onActiveIndex: setActiveResultIndex,
                        onToggleSelection: toggleResultSelection,
                      }}
                      collections={{
                        collapsibleGroups: !isArchivePage && !query,
                        collapsedGroupIds: collapsedGroupIds,
                        onToggleGroup: groupId =>
                          setCollapsedGroupIds(current => {
                            const next = new Set(current);
                            if (next.has(groupId)) next.delete(groupId);
                            else next.add(groupId);
                            return next;
                          }),
                        groups: vaultGroups,
                        visibleGroupIds: visibleGroupIds,
                        collectionActions: {
                          onOpenGroup: groupId => {
                            const group = vaultGroups.find(
                              item => item.id === groupId
                            );
                            if (group) void openCollectionTabs(group);
                          },
                          onShareGroup: groupId => {
                            const group = vaultGroups.find(
                              item => item.id === groupId
                            );
                            if (group) void shareCollectionAsMarkdown(group);
                          },
                          onDeleteGroup: groupId => {
                            const group = vaultGroups.find(
                              item => item.id === groupId
                            );
                            if (group) requestCollectionDelete(group);
                          },
                          onEditGroup: groupId => {
                            const group = vaultGroups.find(
                              item => item.id === groupId
                            );
                            if (group) setEditingCollection({ ...group });
                          },
                          onHideGroup: (groupId, duration) =>
                            void changeGroupVisibility(
                              groupId,
                              "hide",
                              duration
                            ),
                          onUnhideGroup: groupId =>
                            void changeGroupVisibility(groupId, "unhide"),
                          onProlongGroup: (groupId, duration) =>
                            void changeGroupVisibility(
                              groupId,
                              "prolong",
                              duration
                            ),
                        },
                      }}
                      actions={{
                        onMove: moveTab,
                        onEdit: openTabEditor,
                        onOpen: (tab, url) =>
                          void openSavedTab(tab as VaultTab, url),
                        onViewedChange: setTabViewed,
                        onDelete: tab => void deleteTab(tab as VaultTab),
                        onOpenTagManager: () => setShowTagManager(true),
                      }}
                      lifecycle={{
                        lifecycleMode: isArchivePage
                          ? "archived"
                          : isHiddenPage
                            ? "hidden"
                            : "visible",
                        onRestore: tab => restoreTab(tab as VaultTab),
                        onHide: (tab, duration) =>
                          hideTabFor(tab as VaultTab, duration),
                        onUnhide: tab => unhideTab(tab as VaultTab),
                        onProlong: (tab, duration) =>
                          prolongTabFor(tab as VaultTab, duration),
                      }}
                    />
                  </>
                ) : (
                  <LibraryEmptyState
                    query={query}
                    isArchivePage={isArchivePage}
                    isHiddenPage={isHiddenPage}
                    workspaceLabel={workspaceLabel}
                  />
                )}
              </section>
            </div>
          </div>
        </main>

        {editingCollection && (
          <EditCollectionDialog
            collection={editingCollection}
            categories={Array.from(
              new Set([
                "manual",
                "session",
                ...vaultGroups.map(group => group.details.category),
              ])
            )}
            onChange={setEditingCollection}
            onClose={() => setEditingCollection(null)}
            onSave={saveCollection}
          />
        )}

        {collectionPendingDelete && (
          <DeleteCollectionDialog
            collection={collectionPendingDelete}
            onClose={() => setCollectionPendingDelete(null)}
            onDelete={() => deleteCollection(collectionPendingDelete)}
          />
        )}

        {showTagManager && (
          <TagManagerDialog
            tags={tagCatalog}
            draft={{
              newTagName: newTagName,
              onNewTagNameChange: setNewTagName,
              onAdd: addLibraryTag,
            }}
            actions={{
              onDescriptionChange: (name, description) =>
                setTagCatalog(current => ({ ...current, [name]: description })),
              onRename: renameTag,
              onRemove: removeTag,
              onClose: () => {
                setShowTagManager(false);
                toast.success("Tag directory saved", {
                  description:
                    "The local index is ready for the next question.",
                });
              },
            }}
          />
        )}

        {editingTab && (
          <EditTabDialog
            tab={editingTab}
            groups={vaultGroups}
            propertySchema={propertySchemaRef.current}
            tags={{
              tagDraft: tagDraft,
              tagSuggestions: tagSuggestions,
              tagCatalog: tagCatalog,
              onTagDraftChange: setTagDraft,
              onAddTag: addTagToTab,
            }}
            actions={{
              onChange: setEditingTab,
              onClose: () => setEditingTab(null),
              onSave: saveTab,
            }}
          />
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDragTab && tabView === "groups" ? (
          <div
            className="grid h-9 w-9 place-items-center rounded-md bg-[#fffdf8] shadow-lg"
            data-testid="tab-drag-preview"
          >
            <CollectionTabIcon tab={activeDragTab} />
          </div>
        ) : activeDragTab ? (
          <TabDragPreview
            tab={activeDragTab}
            groups={vaultGroups}
            presentation={{
              viewMode: tabView === "groups" ? "standard" : tabView,
              previewBackend:
                storageMode === "backend" && serverOnline
                  ? { url: localServerUrl, apiKey: serverApiKey }
                  : undefined,
            }}
            search={{
              query: query,
              score: semanticScores.get(activeDragTab.id),
              fallbackMode: searchResponse?.mode,
            }}
            selection={{
              selectionEnabled: selectionMode,
              isSelected: selectedResultIds.has(activeDragTab.id),
            }}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
