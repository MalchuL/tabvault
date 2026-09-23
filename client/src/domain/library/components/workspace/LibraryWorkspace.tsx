import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
/**
 * Signal Library design reminder: This page is an asymmetric link-library workspace.
 * The left rail indexes collections, the center is a calm reading surface, and orange signals active work.
 */
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
import { IconButton } from "@/components/shared/IconButton";
import { ContextHelp } from "@/components/shared/ContextHelp";
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
import {
  Boxes,
  Check,
  ListChecks,
  SlidersHorizontal,
  ChevronRight,
  Eye,
  LayoutList,
  Rows3,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

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

/**
 * Coordinate saved-tab browsing, search, grouping, and persistence.
 * It reads the shared library provider and keeps extension and server behavior in the current workspace.
 * @returns {React.ReactElement} Interactive saved-tab workspace.
 */
export function LibraryWorkspace() {
  const [location, setLocation] = useLocation();
  const { vault, dispatch } = useLibrary();
  const { tabs, vaultGroups, tagCatalog, tabOrders } = vault;
  const savedSearches = vault.savedSearches ?? [];
  const tabView = vault.tabView ?? "standard";
  /**
   * Update the saved-tab collection through the library provider.
   * Keeps mutations on the shared vault rather than local component state.
   * @param {SetStateAction<VaultTab[]>} value - New tab array or updater.
   */
  const setTabs = (value: SetStateAction<VaultTab[]>) =>
    dispatch({ type: "update", key: "tabs", value });
  /**
   * Update the saved groups through the library provider.
   * Keeps group changes in the persisted vault.
   * @param {SetStateAction<VaultGroup[]>} value - New group array or updater.
   */
  const setVaultGroups = (value: SetStateAction<VaultGroup[]>) =>
    dispatch({ type: "update", key: "vaultGroups", value });
  /**
   * Update the library tag descriptions.
   * Changes flow through the shared vault dispatch.
   * @param {SetStateAction<Record<string, string>>} value - New tag catalog or updater.
   */
  const setTagCatalog = (value: SetStateAction<Record<string, string>>) =>
    dispatch({ type: "update", key: "tagCatalog", value });
  /**
   * Update the per-group saved-tab order.
   * Changes flow through the shared vault dispatch.
   * @param {SetStateAction<Record<string, string[]>>} value - New order buckets or updater.
   */
  const setTabOrders = (value: SetStateAction<Record<string, string[]>>) =>
    dispatch({ type: "update", key: "tabOrders", value });
  /**
   * Update saved searches while tolerating older vaults without the field.
   * Missing search state starts as an empty list.
   * @param {SetStateAction<SavedSearch[]>} value - New saved searches or updater.
   */
  const setSavedSearches = (value: SetStateAction<SavedSearch[]>) =>
    dispatch({
      type: "update",
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
    vault.tombstones ?? { tabs: [] as string[], groups: [] as string[] }
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
    tabs,
    tabOrders,
    setTabs,
    setTabOrders,
    vaultGroups,
    tabView,
    storageMode,
    serverOnline,
    setServerOnline,
    localServerUrl,
    serverApiKey,
  });

  /**
   * Assemble the current browser vault for synchronization.
   * Refs supply the latest property schema and tombstones while visible state supplies tabs and preferences.
   * @returns {PersistedVault} Complete schema-v3 vault snapshot.
   */
  const currentVault = (): PersistedVault => ({
    schemaVersion: 3,
    propertySchema: propertySchemaRef.current,
    tabs,
    vaultGroups,
    tagCatalog,
    tabOrders,
    savedSearches,
    tabView,
    tombstones: tombstonesRef.current,
  });

  const applyVault = useCallback(
    (vault: PersistedVault) => {
      propertySchemaRef.current = vault.propertySchema;
      tombstonesRef.current = vault.tombstones ?? { tabs: [], groups: [] };
      dispatch({ type: "replace", vault });
    },
    [dispatch]
  );
  vaultRef.current = currentVault();

  const sortByStoredOrder = useCallback(
    (items: VaultTab[]) => sortTabs(items, { vaultGroups, tabOrders }),
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
        tab => !tab.archived && !isCurrentlyHidden(tab, visibilityNow)
      ),
    [tabs, visibilityNow]
  );
  const hiddenTabs = useMemo(
    () => tabs.filter(tab => isCurrentlyHidden(tab, visibilityNow)),
    [tabs, visibilityNow]
  );
  const archivedTabs = useMemo(() => tabs.filter(tab => tab.archived), [tabs]);
  const selectedGroupTabs = sortByStoredOrder(
    isArchivePage
      ? archivedTabs
      : (isHiddenPage ? hiddenTabs : activeTabs).filter(
          tab =>
            searchGroupFilter === "all" || tab.groupId === searchGroupFilter
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
              const members = tabs.filter(tab => tab.groupId === group.id);
              if (!members.length) return !isHiddenPage && !isArchivePage;
              return pageTabs.some(tab => tab.groupId === group.id);
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
          (searchGroupFilter === "all" || tab.groupId === searchGroupFilter) &&
          [tab.title, tab.note, tab.agentReview, tab.domain, ...tab.tags]
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
    selectedResultIds,
    setSelectedResultIds,
    selectionMode,
    setSelectionMode,
    bulkTag,
    setBulkTag,
    undoSnapshot,
    selectionActive,
    toggleResultSelection,
    createUndoSnapshot,
    undoLastBulkAction,
    bulkMoveSelected,
    bulkTagSelected,
    permanentlyDeleteTabs,
    toggleSelectionMode,
    toggleSelectAll,
    removeSelected,
  } = useLibrarySelection({
    tabs,
    tabOrders,
    tagCatalog,
    visibleTabs,
    query,
    isArchivePage,
    setTabs,
    setTabOrders,
    setTagCatalog,
    recordTombstones: ids => {
      const tombstones = {
        ...tombstonesRef.current,
        tabs: Array.from(new Set([...tombstonesRef.current.tabs, ...ids])),
      };
      tombstonesRef.current = tombstones;
      dispatch({ type: "update", key: "tombstones", value: tombstones });
    },
    storageMode,
    serverOnline,
    setServerOnline,
    localServerUrl,
    serverApiKey,
  });

  useEffect(() => {
    const nextDeadline = tabs
      .filter(tab => !tab.archived && isCurrentlyHidden(tab, visibilityNow))
      .map(tab => Date.parse(tab.hiddenUntil ?? ""))
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
          description: `${vault.tabs.length} tabs merged with the server.`,
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
              groupId: null,
              archived: true,
              archivedAt,
              updatedAt: new Date().toISOString(),
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
        { archived: true, groupId: null },
        serverApiKey
      );
    }
    toast.success(`Archived “${tab.title}”`);
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
    changes: Pick<VaultTab, "hiddenUntil" | "archived" | "archivedAt"> &
      Partial<Pick<VaultTab, "groupId">>,
    message: string
  ) => {
    setTabs(current =>
      current.map(item =>
        item.id === tab.id
          ? { ...item, ...changes, updatedAt: new Date().toISOString() }
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
        hiddenUntil: new Date(Date.now() + durationMs).toISOString(),
        archived: Boolean(tab.archived),
        archivedAt: tab.archivedAt,
      },
      `Hidden “${tab.title}”`
    );

  /**
   * Extend a tab hide deadline without shortening it.
   * Starts from the later of the current deadline and now.
   * @param {VaultTab} tab - Hidden tab to prolong.
   * @param {number} durationMs - Additional duration in milliseconds.
   */
  const prolongTabFor = (tab: VaultTab, durationMs: number) => {
    const currentDeadline = Date.parse(tab.hiddenUntil ?? "");
    const base = Number.isFinite(currentDeadline)
      ? Math.max(Date.now(), currentDeadline)
      : Date.now();
    patchTabVisibility(
      tab,
      {
        hiddenUntil: new Date(base + durationMs).toISOString(),
        archived: Boolean(tab.archived),
        archivedAt: tab.archivedAt,
      },
      `Prolonged “${tab.title}”`
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
        hiddenUntil: null,
        archived: Boolean(tab.archived),
        archivedAt: tab.archivedAt,
      },
      `Unhidden “${tab.title}”`
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
        groupId: null,
        archived: false,
        archivedAt: null,
        hiddenUntil: tab.hiddenUntil,
      },
      `Restored “${tab.title}”`
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
        !tab.archived &&
        (groupId === "unassigned"
          ? tab.groupId === null
          : tab.groupId === groupId)
    );
    const updates = members.map(tab => {
      if (action === "unhide") return { tab, hiddenUntil: null };
      const currentDeadline = Date.parse(tab.hiddenUntil ?? "");
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
              hiddenUntil: update.hiddenUntil,
              updatedAt: new Date().toISOString(),
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
            { hiddenUntil },
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
                  groupId: null,
                  archived: true,
                  archivedAt: now,
                  updatedAt: now,
                }
              : { ...tab, ...mutation.updates, updatedAt: now }
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
    const sourceGroup = tabs.find(tab => tab.id === tabId)?.groupId;
    const destination =
      vaultGroups.find(group => group.id === groupId)?.name ?? "Unassigned";
    setTabs(current =>
      current.map(tab =>
        tab.id === tabId
          ? { ...tab, groupId, updatedAt: new Date().toISOString() }
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
        { groupId },
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
      groupId: sessionGroup.id,
      title,
      url,
      domain: domainFromUrl(url),
      note: "",
      agentReview: "",
      viewed: false,
      customProperties: { viewed: false },
      tags: [],
      color: "#F05A28",
      icon: "●",
      createdAt: now,
      updatedAt: now,
      archived: false,
      archivedAt: null,
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
            name: sessionGroup.name,
            description: sessionGroup.description,
            category: sessionGroup.category,
            color: sessionGroup.accent,
            createdAt: sessionGroup.createdAt,
            updatedAt: sessionGroup.updatedAt,
          },
          serverApiKey
        );
        await saveTabToLocalServer(
          localServerUrl,
          {
            id: newTab.id,
            url,
            title,
            note: newTab.note,
            agentReview: newTab.agentReview,
            viewed: newTab.viewed,
            tags: newTab.tags,
            groupId: sessionGroup.id,
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
    activeCount: activeTabs.length,
    archivedCount: archivedTabs.length,
    hiddenCount: hiddenTabs.length,
    tagCount: Object.keys(tagCatalog).length,
    storageMode,
    serverOnline,
    isRefreshing: isRefreshingLibrary,
    onOpenTags: () => setShowTagManager(true),
    onRefreshLibrary: () => void refreshLibrary(),
    onCaptureTab: extensionContext ? () => void captureCurrentTab() : undefined,
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
            saved?.tabs &&
            saved.vaultGroups &&
            saved.tagCatalog &&
            saved.tabOrders
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
      name,
      description: "",
      category: "manual",
      accent: "#8a9c92",
      createdAt: now,
      updatedAt: now,
    };
    setVaultGroups(current => [group, ...current]);
    if (storageMode === "backend" && serverOnline)
      void createGroupOnLocalServer(
        localServerUrl,
        {
          id: group.id,
          name: group.name,
          description: group.description,
          category: "manual",
          color: group.accent,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
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
    const name = editingCollection.name.trim();
    if (!name) {
      toast.error("A collection needs a name");
      return;
    }
    const category = editingCollection.category.trim() || "manual";
    setVaultGroups(current =>
      current.map(group =>
        group.id === editingCollection.id
          ? {
              ...editingCollection,
              name,
              description: editingCollection.description.trim(),
              category,
              updatedAt: new Date().toISOString(),
            }
          : group
      )
    );
    if (storageMode === "backend" && serverOnline) {
      await updateGroupOnLocalServer(
        localServerUrl,
        editingCollection.id,
        {
          name,
          description: editingCollection.description.trim(),
          category,
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
    sortByStoredOrder(tabs.filter(tab => tab.groupId === groupId));

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
          ? { ...tab, viewed, updatedAt: new Date().toISOString() }
          : tab
      )
    );
    if (storageMode === "backend" && serverOnline)
      void updateTabOnLocalServer(
        localServerUrl,
        tabId,
        { viewed },
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
    const affected = tabs.filter(tab => !tab.archived && opened.has(tab.url));
    setTabs(current =>
      current.map(tab =>
        opened.has(tab.url)
          ? { ...tab, viewed: true, updatedAt: new Date().toISOString() }
          : tab
      )
    );
    if (storageMode === "backend" && serverOnline)
      void Promise.allSettled(
        affected.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            { viewed: true },
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
  const openSavedTab = async (tab: VaultTab, url = tab.url) => {
    const result = await openTabUrls([url]);
    if (result.openedCount) {
      markOpenedUrlsViewed([tab.url]);
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
    const result = await openTabUrls(collectionTabs.map(tab => tab.url));
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
      `# ${group.name}`,
      "",
      ...collectionTabs.map(tab => `- [${tab.title}](${tab.url})`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success("Markdown copied", {
        description: `${collectionTabs.length} link${collectionTabs.length === 1 ? "" : "s"} from ${group.name}.`,
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
    dispatch({ type: "update", key: "tombstones", value: tombstones });
    const movedTabs = tabs.filter(tab => tab.groupId === group.id);
    const movedTabIds = new Set(movedTabs.map(tab => tab.id));
    setTabs(current =>
      current.map(tab =>
        tab.groupId === group.id
          ? {
              ...tab,
              groupId: null,
              archived: true,
              archivedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
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
    toast.success(`Deleted ${group.name}`, {
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
    if (tabs.some(tab => tab.groupId === group.id)) {
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
    setEditingTab({ ...tab, tags: [...tab.tags] });

  /**
   * Save the edited tab fields.
   *
   * Require a title and absolute HTTP(S) URL, normalize tags and text locally, then mirror the update when connected.
   */
  const saveTab = () => {
    if (!editingTab) return;
    const title = editingTab.title.trim();
    const url = editingTab.url.trim();
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
      title,
      url,
      note: editingTab.note.trim(),
      agentReview: editingTab.agentReview.trim(),
      domain: domainFromUrl(url),
      tags: editingTab.tags.map(tag => tag.trim()).filter(Boolean),
      updatedAt: new Date().toISOString(),
    };
    setTabs(current =>
      current.map(tab => (tab.id === updatedTab.id ? updatedTab : tab))
    );
    setTagCatalog(current =>
      updatedTab.tags.reduce(
        (next, tag) => ({ ...next, [tag]: next[tag] ?? "" }),
        current
      )
    );
    if (storageMode === "backend" && serverOnline)
      void updateTabOnLocalServer(
        localServerUrl,
        updatedTab.id,
        {
          url: updatedTab.url,
          title: updatedTab.title,
          note: updatedTab.note,
          agentReview: updatedTab.agentReview,
          viewed: updatedTab.viewed,
          customProperties: updatedTab.customProperties,
          tags: updatedTab.tags,
          groupId: updatedTab.groupId,
          hiddenUntil: updatedTab.hiddenUntil ?? null,
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
      editingTab.tags.some(tag => tag.toLowerCase() === value.toLowerCase())
    ) {
      setTagDraft("");
      return;
    }
    setEditingTab({ ...editingTab, tags: [...editingTab.tags, value] });
    setTagDraft("");
  };

  const tagSuggestions = useMemo(() => {
    const normalized = tagDraft.trim().toLowerCase();
    if (!editingTab) return [];
    return Object.keys(tagCatalog)
      .filter(
        tag =>
          !editingTab.tags.some(
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
    const affected = tabs.filter(tab => tab.tags.includes(oldName));
    setTabs(current =>
      current.map(tab => ({
        ...tab,
        tags: tab.tags.map(tag => (tag === oldName ? cleanName : tag)),
        updatedAt: tab.tags.includes(oldName)
          ? new Date().toISOString()
          : tab.updatedAt,
      }))
    );
    if (storageMode === "backend" && serverOnline)
      void Promise.allSettled(
        affected.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            {
              tags: tab.tags.map(tag => (tag === oldName ? cleanName : tag)),
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
    const affected = tabs.filter(tab => tab.tags.includes(name));
    setTagCatalog(current => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setTabs(current =>
      current.map(tab => ({
        ...tab,
        tags: tab.tags.filter(tag => tag !== name),
        updatedAt: tab.tags.includes(name)
          ? new Date().toISOString()
          : tab.updatedAt,
      }))
    );
    if (storageMode === "backend" && serverOnline)
      void Promise.allSettled(
        affected.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            { tags: tab.tags.filter(tag => tag !== name) },
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
            <section className="flex flex-wrap items-center justify-between gap-3">
              <div className="max-w-2xl">
                <h1 className="font-['DM_Sans'] text-2xl font-bold tracking-[-0.04em] text-[#18261f]">
                  {isArchivePage
                    ? "Archive"
                    : isHiddenPage
                      ? "Hidden"
                      : "All tabs"}
                </h1>
              </div>
              <Button
                variant="ghost"
                onClick={() => setLocation("/dashboard")}
                className="inline-flex shrink-0 items-center gap-2 rounded px-2 py-2 text-left font-mono text-[9px] uppercase tracking-[0.09em] text-[#6d746b] transition hover:text-[#e95224] active:scale-[0.98]"
                title="Open dashboard"
              >
                <BrandMark className="h-3.5 w-3.5 shrink-0" />
                {libraryStorageLabel}
                <ChevronRight className="h-3 w-3" />
              </Button>
            </section>

            <div className="mt-4">
              <section>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <h2 className="font-['DM_Sans'] text-sm font-semibold tracking-[-0.02em]">
                        {query
                          ? isRemoteSearching
                            ? "Searching local knowledge…"
                            : `${visibleTabs.length} ${searchResponse?.mode === "semantic" ? "matched on meaning" : "matched locally"}`
                          : `${visibleTabs.length} tabs`}
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
                          onClick={() => void quickClean()}
                          disabled={isQuickCleaning}
                          className="rounded border border-[#d9d3c6] bg-[#fffdf8] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[#687067] hover:border-[#e95224] hover:text-[#e95224] disabled:opacity-50"
                        >
                          {isQuickCleaning ? "Cleaning…" : "Quick clean"}
                        </Button>
                        <IconButton
                          label="Advanced deduplication"
                          onClick={() => setLocation("/deduplicate")}
                        >
                          <SlidersHorizontal />
                        </IconButton>
                      </>
                    )}
                    {!query && !isGroupBoard && (
                      <IconButton
                        label={selectionMode ? "Done selecting" : "Select tabs"}
                        aria-pressed={selectionMode}
                        onClick={toggleSelectionMode}
                        className={
                          selectionMode ? "bg-[#fff0ea] text-[#c84b26]" : ""
                        }
                      >
                        {selectionMode ? <Check /> : <ListChecks />}
                      </IconButton>
                    )}
                  </div>
                </div>
                <div
                  data-testid="library-search-toolbar"
                  className="sticky top-14 z-20 mt-3 bg-[#f6f3ec] py-2 lg:top-0"
                >
                  <LibrarySearchInput
                    query={query}
                    activeResultId={visibleTabs[activeResultIndex]?.id}
                    searchGroupFilter={searchGroupFilter}
                    groups={vaultGroups}
                    semanticLensTone={semanticLensTone}
                    semanticLensLabel={semanticLensLabel}
                    isRemoteSearching={isRemoteSearching}
                    onQueryChange={nextQuery => {
                      setQuery(nextQuery);
                      setActiveResultIndex(0);
                    }}
                    onGroupFilterChange={groupId =>
                      setSearchGroupFilter(groupId)
                    }
                    onKeyDown={handleSearchKeyDown}
                  />
                  <LibraryBulkActions
                    selectionActive={selectionActive}
                    selectedCount={selectedResultIds.size}
                    visibleCount={visibleTabs.length}
                    groups={vaultGroups}
                    bulkTag={bulkTag}
                    isArchivePage={isArchivePage}
                    onToggleSelectAll={toggleSelectAll}
                    onMoveSelected={groupId => void bulkMoveSelected(groupId)}
                    onBulkTagChange={setBulkTag}
                    onTagSelected={() => void bulkTagSelected()}
                    onRemoveSelected={() => void removeSelected()}
                  />
                </div>
                {query && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-[#dfdbd0] bg-[#fffdf8] px-3 py-2">
                    <Button
                      variant="ghost"
                      onClick={() => setShowSavedSearches(!showSavedSearches)}
                      className="rounded border border-[#d9d3c6] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[#617066] hover:border-[#e95224] hover:text-[#e95224]"
                    >
                      Views{" "}
                      {savedSearches.length ? `· ${savedSearches.length}` : ""}
                    </Button>
                    <ContextHelp
                      title="Saved views"
                      side="bottom"
                      align="start"
                    >
                      A saved view remembers this search phrase and shelf
                      filter. It does not duplicate or move your tabs.
                    </ContextHelp>
                    {undoSnapshot && (
                      <div className="flex items-center gap-2 rounded border border-[#b7cbb4] bg-[#edf2ea] px-2 py-1.5 text-[10px] text-[#48644d]">
                        <span>Undo {undoSnapshot.label}</span>
                        <Button
                          variant="ghost"
                          onClick={() => void undoLastBulkAction()}
                          className="font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[#2f773c] hover:underline"
                        >
                          Undo
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {query && showSavedSearches && (
                  <div className="border-b border-[#dfdbd0] bg-[#f9f7f1] p-3">
                    <div className="flex gap-2">
                      <Input
                        value={savedSearchName}
                        onChange={event =>
                          setSavedSearchName(event.target.value)
                        }
                        onKeyDown={event => {
                          if (event.key === "Enter") saveCurrentSearch();
                        }}
                        placeholder={query}
                        className="h-auto min-w-0 flex-1 rounded-none border-x-0 border-t-0 border-b border-[#bcb6a8] bg-transparent px-1 py-1.5 text-[11px] shadow-none outline-none focus:border-[#e95224]"
                      />
                      <Button
                        variant="ghost"
                        onClick={saveCurrentSearch}
                        className="rounded bg-[#e95224] px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-white hover:bg-[#d94a1e]"
                      >
                        Save view
                      </Button>
                    </div>
                    {savedSearches.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {savedSearches.map(view => (
                          <div
                            key={view.id}
                            className="flex items-center gap-2 rounded bg-[#fffdf8] px-2 py-1.5"
                          >
                            <Button
                              variant="ghost"
                              onClick={() => applySavedSearch(view)}
                              className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold text-[#425047] hover:text-[#e95224]"
                            >
                              {view.name}
                              <span className="ml-2 font-mono text-[8px] font-normal uppercase text-[#969991]">
                                {view.groupId === "all"
                                  ? "all shelves"
                                  : (vaultGroups.find(
                                      group => group.id === view.groupId
                                    )?.name ?? "collection")}
                              </span>
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                setSavedSearches(current =>
                                  current.filter(item => item.id !== view.id)
                                )
                              }
                              className="rounded p-1 text-[#989990] hover:bg-[#fff0ea] hover:text-[#c84725]"
                              aria-label={`Delete ${view.name} saved search`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#838980]">
                    <ContextHelp
                      title="Tab views and reordering"
                      side="bottom"
                      align="start"
                    >
                      Standard shows details, Compact shows only a favicon and
                      title, and Instant Preview renders a readable article card
                      when page content is available. Group board summarizes
                      collections. Drag a row by its handle to change its order
                      within that collection.
                    </ContextHelp>
                  </p>
                  <div
                    className="flex overflow-hidden rounded-md border border-[#d9d3c6] bg-[#fffdf8]"
                    role="group"
                    aria-label="Tab view mode"
                  >
                    <IconButton
                      onClick={() => {
                        setSearchGroupFilter("all");
                        setSelectionMode(false);
                        setSelectedResultIds(new Set());
                        setTabView("groups");
                      }}
                      className={`p-2 ${tabView === "groups" ? "bg-[#edf2ea] text-[#36533a]" : "text-[#858980] hover:bg-[#f7f4ed]"}`}
                      label="Collection-group board view"
                      aria-pressed={tabView === "groups"}
                    >
                      <Boxes className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      onClick={() => setTabView("standard")}
                      className={`border-l border-[#d9d3c6] p-2 ${tabView === "standard" ? "bg-[#edf2ea] text-[#36533a]" : "text-[#858980] hover:bg-[#f7f4ed]"}`}
                      label="Standard tab view"
                      aria-pressed={tabView === "standard"}
                    >
                      <LayoutList className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      onClick={() => setTabView("compact")}
                      className={`border-l border-[#d9d3c6] p-2 ${tabView === "compact" ? "bg-[#edf2ea] text-[#36533a]" : "text-[#858980] hover:bg-[#f7f4ed]"}`}
                      label="Compact tab view"
                      aria-pressed={tabView === "compact"}
                    >
                      <Rows3 className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      onClick={() => setTabView("preview")}
                      className={`border-l border-[#d9d3c6] p-2 ${tabView === "preview" ? "bg-[#edf2ea] text-[#36533a]" : "text-[#858980] hover:bg-[#f7f4ed]"}`}
                      label="Instant-preview tab view"
                      aria-pressed={tabView === "preview"}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>
                {isGroupBoard ? (
                  <CollectionBoard
                    groups={vaultGroups}
                    tabs={sortByStoredOrder(activeTabs)}
                    query={query}
                    matchedTabIds={new Set(visibleTabs.map(tab => tab.id))}
                    onOpen={group => void openCollectionTabs(group)}
                    onShare={group => void shareCollectionAsMarkdown(group)}
                    onDelete={requestCollectionDelete}
                    onEdit={group => setEditingCollection({ ...group })}
                    onBrowse={groupId => {
                      setSearchGroupFilter(groupId);
                      setQuery("");
                      setTabView("standard");
                    }}
                    onCreate={createGroup}
                    onHide={(groupId, duration) =>
                      void changeGroupVisibility(groupId, "hide", duration)
                    }
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
                      viewMode={tabView === "groups" ? "standard" : tabView}
                      query={query}
                      selectionEnabled={selectionMode}
                      collapsibleGroups={!isArchivePage && !query}
                      collapsedGroupIds={collapsedGroupIds}
                      onToggleGroup={groupId =>
                        setCollapsedGroupIds(current => {
                          const next = new Set(current);
                          if (next.has(groupId)) next.delete(groupId);
                          else next.add(groupId);
                          return next;
                        })
                      }
                      activeResultIndex={activeResultIndex}
                      selectedResultIds={selectedResultIds}
                      semanticScores={semanticScores}
                      fallbackMode={searchResponse?.mode}
                      onActiveIndex={setActiveResultIndex}
                      onToggleSelection={toggleResultSelection}
                      onMove={moveTab}
                      onEdit={openTabEditor}
                      onOpen={(tab, url) =>
                        void openSavedTab(tab as VaultTab, url)
                      }
                      onViewedChange={setTabViewed}
                      onDelete={tab => void deleteTab(tab as VaultTab)}
                      lifecycleMode={
                        isArchivePage
                          ? "archived"
                          : isHiddenPage
                            ? "hidden"
                            : "visible"
                      }
                      onRestore={tab => restoreTab(tab as VaultTab)}
                      onHide={(tab, duration) =>
                        hideTabFor(tab as VaultTab, duration)
                      }
                      onUnhide={tab => unhideTab(tab as VaultTab)}
                      onProlong={(tab, duration) =>
                        prolongTabFor(tab as VaultTab, duration)
                      }
                      onOpenTagManager={() => setShowTagManager(true)}
                      onOpenGroup={groupId => {
                        const group = vaultGroups.find(
                          item => item.id === groupId
                        );
                        if (group) void openCollectionTabs(group);
                      }}
                      onShareGroup={groupId => {
                        const group = vaultGroups.find(
                          item => item.id === groupId
                        );
                        if (group) void shareCollectionAsMarkdown(group);
                      }}
                      onDeleteGroup={groupId => {
                        const group = vaultGroups.find(
                          item => item.id === groupId
                        );
                        if (group) requestCollectionDelete(group);
                      }}
                      onEditGroup={groupId => {
                        const group = vaultGroups.find(
                          item => item.id === groupId
                        );
                        if (group) setEditingCollection({ ...group });
                      }}
                      onHideGroup={(groupId, duration) =>
                        void changeGroupVisibility(groupId, "hide", duration)
                      }
                      onUnhideGroup={groupId =>
                        void changeGroupVisibility(groupId, "unhide")
                      }
                      onProlongGroup={(groupId, duration) =>
                        void changeGroupVisibility(groupId, "prolong", duration)
                      }
                      groups={vaultGroups}
                      visibleGroupIds={visibleGroupIds}
                      previewBackend={
                        storageMode === "backend" && serverOnline
                          ? { url: localServerUrl, apiKey: serverApiKey }
                          : undefined
                      }
                    />
                  </>
                ) : (
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
                          : "Try a topic, note, or tag. Semantic search understands related language."}
                    </p>
                  </div>
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
                ...vaultGroups.map(group => group.category),
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
            newTagName={newTagName}
            onNewTagNameChange={setNewTagName}
            onDescriptionChange={(name, description) =>
              setTagCatalog(current => ({ ...current, [name]: description }))
            }
            onRename={renameTag}
            onRemove={removeTag}
            onAdd={addLibraryTag}
            onClose={() => {
              setShowTagManager(false);
              toast.success("Tag directory saved", {
                description: "The local index is ready for the next question.",
              });
            }}
          />
        )}

        {editingTab && (
          <EditTabDialog
            tab={editingTab}
            groups={vaultGroups}
            tagDraft={tagDraft}
            tagSuggestions={tagSuggestions}
            tagCatalog={tagCatalog}
            propertySchema={propertySchemaRef.current}
            onChange={setEditingTab}
            onTagDraftChange={setTagDraft}
            onAddTag={addTagToTab}
            onClose={() => setEditingTab(null)}
            onSave={saveTab}
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
            viewMode={tabView === "groups" ? "standard" : tabView}
            query={query}
            selectionEnabled={selectionMode}
            isSelected={selectedResultIds.has(activeDragTab.id)}
            score={semanticScores.get(activeDragTab.id)}
            fallbackMode={searchResponse?.mode}
            groups={vaultGroups}
            previewBackend={
              storageMode === "backend" && serverOnline
                ? { url: localServerUrl, apiKey: serverApiKey }
                : undefined
            }
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
