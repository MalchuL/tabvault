/**
 * Signal Library design reminder: This page is an asymmetric link-library workspace.
 * The left rail indexes collections, the center is a calm reading surface, and orange signals active work.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragOverEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  addExtensionMessageListener,
  checkLocalServer,
  createGroupOnLocalServer,
  DEFAULT_TABVAULT_API_KEY,
  DEFAULT_TABVAULT_SERVER_URL,
  deleteGroupOnLocalServer,
  deleteTabOnLocalServer,
  getActiveChromeTab,
  getSemanticIndexStatus,
  isExtensionContext,
  openTabUrls,
  readApiKey,
  readLibraryRefreshInterval,
  readLocalServerUrl,
  readStorageMode,
  readSyncStatus,
  refreshLibraryFromServer,
  reorderTabsOnLocalServer,
  saveTabToLocalServer,
  searchLocalServer,
  updateTabOnLocalServer,
  updateGroupOnLocalServer,
  type ChromeTabSnapshot,
  type LocalSearchResponse,
  type SemanticIndexStatus,
  type StorageMode,
  type SyncStatus,
} from "@/lib/extension";
import { orderKey } from "@/lib/library";
import { TabDragPreview, TabList } from "@/components/TabList";
import { ContextHelp } from "@/components/ContextHelp";
import {
  LIBRARY_OPEN_TAGS_FLAG,
  useRegisterLibrarySidebar,
} from "@/components/workspace-sidebar-context";
import { CollectionBoard } from "@/domain/library/components/CollectionBoard";
import {
  CreateCollectionDialog,
  DeleteCollectionDialog,
  EditCollectionDialog,
  EditTabDialog,
  TagManagerDialog,
} from "@/domain/library/components/LibraryDialogs";
import { CollectionDropShelf } from "@/domain/library/components/LibraryDragUi";
import {
  initialGroups,
  initialTags,
  startingTabs,
} from "@/domain/library/data";
import type {
  GroupId,
  LibraryViewMode,
  PersistedVault,
  SavedSearch,
  UndoSnapshot,
  VaultGroup,
  VaultTab,
} from "@/domain/library/types";
import { buildQuickCleanPlan } from "@/domain/deduplication/model";
import {
  executeDedupePlan,
  type DedupeMutation,
} from "@/domain/deduplication/execution";
import { BrowserStorageAdapter } from "@/lib/persistence";
import {
  ArrowDownToLine,
  BookMarked,
  Boxes,
  ChevronRight,
  Command,
  Eye,
  LayoutList,
  Plus,
  Rows3,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const logoUrl = "/icon-128.png";

function isCurrentlyHidden(tab: VaultTab, now = Date.now()) {
  return (
    !tab.archived &&
    Boolean(tab.hiddenUntil) &&
    Date.parse(tab.hiddenUntil ?? "") > now
  );
}

function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="TabVault"
      className={`${className} object-contain`}
    />
  );
}

function normaliseUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0];
  }
}

export default function Home() {
  const [location, setLocation] = useLocation();
  const extensionContext = isExtensionContext();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const collisionDetectionStrategy: CollisionDetection = useCallback(args => {
    const pointerCollisions = pointerWithin(args).filter(
      ({ id }) => id !== args.active.id
    );
    const quickMoveTarget = pointerCollisions.find(({ id }) =>
      String(id).startsWith("collection-drop:")
    );
    if (quickMoveTarget) return [quickMoveTarget];
    const pointerItemCollisions = pointerCollisions.filter(
      ({ id }) =>
        !/^(collection-drop|group-drop|group-container):/.test(String(id))
    );
    if (pointerItemCollisions.length) return pointerItemCollisions;
    const groupContainer = pointerCollisions.find(({ id }) =>
      String(id).startsWith("group-container:")
    );
    if (groupContainer) return [groupContainer];
    const itemCollisions = closestCenter(args).filter(
      ({ id }) =>
        !/^(collection-drop|group-drop|group-container):/.test(String(id))
    );
    if (itemCollisions.length) return [itemCollisions[0]];
    return pointerCollisions.length ? pointerCollisions : closestCenter(args);
  }, []);
  const [tabs, setTabs] = useState(startingTabs);
  const [activeDragId, setActiveDragId] = useState<string>();
  const [activeDragHeight, setActiveDragHeight] = useState<number>();
  const [tabOrders, setTabOrders] = useState<Record<string, string[]>>(() =>
    startingTabs.reduce<Record<string, string[]>>(
      (orders, tab) => ({
        ...orders,
        [orderKey(tab.groupId)]: [
          ...(orders[orderKey(tab.groupId)] ?? []),
          tab.id,
        ],
      }),
      {}
    )
  );
  const [vaultGroups, setVaultGroups] = useState(initialGroups);
  const [tagCatalog, setTagCatalog] = useState(initialTags);
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
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(
    new Set()
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<GroupId>>(
    new Set()
  );
  const [bulkTag, setBulkTag] = useState("");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [savedSearchName, setSavedSearchName] = useState("");
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const [tabView, setTabView] = useState<LibraryViewMode>("standard");
  const [semanticIndexStatus, setSemanticIndexStatus] =
    useState<SemanticIndexStatus | null>(null);
  const [serverOnline, setServerOnline] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>("local");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>();
  const [localServerUrl, setLocalServerUrl] = useState(
    DEFAULT_TABVAULT_SERVER_URL
  );
  const [serverApiKey, setServerApiKey] = useState(DEFAULT_TABVAULT_API_KEY);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
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
  const tombstonesRef = useRef({
    tabs: [] as string[],
    groups: [] as string[],
  });
  const dragSnapshotRef = useRef<
    | {
        tabs: VaultTab[];
        tabOrders: Record<string, string[]>;
      }
    | undefined
  >(undefined);
  const lastCrossOverRef = useRef<
    { groupId: GroupId; entryOverId: string; overId: string } | undefined
  >(undefined);
  const refreshLibraryRef = useRef<
    (options?: { silent?: boolean }) => Promise<void>
  >(async () => undefined);

  const descendantCollectionIds = (id: GroupId) => new Set<GroupId>([id]);

  const currentVault = (): PersistedVault => ({
    schemaVersion: 2,
    tabs,
    vaultGroups,
    tagCatalog,
    tabOrders,
    savedSearches,
    tabView,
    tombstones: tombstonesRef.current,
  });

  const applyVault = (vault: PersistedVault) => {
    tombstonesRef.current = vault.tombstones ?? { tabs: [], groups: [] };
    setTabs(vault.tabs);
    setVaultGroups(vault.vaultGroups);
    setTagCatalog(vault.tagCatalog);
    setTabOrders(vault.tabOrders);
    setSavedSearches(vault.savedSearches ?? []);
    setTabView(vault.tabView ?? "standard");
  };
  vaultRef.current = currentVault();

  const sortByStoredOrder = useCallback(
    (items: VaultTab[]) =>
      [...items].sort((a, b) => {
        if (a.groupId !== b.groupId)
          return (
            vaultGroups.findIndex(group => group.id === a.groupId) -
            vaultGroups.findIndex(group => group.id === b.groupId)
          );
        return (
          (tabOrders[orderKey(a.groupId)] ?? []).indexOf(a.id) -
          (tabOrders[orderKey(b.groupId)] ?? []).indexOf(b.id)
        );
      }),
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
            searchGroupFilter === "all" ||
            (tab.groupId !== null &&
              descendantCollectionIds(searchGroupFilter).has(tab.groupId))
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
      : descendantCollectionIds(searchGroupFilter);
  const semanticScores = useMemo(
    () =>
      new Map(
        remoteSearch?.results.map(result => [result.tab.id, result.score]) ?? []
      ),
    [remoteSearch]
  );
  const visibleTabs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return selectedGroupTabs;
    if (remoteSearch?.query.toLowerCase() === normalized) {
      return remoteSearch.results.map(({ tab }) => {
        const local = activeTabs.find(item => item.id === tab.id);
        if (local) return local;
        const groupId =
          tab.groupId && vaultGroups.some(group => group.id === tab.groupId)
            ? tab.groupId
            : null;
        return {
          id: tab.id,
          groupId,
          title: tab.title,
          url: tab.url,
          domain: normaliseUrl(tab.url),
          note: tab.note ?? "",
          agentReview: tab.agentReview ?? "",
          viewed: Boolean(tab.viewed),
          tags: tab.tags ?? [],
          color: "#6b8c7e",
          icon: tab.title.slice(0, 1).toUpperCase() || "T",
          createdAt: tab.updatedAt ?? new Date().toISOString(),
          updatedAt: tab.updatedAt ?? new Date().toISOString(),
        };
      });
    }
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
    remoteSearch,
    searchGroupFilter,
    sortByStoredOrder,
  ]);

  const selectCollection = (id: GroupId) => {
    setSearchGroupFilter(id);
    setQuery("");
    setTabView("standard");
    setLocation("/");
  };

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
      new BrowserStorageAdapter<PersistedVault>().load(),
      readSyncStatus(),
      readStorageMode(),
      readLibraryRefreshInterval(),
    ])
      .then(([saved, savedSyncStatus, savedStorageMode, interval]) => {
        if (cancelled) return;
        setRefreshInterval(interval);
        if (
          saved?.tabs &&
          saved.vaultGroups &&
          saved.tagCatalog &&
          saved.tabOrders
        ) {
          setTabs(
            saved.tabs.map(tab => ({
              ...tab,
              note: typeof tab.note === "string" ? tab.note : "",
              agentReview:
                typeof tab.agentReview === "string" ? tab.agentReview : "",
              viewed: Boolean(tab.viewed),
            }))
          );
          setVaultGroups(
            saved.vaultGroups.map(group => ({
              ...group,
              description:
                typeof group.description === "string" ? group.description : "",
            }))
          );
          setTagCatalog(saved.tagCatalog);
          setTabOrders(saved.tabOrders);
          setSavedSearches(saved.savedSearches ?? []);
          setTabView(saved.tabView ?? "standard");
          tombstonesRef.current = saved.tombstones ?? {
            tabs: [],
            groups: [],
          };
        }
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
    if (!storageReady || activeDragId) return;
    const browser = new BrowserStorageAdapter<PersistedVault>();
    const fallback: PersistedVault = {
      schemaVersion: 2,
      tabs,
      vaultGroups,
      tagCatalog,
      tabOrders,
      savedSearches,
      tabView,
      tombstones: tombstonesRef.current,
    };
    void browser.save(fallback).catch(() => {
      toast.error("Could not write the local library");
    });
  }, [
    storageReady,
    tabs,
    vaultGroups,
    tagCatalog,
    tabOrders,
    savedSearches,
    tabView,
    activeDragId,
  ]);

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
  }, [query, searchGroupFilter]);

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

  const toggleResultSelection = (id: string) =>
    setSelectedResultIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const createUndoSnapshot = (label: string) => {
    const snapshot: UndoSnapshot = {
      id: crypto.randomUUID(),
      label,
      tabs: tabs.map(tab => ({ ...tab, tags: [...tab.tags] })),
      tabOrders: Object.fromEntries(
        Object.entries(tabOrders).map(([groupId, ids]) => [groupId, [...ids]])
      ) as Record<GroupId, string[]>,
      tagCatalog: { ...tagCatalog },
    };
    setUndoSnapshot(snapshot);
    window.setTimeout(
      () =>
        setUndoSnapshot(current =>
          current?.id === snapshot.id ? null : current
        ),
      12_000
    );
    return snapshot;
  };

  const undoLastBulkAction = async () => {
    if (!undoSnapshot) return;
    setTabs(undoSnapshot.tabs);
    setTabOrders(undoSnapshot.tabOrders);
    setTagCatalog(undoSnapshot.tagCatalog);
    setSelectedResultIds(new Set());
    if (storageMode === "backend" && serverOnline) {
      const results = await Promise.allSettled(
        undoSnapshot.tabs.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            {
              url: tab.url,
              title: tab.title,
              note: tab.note,
              agentReview: tab.agentReview,
              viewed: tab.viewed,
              tags: tab.tags,
              groupId: tab.groupId,
              archived: Boolean(tab.archived),
            },
            serverApiKey
          )
        )
      );
      if (results.some(result => result.status === "rejected"))
        toast.error("The server could not restore every tab");
    }
    setUndoSnapshot(null);
    toast.success(`Undid ${undoSnapshot.label}`);
  };

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

  const applySavedSearch = (view: SavedSearch) => {
    setQuery(view.query);
    setSearchGroupFilter(view.groupId);
    setShowSavedSearches(false);
    toast.success(`Applied “${view.name}”`);
  };

  const selectedTabs = visibleTabs.filter(tab => selectedResultIds.has(tab.id));
  const selectionActive = Boolean(query) || selectionMode;

  const bulkMoveSelected = async (groupId: GroupId) => {
    if (!selectedTabs.length) return;
    createUndoSnapshot(
      `moving ${selectedTabs.length} tab${selectedTabs.length === 1 ? "" : "s"}`
    );
    const selectedIds = new Set(selectedTabs.map(tab => tab.id));
    setTabs(current =>
      current.map(tab =>
        selectedIds.has(tab.id)
          ? { ...tab, groupId, updatedAt: new Date().toISOString() }
          : tab
      )
    );
    setTabOrders(current => {
      const withoutSelected = Object.fromEntries(
        Object.entries(current).map(([id, orderedIds]) => [
          id,
          orderedIds.filter(id => !selectedIds.has(id)),
        ])
      ) as Record<GroupId, string[]>;
      return {
        ...withoutSelected,
        [groupId]: [
          ...(withoutSelected[groupId] ?? []),
          ...selectedTabs.map(tab => tab.id),
        ],
      };
    });
    if (storageMode === "backend" && serverOnline)
      await Promise.allSettled(
        selectedTabs.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            { groupId },
            serverApiKey
          )
        )
      );
    setSelectedResultIds(new Set());
    toast.success(
      `Moved ${selectedTabs.length} selected tab${selectedTabs.length === 1 ? "" : "s"}`
    );
  };

  const bulkTagSelected = async () => {
    const tag = bulkTag.trim();
    if (!tag || !selectedTabs.length) return;
    createUndoSnapshot(
      `tagging ${selectedTabs.length} tab${selectedTabs.length === 1 ? "" : "s"}`
    );
    setTabs(current =>
      current.map(tab =>
        selectedResultIds.has(tab.id)
          ? {
              ...tab,
              tags: Array.from(new Set([...tab.tags, tag])),
              updatedAt: new Date().toISOString(),
            }
          : tab
      )
    );
    setTagCatalog(current => ({
      ...current,
      [tag]: current[tag] ?? "Applied from ranked search",
    }));
    if (storageMode === "backend" && serverOnline)
      await Promise.allSettled(
        selectedTabs.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            { tags: Array.from(new Set([...tab.tags, tag])) },
            serverApiKey
          )
        )
      );
    setBulkTag("");
    toast.success(
      `Tagged ${selectedTabs.length} selected tab${selectedTabs.length === 1 ? "" : "s"}`
    );
  };

  const removeSelected = async () => {
    if (!selectedTabs.length) return;
    createUndoSnapshot(
      `archiving ${selectedTabs.length} tab${selectedTabs.length === 1 ? "" : "s"}`
    );
    const removedIds = new Set(selectedTabs.map(tab => tab.id));
    const archivedAt = new Date().toISOString();
    setTabs(current =>
      current.map(tab =>
        removedIds.has(tab.id)
          ? {
              ...tab,
              groupId: null,
              archived: true,
              archivedAt,
              updatedAt: new Date().toISOString(),
            }
          : tab
      )
    );
    setTabOrders(
      current =>
        Object.fromEntries(
          Object.entries(current).map(([groupId, orderedIds]) => [
            groupId,
            orderedIds.filter(id => !removedIds.has(id)),
          ])
        ) as Record<GroupId, string[]>
    );
    if (storageMode === "backend" && serverOnline)
      await Promise.allSettled(
        selectedTabs.map(tab =>
          updateTabOnLocalServer(
            localServerUrl,
            tab.id,
            { archived: true, groupId: null },
            serverApiKey
          )
        )
      );
    setSelectedResultIds(new Set());
    toast(
      `Archived ${selectedTabs.length} selected tab${selectedTabs.length === 1 ? "" : "s"}`
    );
  };

  const deleteTab = async (tab: VaultTab) => {
    if (isArchivePage) {
      tombstonesRef.current = {
        ...tombstonesRef.current,
        tabs: Array.from(new Set([...tombstonesRef.current.tabs, tab.id])),
      };
      setTabs(current => current.filter(item => item.id !== tab.id));
      setTabOrders(
        current =>
          Object.fromEntries(
            Object.entries(current).map(([groupId, orderedIds]) => [
              groupId,
              orderedIds.filter(id => id !== tab.id),
            ])
          ) as Record<GroupId, string[]>
      );
      if (storageMode === "backend" && serverOnline) {
        await deleteTabOnLocalServer(
          localServerUrl,
          tab.id,
          serverApiKey,
          true
        );
      }
      toast.success(`Permanently deleted “${tab.title}”`);
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
    const month = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][capturedAt.getMonth()];
    const pad = (value: number) => String(value).padStart(2, "0");
    const sessionGroup: VaultGroup = {
      id: crypto.randomUUID(),
      name: `Session ${month} ${pad(capturedAt.getDate())} ${pad(capturedAt.getHours())}:${pad(capturedAt.getMinutes())}`,
      description: "Captured from the browser",
      category: "session",
      accent: "#829b65",
      createdAt: now,
      updatedAt: now,
    };
    const newTab: VaultTab = {
      id: crypto.randomUUID(),
      groupId: sessionGroup.id,
      title,
      url,
      domain: normaliseUrl(url),
      note: "",
      agentReview: "",
      viewed: false,
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
        void new BrowserStorageAdapter<PersistedVault>().load().then(saved => {
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
  }, [extensionContext]);

  const createGroup = () => {
    const name = newGroupName.trim();
    if (!name) {
      toast.error("Name the collection first");
      return;
    }
    const id = `collection-${Date.now()}`;
    const now = new Date().toISOString();
    const group: VaultGroup = {
      id,
      name,
      description: newGroupDescription.trim(),
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
    setNewGroupName("");
    setNewGroupDescription("");
    setShowGroupDialog(false);
    selectCollection(id);
    toast.success(`“${name}” is ready`, {
      description: "You can now drag a tab onto its collection row.",
    });
  };

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

  const tabsForCollection = (groupId: GroupId) =>
    sortByStoredOrder(
      tabs.filter(
        tab =>
          tab.groupId !== null &&
          descendantCollectionIds(groupId).has(tab.groupId)
      )
    );

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

  const openSavedTab = async (tab: VaultTab, url = tab.url) => {
    const result = await openTabUrls([url]);
    if (result.openedCount) {
      markOpenedUrlsViewed([tab.url]);
      return;
    }
    toast.error("The browser blocked this tab");
  };

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

  const deleteCollection = (group: VaultGroup) => {
    tombstonesRef.current = {
      ...tombstonesRef.current,
      groups: Array.from(new Set([...tombstonesRef.current.groups, group.id])),
    };
    const deletedIds = descendantCollectionIds(group.id);
    const movedTabs = tabs.filter(
      tab => tab.groupId !== null && deletedIds.has(tab.groupId)
    );
    setTabs(current =>
      current.map(tab =>
        tab.groupId !== null && deletedIds.has(tab.groupId)
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
        Object.entries(current).filter(([id]) => !deletedIds.has(id))
      ) as Record<string, string[]>;
      return {
        ...remaining,
        unassigned: (remaining.unassigned ?? []).filter(
          id => !movedTabs.some(tab => tab.id === id)
        ),
      };
    });
    setVaultGroups(current => current.filter(item => !deletedIds.has(item.id)));
    setSelectedResultIds(
      current =>
        new Set(
          Array.from(current).filter(
            id => !movedTabs.some(tab => tab.id === id)
          )
        )
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

  const requestCollectionDelete = (group: VaultGroup) => {
    if (tabs.some(tab => tab.groupId === group.id)) {
      setCollectionPendingDelete(group);
      return;
    }
    deleteCollection(group);
  };

  const openTabEditor = (tab: VaultTab) =>
    setEditingTab({ ...tab, tags: [...tab.tags] });

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
      domain: normaliseUrl(url),
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

  const handleLibraryDragStart = ({ active }: DragStartEvent) => {
    dragSnapshotRef.current = { tabs, tabOrders };
    lastCrossOverRef.current = undefined;
    setActiveDragId(String(active.id));
    setActiveDragHeight(
      document
        .getElementById(`search-result-${String(active.id)}`)
        ?.getBoundingClientRect().height ?? active.rect.current.initial?.height
    );
  };

  const handleLibraryDragOver = ({
    active,
    over,
    activatorEvent,
    delta,
  }: DragOverEvent) => {
    if (!over || active.id === over.id) return;
    const source = tabs.find(tab => tab.id === active.id);
    const target = tabs.find(tab => tab.id === over.id);
    const groupId = target?.groupId ?? over.data.current?.groupId;
    if (!source || typeof groupId !== "string") return;

    if (source.groupId === groupId) {
      const original = dragSnapshotRef.current?.tabs.find(
        tab => tab.id === active.id
      );
      if (original?.groupId !== groupId && lastCrossOverRef.current) {
        lastCrossOverRef.current.overId = String(over.id);
      }
      if (String(over.id).startsWith("group-container:")) {
        setTabOrders(current => {
          const order = current[groupId] ?? [];
          if (order.at(-1) === source.id) return current;
          return {
            ...current,
            [groupId]: [...order.filter(id => id !== source.id), source.id],
          };
        });
      }
      return;
    }

    const pointerY =
      "clientY" in activatorEvent && typeof activatorEvent.clientY === "number"
        ? activatorEvent.clientY + delta.y
        : undefined;
    const activeRect = active.rect.current.translated;
    const placeAfter = Boolean(
      target &&
        (pointerY !== undefined
          ? pointerY > over.rect.top + over.rect.height / 2
          : activeRect && activeRect.top > over.rect.top + over.rect.height)
    );
    setTabs(current =>
      current.map(tab => (tab.id === source.id ? { ...tab, groupId } : tab))
    );
    setTabOrders(current => {
      const next = Object.fromEntries(
        Object.entries(current).map(([id, orderedIds]) => [
          id,
          orderedIds.filter(id => id !== source.id),
        ])
      ) as Record<GroupId, string[]>;
      const destination = [...(next[groupId] ?? [])];
      const targetIndex = target ? destination.indexOf(target.id) : -1;
      destination.splice(
        targetIndex < 0
          ? destination.length
          : targetIndex + (placeAfter ? 1 : 0),
        0,
        source.id
      );
      return { ...next, [groupId]: destination };
    });
    lastCrossOverRef.current = {
      groupId,
      entryOverId: String(over.id),
      overId: String(over.id),
    };
  };

  const cancelLibraryDrag = () => {
    if (dragSnapshotRef.current) {
      setTabs(dragSnapshotRef.current.tabs);
      setTabOrders(dragSnapshotRef.current.tabOrders);
    }
    dragSnapshotRef.current = undefined;
    lastCrossOverRef.current = undefined;
    setActiveDragId(undefined);
    setActiveDragHeight(undefined);
  };

  const handleLibraryDragEnd = async ({ active, over }: DragEndEvent) => {
    const snapshot = dragSnapshotRef.current;
    const lastCrossOver = lastCrossOverRef.current;
    dragSnapshotRef.current = undefined;
    lastCrossOverRef.current = undefined;
    setActiveDragId(undefined);
    setActiveDragHeight(undefined);
    if (!over) {
      if (snapshot) {
        setTabs(snapshot.tabs);
        setTabOrders(snapshot.tabOrders);
      }
      return;
    }
    const source = tabs.find(tab => tab.id === active.id);
    if (!source) return;
    const original = snapshot?.tabs.find(tab => tab.id === active.id);
    const movedToAnotherGroup = original?.groupId !== source.groupId;
    const finalOverId = movedToAnotherGroup
      ? (lastCrossOver?.overId ?? String(over.id))
      : String(over.id);
    const target = tabs.find(tab => tab.id === finalOverId);
    const stayedOnInitialCrossTarget =
      movedToAnotherGroup &&
      lastCrossOver?.entryOverId === lastCrossOver?.overId;
    let nextTabOrders = tabOrders;
    if (
      active.id !== over.id &&
      target?.groupId === source.groupId &&
      !stayedOnInitialCrossTarget
    ) {
      const sourceKey = orderKey(source.groupId);
      const currentOrder = nextTabOrders[sourceKey] ?? [];
      const sourceIndex = currentOrder.indexOf(source.id);
      const originalTargetIndex = currentOrder.indexOf(target.id);
      const order = currentOrder.filter(id => id !== source.id);
      const targetIndex = order.indexOf(target.id);
      order.splice(
        targetIndex < 0
          ? order.length
          : targetIndex + (sourceIndex < originalTargetIndex ? 1 : 0),
        0,
        source.id
      );
      nextTabOrders = { ...nextTabOrders, [sourceKey]: order };
      setTabOrders(nextTabOrders);
    }

    if (storageMode === "backend" && serverOnline) {
      const activeOrder = (groupId: GroupId | null) => {
        const remaining = new Set(
          tabs
            .filter(tab => !tab.archived && tab.groupId === groupId)
            .map(tab => tab.id)
        );
        const ordered = (nextTabOrders[orderKey(groupId)] ?? []).filter(id =>
          remaining.delete(id)
        );
        return [...ordered, ...Array.from(remaining)];
      };
      try {
        if (movedToAnotherGroup && original) {
          await updateTabOnLocalServer(
            localServerUrl,
            source.id,
            { groupId: source.groupId },
            serverApiKey
          );
          await reorderTabsOnLocalServer(
            localServerUrl,
            original.groupId,
            activeOrder(original.groupId),
            serverApiKey
          );
          await reorderTabsOnLocalServer(
            localServerUrl,
            source.groupId,
            activeOrder(source.groupId),
            serverApiKey
          );
        } else {
          await reorderTabsOnLocalServer(
            localServerUrl,
            source.groupId,
            activeOrder(source.groupId),
            serverApiKey
          );
        }
      } catch {
        setServerOnline(false);
        toast.error("Could not save the new tab order");
        return;
      }
    }

    if (movedToAnotherGroup) {
      const destination =
        vaultGroups.find(group => group.id === source.groupId)?.name ??
        "collection";
      toast.success(`Moved to ${destination}`, {
        description: "Placed at the requested position in this collection.",
      });
    } else if (active.id !== over.id) {
      toast.success("Order updated", {
        description: "The tab has been repositioned in this collection.",
      });
    }
  };

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
      : remoteSearch?.mode === "semantic"
        ? "semantic index"
        : remoteSearch?.mode === "text_fallback"
          ? "text fallback"
          : extensionContext
            ? "offline cache"
            : "preview match";
  const searchStatusCopy = !query
    ? "Drag a tab handle to reorder its collection. Use the collection menu to file it elsewhere, then edit its title, note, URL, tags, or destination."
    : isRemoteSearching
      ? "Ranking results against your local index…"
      : remoteSearch?.mode === "semantic"
        ? `${remoteSearch.semanticIndex?.indexedTabs ?? 0} indexed tabs · ${remoteSearch.semanticIndex?.model ?? "local model"}`
        : (remoteSearchError ?? "Local title, note, and tag matching.");
  const semanticLensTone =
    remoteSearch?.mode === "semantic"
      ? "text-[#56815d]"
      : remoteSearch?.mode === "text_fallback"
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
      <div className="min-h-screen bg-[#f6f3ec] text-[#18261f] paper-grain">
        <main className="min-h-screen">
          <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-[#ded9cd]/85 bg-[#f6f3ec]/88 px-5 backdrop-blur-xl sm:px-7 lg:px-9">
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 text-[12px] text-[#7a7e76] sm:flex">
                <BookMarked className="h-3.5 w-3.5" />
                <span>My library</span>
                <ChevronRight className="h-3 w-3" />
                <span className="font-semibold text-[#29342d]">
                  {workspaceLabel}
                </span>
              </div>
              <div className="sm:hidden">
                <BrandMark className="h-7 w-7" />
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() =>
                  toast("Command center", {
                    description: "Shortcuts are ready when you are.",
                  })
                }
                className="hidden items-center gap-2 rounded-md border border-[#ded9cd] bg-[#fffdf8] px-2.5 py-1.5 text-[10px] font-medium text-[#737870] transition hover:border-[#bbb4a5] sm:flex"
              >
                <Command className="h-3 w-3" /> Command{" "}
                <span className="border-l border-[#ddd8cb] pl-2 font-mono">
                  K
                </span>
              </button>
              {extensionContext ? (
                <button
                  onClick={() => void captureCurrentTab()}
                  className="inline-flex items-center gap-2 rounded-md bg-[#e95224] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#d94a1e] active:scale-[0.98]"
                >
                  <Plus className="h-3.5 w-3.5" />{" "}
                  <span className="hidden sm:inline">Save active tab</span>
                </button>
              ) : (
                <button
                  onClick={() => setLocation("/transfer")}
                  className="inline-flex items-center gap-2 rounded-md border border-[#ded9cd] bg-[#fffdf8] px-3 py-2 text-[11px] font-bold transition hover:border-[#c3bcae] hover:bg-[#fffaf4]"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" />{" "}
                  <span className="hidden sm:inline">Import & Export</span>
                </button>
              )}
            </div>
          </header>

          <div className="mx-auto max-w-[1540px] px-5 py-7 sm:px-7 lg:px-9 lg:py-9">
            <section className="rise-in flex flex-col gap-5 border-b border-[#dcd7cc] pb-7 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8e85]">
                  <BrandMark className="h-4 w-4" />
                  {isArchivePage
                    ? "Recovery"
                    : isHiddenPage
                      ? "Snoozed"
                      : "Library"}
                </p>
                <h1 className="mt-3 font-['DM_Sans'] text-[34px] font-bold leading-[0.98] tracking-[-0.065em] text-[#18261f] sm:text-[44px]">
                  {isArchivePage
                    ? "Archive"
                    : isHiddenPage
                      ? "Hidden"
                      : "All tabs"}
                </h1>
                <p className="mt-3 max-w-xl text-[13px] leading-6 text-[#697068]">
                  {isArchivePage
                    ? "Archived links stay recoverable here. Restore them with PATCH or permanently remove them from this view."
                    : isHiddenPage
                      ? "Hidden tabs return automatically at their UTC deadline. Unhide or prolong them here."
                      : "Browse every active visible saved link. Change the view to scan rows, read previews, or review collection groups."}
                </p>
              </div>
              <button
                onClick={() => setLocation("/dashboard")}
                className="inline-flex shrink-0 items-center gap-2 border-l border-[#d6d0c4] pl-4 text-left font-mono text-[9px] uppercase tracking-[0.09em] text-[#6d746b] transition hover:text-[#e95224] active:scale-[0.98]"
                title="Open dashboard"
              >
                <BrandMark className="h-3.5 w-3.5 shrink-0" />
                {libraryStorageLabel}
                <ChevronRight className="h-3 w-3" />
              </button>
            </section>

            <div className="rise-in-delay mt-7">
              <section>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#8e9189]">
                      {query
                        ? "Search results"
                        : isArchivePage
                          ? "Archived items"
                          : isHiddenPage
                            ? "Hidden items"
                            : "Library items"}
                      <ContextHelp
                        title="Search your library"
                        side="bottom"
                        align="start"
                        tip="Try a topic, a phrase from your notes, or a tag."
                      >
                        Search checks tab titles, notes, and tags. When the
                        semantic model is ready, it can also rank results by
                        related meaning. Use the shelf menu to narrow the scope.
                      </ContextHelp>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <h2 className="font-['DM_Sans'] text-[21px] font-bold tracking-[-0.045em]">
                        {query
                          ? isRemoteSearching
                            ? "Searching local knowledge…"
                            : `${visibleTabs.length} ${remoteSearch?.mode === "semantic" ? "matched on meaning" : "matched locally"}`
                          : `${visibleTabs.length} tabs in ${workspaceLabel}`}
                      </h2>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {query && (
                      <p className="hidden max-w-[250px] text-right text-[11px] leading-5 text-[#80847d] md:block">
                        {searchStatusCopy}
                      </p>
                    )}
                    {!query && isAllTabsPage && (
                      <>
                        <button
                          onClick={() => void quickClean()}
                          disabled={isQuickCleaning}
                          className="rounded border border-[#d9d3c6] bg-[#fffdf8] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[#687067] hover:border-[#e95224] hover:text-[#e95224] disabled:opacity-50"
                        >
                          {isQuickCleaning ? "Cleaning…" : "Quick clean"}
                        </button>
                        <button
                          onClick={() => setLocation("/deduplicate")}
                          className="rounded border border-[#d9d3c6] bg-[#fffdf8] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[#687067] hover:border-[#e95224] hover:text-[#e95224]"
                        >
                          Advanced Dedup
                        </button>
                      </>
                    )}
                    {!query &&
                      !isArchivePage &&
                      !isHiddenPage &&
                      tabView !== "groups" && (
                        <button
                          onClick={() => {
                            setSelectionMode(current => !current);
                            setSelectedResultIds(new Set());
                          }}
                          className={`rounded border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] transition ${selectionMode ? "border-[#e95224] bg-[#fff0ea] text-[#c84b26]" : "border-[#d9d3c6] bg-[#fffdf8] text-[#687067] hover:border-[#e95224] hover:text-[#e95224]"}`}
                        >
                          {selectionMode ? "Done selecting" : "Select tabs"}
                        </button>
                      )}
                  </div>
                </div>
                <label className="mt-5 flex h-12 items-center gap-3 border-b border-[#bcb6a8] bg-[#fffdf8] px-4 transition focus-within:border-[#e95224] focus-within:shadow-[0_8px_24px_rgba(24,38,31,0.04)]">
                  <Search className="h-4 w-4 text-[#e95224]" />
                  <input
                    value={query}
                    onChange={event => {
                      setQuery(event.target.value);
                      setActiveResultIndex(0);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Ask your links anything…"
                    aria-label="Search your TabVault library"
                    aria-activedescendant={
                      query && visibleTabs[activeResultIndex]
                        ? `search-result-${visibleTabs[activeResultIndex].id}`
                        : undefined
                    }
                    className="min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-[#a1a39b]"
                  />
                  <select
                    value={searchGroupFilter}
                    onChange={event =>
                      setSearchGroupFilter(
                        event.target.value as "all" | GroupId
                      )
                    }
                    aria-label="Filter search by collection"
                    className="max-w-[118px] bg-transparent font-mono text-[9px] uppercase tracking-[0.06em] text-[#6f756d] outline-none"
                  >
                    <option value="all">All shelves</option>
                    {vaultGroups.map(group => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  <span
                    className={`hidden items-center gap-1.5 border-l border-[#e3ded3] pl-3 font-mono text-[9px] uppercase tracking-[0.08em] sm:flex ${semanticLensTone}`}
                    title="Semantic lens: local matching and meaning-based ranking when the index is ready"
                  >
                    <Sparkles
                      className={`h-3 w-3 ${isRemoteSearching ? "animate-pulse" : ""}`}
                    />
                    <span className="text-[#697068]">lens</span>
                    <span>{semanticLensLabel}</span>
                  </span>
                  {query && (
                    <span className="hidden rounded border border-[#ded9cd] px-1.5 py-1 font-mono text-[8px] text-[#858980] 2xl:inline">
                      ↑↓ navigate · ↵ open
                    </span>
                  )}
                </label>
                {selectionActive && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-[#dfdbd0] bg-[#f9f7f1] px-3 py-2.5">
                    <button
                      onClick={() =>
                        setSelectedResultIds(
                          selectedResultIds.size === visibleTabs.length
                            ? new Set()
                            : new Set(visibleTabs.map(tab => tab.id))
                        )
                      }
                      className="rounded border border-[#d9d3c6] bg-[#fffdf8] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[#617066] hover:border-[#e95224] hover:text-[#e95224]"
                    >
                      {selectedResultIds.size === visibleTabs.length &&
                      visibleTabs.length
                        ? "Clear"
                        : "Select all"}
                    </button>
                    <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#7b8078]">
                      {selectedResultIds.size} marked
                    </span>
                    {selectedResultIds.size > 0 && (
                      <>
                        <select
                          defaultValue=""
                          aria-label="Move selected tabs to collection"
                          onChange={event => {
                            if (event.target.value)
                              void bulkMoveSelected(event.target.value);
                            event.currentTarget.value = "";
                          }}
                          className="rounded border border-[#d9d3c6] bg-[#fffdf8] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[#617066] outline-none"
                        >
                          <option value="" disabled>
                            Move to…
                          </option>
                          {vaultGroups
                            .filter(group => group.category === "manual")
                            .map(group => (
                              <option key={group.id} value={group.id}>
                                {group.name}
                              </option>
                            ))}
                        </select>
                        <div className="flex overflow-hidden rounded border border-[#d9d3c6] bg-[#fffdf8]">
                          <input
                            value={bulkTag}
                            onChange={event => setBulkTag(event.target.value)}
                            onKeyDown={event => {
                              if (event.key === "Enter") void bulkTagSelected();
                            }}
                            placeholder="Add tag"
                            className="w-20 bg-transparent px-2 py-1.5 text-[10px] outline-none placeholder:text-[#aaa9a1]"
                          />
                          <button
                            onClick={() => void bulkTagSelected()}
                            className="border-l border-[#d9d3c6] px-2 font-mono text-[9px] uppercase tracking-[0.06em] text-[#617066] hover:bg-[#fff0ea] hover:text-[#e95224]"
                          >
                            Tag
                          </button>
                        </div>
                        <button
                          onClick={() => void removeSelected()}
                          className="rounded border border-[#e6b7a7] bg-[#fff8f4] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[#bd4a29] hover:bg-[#fff0ea]"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                )}
                {query && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-[#dfdbd0] bg-[#fffdf8] px-3 py-2">
                    <button
                      onClick={() => setShowSavedSearches(!showSavedSearches)}
                      className="rounded border border-[#d9d3c6] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[#617066] hover:border-[#e95224] hover:text-[#e95224]"
                    >
                      Views{" "}
                      {savedSearches.length ? `· ${savedSearches.length}` : ""}
                    </button>
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
                        <button
                          onClick={() => void undoLastBulkAction()}
                          className="font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[#2f773c] hover:underline"
                        >
                          Undo
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {query && showSavedSearches && (
                  <div className="border-b border-[#dfdbd0] bg-[#f9f7f1] p-3">
                    <div className="flex gap-2">
                      <input
                        value={savedSearchName}
                        onChange={event =>
                          setSavedSearchName(event.target.value)
                        }
                        onKeyDown={event => {
                          if (event.key === "Enter") saveCurrentSearch();
                        }}
                        placeholder={query}
                        className="min-w-0 flex-1 border-b border-[#bcb6a8] bg-transparent px-1 py-1.5 text-[11px] outline-none focus:border-[#e95224]"
                      />
                      <button
                        onClick={saveCurrentSearch}
                        className="rounded bg-[#e95224] px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-white hover:bg-[#d94a1e]"
                      >
                        Save view
                      </button>
                    </div>
                    {savedSearches.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {savedSearches.map(view => (
                          <div
                            key={view.id}
                            className="flex items-center gap-2 rounded bg-[#fffdf8] px-2 py-1.5"
                          >
                            <button
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
                            </button>
                            <button
                              onClick={() =>
                                setSavedSearches(current =>
                                  current.filter(item => item.id !== view.id)
                                )
                              }
                              className="rounded p-1 text-[#989990] hover:bg-[#fff0ea] hover:text-[#c84725]"
                              aria-label={`Delete ${view.name} saved search`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#dcd7cc] pt-3">
                  <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#838980]">
                    {query
                      ? `${visibleTabs.length} results`
                      : `${visibleTabs.length} items`}
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
                    <button
                      onClick={() => {
                        setSearchGroupFilter("all");
                        setSelectionMode(false);
                        setSelectedResultIds(new Set());
                        setTabView("groups");
                      }}
                      className={`p-2 ${tabView === "groups" ? "bg-[#edf2ea] text-[#36533a]" : "text-[#858980] hover:bg-[#f7f4ed]"}`}
                      aria-label="Collection-group board view"
                      aria-pressed={tabView === "groups"}
                    >
                      <Boxes className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setTabView("standard")}
                      className={`border-l border-[#d9d3c6] p-2 ${tabView === "standard" ? "bg-[#edf2ea] text-[#36533a]" : "text-[#858980] hover:bg-[#f7f4ed]"}`}
                      aria-label="Standard tab view"
                      aria-pressed={tabView === "standard"}
                    >
                      <LayoutList className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setTabView("compact")}
                      className={`border-l border-[#d9d3c6] p-2 ${tabView === "compact" ? "bg-[#edf2ea] text-[#36533a]" : "text-[#858980] hover:bg-[#f7f4ed]"}`}
                      aria-label="Compact tab view"
                      aria-pressed={tabView === "compact"}
                    >
                      <Rows3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setTabView("preview")}
                      className={`border-l border-[#d9d3c6] p-2 ${tabView === "preview" ? "bg-[#edf2ea] text-[#36533a]" : "text-[#858980] hover:bg-[#f7f4ed]"}`}
                      aria-label="Instant-preview tab view"
                      aria-pressed={tabView === "preview"}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
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
                    onCreate={() => setShowGroupDialog(true)}
                    onHide={(groupId, duration) =>
                      void changeGroupVisibility(groupId, "hide", duration)
                    }
                  />
                ) : visibleTabs.length ||
                  (!isArchivePage && !isHiddenPage && !query) ? (
                  <>
                    {!isArchivePage && !isHiddenPage && (
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
                      fallbackMode={remoteSearch?.mode}
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
                      activeDragHeight={activeDragHeight}
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

        {showGroupDialog && (
          <CreateCollectionDialog
            name={newGroupName}
            description={newGroupDescription}
            onNameChange={setNewGroupName}
            onDescriptionChange={setNewGroupDescription}
            onClose={() => setShowGroupDialog(false)}
            onCreate={createGroup}
          />
        )}

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
            onChange={setEditingTab}
            onTagDraftChange={setTagDraft}
            onAddTag={addTagToTab}
            onClose={() => setEditingTab(null)}
            onSave={saveTab}
          />
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDragTab ? (
          <TabDragPreview
            tab={activeDragTab}
            viewMode={tabView === "groups" ? "standard" : tabView}
            query={query}
            selectionEnabled={selectionMode}
            isSelected={selectedResultIds.has(activeDragTab.id)}
            score={semanticScores.get(activeDragTab.id)}
            fallbackMode={remoteSearch?.mode}
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
