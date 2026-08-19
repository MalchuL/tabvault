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
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  addExtensionMessageListener,
  checkLocalServer,
  configureExtensionHealthAlerts,
  configureIndexHealthCheck,
  DEFAULT_TABVAULT_API_KEY,
  DEFAULT_TABVAULT_SERVER_URL,
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
  rebuildSemanticIndex,
  refreshLibraryFromServer,
  restoreTabsOnLocalServer,
  runIndexHealthCheck,
  saveTabToLocalServer,
  searchLocalServer,
  updateTabOnLocalServer,
  writeApiKey,
  writeLocalServerUrl,
  type ChromeTabSnapshot,
  type LocalSearchResponse,
  type SemanticIndexStatus,
  type StorageMode,
  type SyncStatus,
} from "@/lib/extension";
import { fromServerDocument, toServerDocument } from "@/lib/library";
import { TabList, type TabViewMode } from "@/components/TabList";
import { ContextHelp } from "@/components/ContextHelp";
import { canonicalizeTabUrl } from "@/lib/url";
import {
  BrowserStorageAdapter,
  HybridStorageAdapter,
  ServerStorageAdapter,
} from "@/lib/persistence";
import {
  Archive,
  ArrowDownToLine,
  BookMarked,
  Boxes,
  ChevronRight,
  Command,
  FolderPlus,
  FolderOpen,
  Eye,
  LayoutList,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Rows3,
  Save,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

const logoUrl = "/icon-128.png";

type GroupId = string;

type VaultGroup = {
  id: GroupId;
  name: string;
  parent?: GroupId;
  accent: string;
};

type LibraryViewMode = TabViewMode | "groups";

type VaultTab = {
  id: string;
  groupId: GroupId;
  title: string;
  url: string;
  domain: string;
  note: string;
  tags: string[];
  color: string;
  icon: string;
  updated: string;
  archived?: boolean;
  archivedAt?: string | null;
};

type PersistedVault = {
  tabs: VaultTab[];
  vaultGroups: VaultGroup[];
  tagCatalog: Record<string, string>;
  tabOrders: Record<GroupId, string[]>;
  savedSearches?: SavedSearch[];
  tabView?: LibraryViewMode;
};

type SavedSearch = {
  id: string;
  name: string;
  query: string;
  groupId: "all" | GroupId;
};
type UndoSnapshot = {
  id: string;
  label: string;
  tabs: VaultTab[];
  tabOrders: Record<GroupId, string[]>;
  tagCatalog: Record<string, string>;
};

const initialGroups: VaultGroup[] = [
  { id: "inbox", name: "Inbox", accent: "#F05A28" },
  { id: "research", name: "Research", accent: "#829b65" },
  {
    id: "llm-papers",
    name: "LLM papers",
    parent: "research",
    accent: "#7aa6a1",
  },
  { id: "build", name: "Build", accent: "#7c8bba" },
  { id: "filed", name: "Filed", accent: "#bb9b68" },
];

const initialTags: Record<string, string> = {
  product: "Product thinking and decisions",
  "read later": "Links worth revisiting",
  "vector search": "Semantic retrieval and embeddings",
  docs: "Documentation and reference material",
  mcp: "Model Context Protocol",
  reference: "Primary technical reference",
  chrome: "Chrome extension implementation",
  ux: "Interface and workflow design",
  "local-first": "Local ownership and resilience",
  papers: "Research papers",
  server: "Local server architecture",
};

const startingTabs: VaultTab[] = [
  {
    id: "t-1001",
    groupId: "inbox",
    title: "Agents can organize the web better than we can",
    url: "https://notes.example.com/agents-organize-web",
    domain: "notes.example.com",
    note: "A useful framing for the agent-facing contract. Keep for product language.",
    tags: ["product", "read later"],
    color: "#EDB958",
    icon: "A",
    updated: "12m",
  },
  {
    id: "t-1002",
    groupId: "inbox",
    title: "Zvec — embedded vector database",
    url: "https://zvec.org/docs",
    domain: "zvec.org",
    note: "Check its persistence model and rebuild story before architecture review.",
    tags: ["vector search", "docs"],
    color: "#6b8c7e",
    icon: "Z",
    updated: "26m",
  },
  {
    id: "t-1003",
    groupId: "inbox",
    title: "Model Context Protocol specification",
    url: "https://modelcontextprotocol.io/specification",
    domain: "modelcontextprotocol.io",
    note: "Reference implementation details for import_data and fields=minimal.",
    tags: ["mcp", "reference"],
    color: "#0e3c34",
    icon: "M",
    updated: "1h",
  },
  {
    id: "t-1004",
    groupId: "inbox",
    title: "A guide to browser extension side panels",
    url: "https://developer.chrome.com/docs/extensions/reference/api/sidePanel",
    domain: "developer.chrome.com",
    note: "Evaluate persistent side panel navigation for nested group drag-and-drop.",
    tags: ["chrome", "ux"],
    color: "#4385f4",
    icon: "C",
    updated: "2h",
  },
  {
    id: "t-1005",
    groupId: "inbox",
    title: "Local-first software: You own your work",
    url: "https://www.inkandswitch.com/local-first/",
    domain: "inkandswitch.com",
    note: "Strong philosophy reference for the local server as the source of truth.",
    tags: ["local-first"],
    color: "#e5773f",
    icon: "I",
    updated: "Yesterday",
  },
  {
    id: "t-1006",
    groupId: "llm-papers",
    title: "Flow Matching for Generative Modeling",
    url: "https://arxiv.org/abs/2210.02747",
    domain: "arxiv.org",
    note: "Re-read the section on ODE solvers.",
    tags: ["read later", "papers"],
    color: "#b83b36",
    icon: "arX",
    updated: "2d",
  },
  {
    id: "t-1007",
    groupId: "build",
    title: "FastAPI — validation error handling",
    url: "https://fastapi.tiangolo.com/tutorial/handling-errors/",
    domain: "fastapi.tiangolo.com",
    note: "Potential source shape for batched validation reports.",
    tags: ["server", "docs"],
    color: "#009688",
    icon: "F",
    updated: "3d",
  },
];

function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="TabVault"
      className={`${className} object-contain`}
    />
  );
}

function CollectionDropShelf({ groups }: { groups: VaultGroup[] }) {
  return (
    <div
      data-testid="collection-drop-shelf"
      className="flex flex-wrap items-center gap-1.5 border-b border-[#dfdbd0] bg-[#f9f7f1] px-3 py-1.5"
    >
      <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#9a9c95]">
        Quick move
      </span>
      {groups.map(group => (
        <CollectionDropChip key={group.id} group={group} />
      ))}
    </div>
  );
}

function CollectionDropChip({ group }: { group: VaultGroup }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `collection-drop:${group.id}`,
    data: { type: "collection-drop", groupId: group.id },
  });

  return (
    <div
      ref={setNodeRef}
      data-testid={`collection-drop-${group.id}`}
      data-drop-active={isOver ? "true" : "false"}
      className={`flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.06em] transition ${isOver ? "border-[#e95224] bg-[#fff0ea] text-[#c84b26] shadow-[0_0_0_2px_rgba(233,82,36,0.12)]" : "border-[#d9d3c6] bg-[#fffdf8] text-[#7a7e76]"}`}
      aria-label={`Drop a tab into ${group.name}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: group.accent }}
      />
      {isOver ? `Move to ${group.name}` : group.name}
    </div>
  );
}

function TabDragOverlay({ tab }: { tab: VaultTab }) {
  return (
    <article
      data-testid="tab-drag-overlay"
      className="flex w-[min(900px,calc(100vw-3rem))] gap-3 border border-[#d4b092] bg-[#fffdf8] px-3 py-4 shadow-[0_16px_36px_rgba(24,38,31,0.18)]"
    >
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-[#c3c3bb]"
        aria-hidden="true"
      >
        <Rows3 className="h-4 w-4" />
      </span>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] text-[9px] font-bold text-white"
        style={{ backgroundColor: tab.color }}
      >
        {tab.icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold tracking-[-0.015em] text-[#26342c]">
          {tab.title}
        </p>
        <p className="mt-1 truncate text-[10px] font-medium text-[#84877f]">
          {tab.domain}
        </p>
      </div>
    </article>
  );
}

function CollectionBoard({
  groups,
  tabs,
  onOpen,
  onShare,
  onDelete,
  onBrowse,
  onCreate,
}: {
  groups: VaultGroup[];
  tabs: VaultTab[];
  onOpen: (group: VaultGroup) => void;
  onShare: (group: VaultGroup) => void;
  onDelete: (group: VaultGroup) => void;
  onBrowse: (groupId: GroupId) => void;
  onCreate: () => void;
}) {
  const collectionIds = (groupId: GroupId) => {
    const ids = new Set<GroupId>([groupId]);
    let changed = true;
    while (changed) {
      changed = false;
      groups.forEach(group => {
        if (group.parent && ids.has(group.parent) && !ids.has(group.id)) {
          ids.add(group.id);
          changed = true;
        }
      });
    }
    return ids;
  };
  const collections = groups.filter(group => !group.parent);

  return (
    <div
      data-testid="group-board"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {collections.map(group => {
        const groupTabs = tabs.filter(tab =>
          collectionIds(group.id).has(tab.groupId)
        );
        return (
          <article
            key={group.id}
            data-testid={`group-card-${group.id}`}
            className="group flex min-h-[210px] flex-col border border-[#dcd7cc] bg-[#fffdf8] p-5 shadow-[0_10px_24px_rgba(24,38,31,0.035)] transition hover:-translate-y-0.5 hover:border-[#c7c1b4]"
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => onBrowse(group.id)}
                data-testid={`group-browse-${group.id}`}
                className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e95224]"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: group.accent }}
                />
                <span className="truncate text-[15px] font-bold tracking-[-0.025em] text-[#26342c]">
                  {group.name}
                </span>
              </button>
              <div
                className="flex shrink-0 items-center gap-0.5"
                aria-label={`${group.name} collection actions`}
              >
                <button
                  onClick={() => onOpen(group)}
                  className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                  aria-label={`Open all tabs in ${group.name}`}
                  title="Open all tabs"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onShare(group)}
                  className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
                  aria-label={`Copy ${group.name} as Markdown`}
                  title="Copy as Markdown"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDelete(group)}
                  disabled={group.id === "inbox"}
                  className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#c84b26] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224] disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label={
                    group.id === "inbox"
                      ? "Inbox cannot be deleted"
                      : `Delete ${group.name}`
                  }
                  title={
                    group.id === "inbox"
                      ? "Inbox is protected"
                      : "Delete collection"
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <button
              onClick={() => onBrowse(group.id)}
              className="mt-6 flex flex-1 items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e95224]"
              aria-label={`Browse ${group.name}`}
            >
              {groupTabs.slice(0, 4).map(tab => (
                <span
                  key={tab.id}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e2ddd2] bg-[#f8f5ed] text-[11px] font-bold text-[#536259]"
                  title={tab.title}
                >
                  {tab.icon.slice(0, 2)}
                </span>
              ))}
              {groupTabs.length > 4 ? (
                <span className="flex h-9 min-w-9 items-center justify-center rounded-md border border-[#e2ddd2] bg-[#f8f5ed] px-2 font-mono text-[10px] text-[#667268]">
                  +{groupTabs.length - 4}
                </span>
              ) : null}
              {!groupTabs.length ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#92958d]">
                  Empty collection
                </span>
              ) : null}
            </button>
            <div className="mt-5 flex items-center justify-between border-t border-[#e8e3d8] pt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[#858980]">
              <span>{groupTabs.length} tabs</span>
              <button
                onClick={() => onBrowse(group.id)}
                className="font-semibold text-[#667268] hover:text-[#e95224]"
              >
                Browse →
              </button>
            </div>
          </article>
        );
      })}
      <button
        onClick={onCreate}
        data-testid="create-collection-card"
        className="flex min-h-[210px] flex-col items-center justify-center border border-dashed border-[#c9c2b5] bg-[#f8f5ed]/60 px-6 text-center transition hover:border-[#e95224] hover:bg-[#fff7f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e95224]"
      >
        <FolderPlus className="h-5 w-5 text-[#e95224]" />
        <span className="mt-4 text-[14px] font-bold tracking-[-0.02em] text-[#3b4a40]">
          Create collection
        </span>
        <span className="mt-1 text-[11px] leading-5 text-[#7c8179]">
          Add a new place for related links.
        </span>
      </button>
    </div>
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
    const shelfCollisions = pointerWithin(args).filter(({ id }) =>
      String(id).startsWith("collection-drop:")
    );
    if (shelfCollisions.length) return shelfCollisions;
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        container => container.data.current?.type !== "collection-drop"
      ),
    });
  }, []);
  const [tabs, setTabs] = useState(startingTabs);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [tabOrders, setTabOrders] = useState<Record<GroupId, string[]>>(() =>
    startingTabs.reduce<Record<GroupId, string[]>>(
      (orders, tab) => ({
        ...orders,
        [tab.groupId]: [...(orders[tab.groupId] ?? []), tab.id],
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
  const [showModelPanel, setShowModelPanel] = useState(false);
  const [isRebuildingIndex, setIsRebuildingIndex] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>("local");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>();
  const [localServerUrl, setLocalServerUrl] = useState(
    DEFAULT_TABVAULT_SERVER_URL
  );
  const [serverApiKey, setServerApiKey] = useState(DEFAULT_TABVAULT_API_KEY);
  const [showConnectionSettings, setShowConnectionSettings] = useState(false);
  const [pendingServerUrl, setPendingServerUrl] = useState(
    DEFAULT_TABVAULT_SERVER_URL
  );
  const [pendingApiKey, setPendingApiKey] = useState(DEFAULT_TABVAULT_API_KEY);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [showMobileRail, setShowMobileRail] = useState(false);
  const [editingTab, setEditingTab] = useState<VaultTab | null>(null);
  const [editingCollection, setEditingCollection] = useState<VaultGroup | null>(
    null
  );
  const [collectionPendingDelete, setCollectionPendingDelete] =
    useState<VaultGroup | null>(null);
  const [tabPendingDelete, setTabPendingDelete] = useState<VaultTab | null>(
    null
  );
  const [storageReady, setStorageReady] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [isRefreshingLibrary, setIsRefreshingLibrary] = useState(false);
  const libraryRefreshInFlight = useRef(false);
  const vaultRef = useRef<PersistedVault | null>(null);
  const refreshLibraryRef = useRef<
    (options?: { silent?: boolean }) => Promise<void>
  >(async () => undefined);

  const descendantCollectionIds = (id: GroupId) => {
    const ids = new Set<GroupId>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      vaultGroups.forEach(group => {
        if (group.parent && ids.has(group.parent) && !ids.has(group.id)) {
          ids.add(group.id);
          changed = true;
        }
      });
    }
    return ids;
  };

  const currentVault = (): PersistedVault => ({
    tabs,
    vaultGroups,
    tagCatalog,
    tabOrders,
    savedSearches,
    tabView,
  });

  const applyVault = (vault: PersistedVault) => {
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
          (tabOrders[a.groupId] ?? []).indexOf(a.id) -
          (tabOrders[b.groupId] ?? []).indexOf(b.id)
        );
      }),
    [tabOrders, vaultGroups]
  );

  const isAllTabsPage = !location.startsWith("/archive");
  const isArchivePage = location === "/archive";
  const workspaceLabel = isArchivePage ? "Archive" : "All Tabs";
  const isGroupBoard = tabView === "groups" && !isArchivePage && !query;
  const activeTabs = useMemo(() => tabs.filter(tab => !tab.archived), [tabs]);
  const archivedTabs = useMemo(() => tabs.filter(tab => tab.archived), [tabs]);
  const selectedGroupTabs = sortByStoredOrder(
    isArchivePage
      ? archivedTabs
      : activeTabs.filter(
          tab =>
            searchGroupFilter === "all" ||
            descendantCollectionIds(searchGroupFilter).has(tab.groupId)
        )
  );
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
            : "inbox";
        return {
          id: tab.id,
          groupId,
          title: tab.title,
          url: tab.url,
          domain: normaliseUrl(tab.url),
          note: tab.note ?? "",
          tags: tab.tags ?? [],
          color: "#6b8c7e",
          icon: tab.title.slice(0, 1).toUpperCase() || "T",
          updated: tab.updatedAt ? "synced" : "local",
        };
      });
    }
    return sortByStoredOrder(
      (isArchivePage ? archivedTabs : activeTabs).filter(
        tab =>
          (searchGroupFilter === "all" || tab.groupId === searchGroupFilter) &&
          [tab.title, tab.note, tab.domain, ...tab.tags]
            .join(" ")
            .toLowerCase()
            .includes(normalized)
      )
    );
  }, [
    activeTabs,
    archivedTabs,
    isArchivePage,
    selectedGroupTabs,
    query,
    vaultGroups,
    remoteSearch,
    searchGroupFilter,
    sortByStoredOrder,
  ]);

  const selectCollection = (id: GroupId) => {
    setSearchGroupFilter(id);
    setQuery("");
    setTabView("standard");
    setShowMobileRail(false);
    setLocation("/");
  };

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
          setTabs(saved.tabs);
          setVaultGroups(saved.vaultGroups);
          setTagCatalog(saved.tagCatalog);
          setTabOrders(saved.tabOrders);
          setSavedSearches(saved.savedSearches ?? []);
          setTabView(saved.tabView ?? "standard");
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
    if (!storageReady) return;
    const browser = new BrowserStorageAdapter<PersistedVault>();
    const server =
      storageMode === "backend" && serverOnline
        ? new ServerStorageAdapter<Record<string, unknown>>(
            localServerUrl,
            serverApiKey
          )
        : null;
    const fallback: PersistedVault = {
      tabs,
      vaultGroups,
      tagCatalog,
      tabOrders,
      savedSearches,
      tabView,
    };
    const adapter = new HybridStorageAdapter(
      browser,
      server,
      toServerDocument,
      document => fromServerDocument(document, fallback),
      storageMode === "backend"
    );
    void adapter
      .saveWithStatus(fallback)
      .then(status => setSyncStatus(status))
      .catch(() => {
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
    serverOnline,
    storageMode,
    localServerUrl,
    serverApiKey,
  ]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([readLocalServerUrl(), readApiKey()]).then(
      async ([url, apiKey]) => {
        if (cancelled) return;
        setLocalServerUrl(url);
        setServerApiKey(apiKey);
        setPendingServerUrl(url);
        setPendingApiKey(apiKey);
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
    if (storageMode !== "backend" || !serverOnline) {
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
            setRemoteSearchError(
              response.mode === "text_fallback"
                ? (response.semanticIndex?.lastError ??
                    "Embedding provider unavailable")
                : null
            );
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
  ]);

  useEffect(() => {
    setSelectedResultIds(new Set());
    setActiveResultIndex(0);
  }, [query, searchGroupFilter]);

  const refreshLocalServer = async () => {
    try {
      const health = await checkLocalServer(localServerUrl, serverApiKey);
      setServerOnline(health.status === "ok");
      setSemanticIndexStatus(health.semanticIndex ?? null);
      toast.success("TabVault API connected", {
        description: `Schema v${health.schemaVersion} is ready at ${localServerUrl}.`,
      });
    } catch {
      setServerOnline(false);
      setSemanticIndexStatus(null);
      toast.error("TabVault API is unreachable or rejected the key", {
        description: `Check the endpoint and bearer key for ${localServerUrl}.`,
      });
    }
  };

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

  const saveConnectionSettings = async () => {
    let normalizedUrl: string;
    try {
      const parsed = new URL(pendingServerUrl.trim());
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("protocol");
      normalizedUrl = parsed.toString().replace(/\/+$/, "");
    } catch {
      toast.error("Enter an absolute http:// or https:// API address");
      return;
    }
    const apiKey = pendingApiKey.trim() || DEFAULT_TABVAULT_API_KEY;
    setLocalServerUrl(normalizedUrl);
    setServerApiKey(apiKey);
    await Promise.all([
      writeLocalServerUrl(normalizedUrl),
      writeApiKey(apiKey),
    ]);
    try {
      const health = await checkLocalServer(normalizedUrl, apiKey);
      setServerOnline(health.status === "ok");
      setSemanticIndexStatus(health.semanticIndex ?? null);
      const fallback: PersistedVault = {
        tabs,
        vaultGroups,
        tagCatalog,
        tabOrders,
        savedSearches,
        tabView,
      };
      const { vault: hydrated } = await refreshLibraryFromServer(
        normalizedUrl,
        apiKey,
        fallback
      );
      applyVault(hydrated);
      setShowConnectionSettings(false);
      toast.success("Server connection saved", {
        description: `Authenticated API access is active at ${normalizedUrl}.`,
      });
    } catch {
      setServerOnline(false);
      toast.error("Connection was not accepted", {
        description:
          "Verify the bearer key, server address, and server CORS configuration.",
      });
    }
  };

  const rebuildIndex = async () => {
    if (!extensionContext || !serverOnline) {
      toast.error("Connect the local server before rebuilding the index");
      return;
    }
    setIsRebuildingIndex(true);
    try {
      const status = await rebuildSemanticIndex(localServerUrl, serverApiKey);
      setSemanticIndexStatus(status);
      toast.success("Semantic index rebuilt", {
        description: `${status.indexedTabs} tabs are ready for ranked search.`,
      });
    } catch {
      toast.error("Could not rebuild the semantic index");
    } finally {
      setIsRebuildingIndex(false);
    }
  };

  const updateHealthSchedule = async (
    intervalSeconds: number,
    notifyOnNeedsAttention = Boolean(
      semanticIndexStatus?.healthCheck?.notifyOnNeedsAttention
    )
  ) => {
    if (!extensionContext || !serverOnline) {
      toast.error(
        "Connect the local server before scheduling index health checks"
      );
      return;
    }
    try {
      const healthCheck = await configureIndexHealthCheck(
        localServerUrl,
        intervalSeconds,
        notifyOnNeedsAttention,
        serverApiKey
      );
      await configureExtensionHealthAlerts(
        localServerUrl,
        healthCheck,
        serverApiKey
      );
      setSemanticIndexStatus(current =>
        current ? { ...current, healthCheck } : current
      );
      toast.success(
        intervalSeconds
          ? "Index health check scheduled"
          : "Index health check disabled",
        {
          description: intervalSeconds
            ? `The local server will check every ${Math.round(intervalSeconds / 60)} minutes while it is running.`
            : "Manual checks remain available.",
        }
      );
    } catch {
      toast.error("Could not save the health-check schedule");
    }
  };

  const runHealthCheck = async () => {
    if (!extensionContext || !serverOnline) {
      toast.error("Connect the local server before running a health check");
      return;
    }
    try {
      const healthCheck = await runIndexHealthCheck(
        localServerUrl,
        serverApiKey
      );
      setSemanticIndexStatus(current =>
        current ? { ...current, healthCheck } : current
      );
      toast.success(
        healthCheck.lastResult === "ready"
          ? "Semantic index is healthy"
          : "Semantic index needs attention"
      );
    } catch {
      toast.error("Could not run the health check");
    }
  };

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
    if (extensionContext && serverOnline) {
      await restoreTabsOnLocalServer(
        localServerUrl,
        undoSnapshot.tabs.map(tab => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          note: tab.note,
          tags: tab.tags,
          groupId: tab.groupId,
          updatedAt: tab.updated,
        })) as never,
        serverApiKey
      ).catch(() => toast.error("The server could not restore every tab"));
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
        selectedIds.has(tab.id) ? { ...tab, groupId, updated: "now" } : tab
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
    if (extensionContext && serverOnline)
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
              updated: "now",
            }
          : tab
      )
    );
    setTagCatalog(current => ({
      ...current,
      [tag]: current[tag] ?? "Applied from ranked search",
    }));
    if (extensionContext && serverOnline)
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
          ? { ...tab, archived: true, archivedAt, updated: "now" }
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
            { archived: true, archivedAt },
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
        await deleteTabOnLocalServer(localServerUrl, tab.id, serverApiKey);
      }
      setTabPendingDelete(null);
      toast.success(`Permanently deleted “${tab.title}”`);
      return;
    }
    createUndoSnapshot("archiving 1 tab");
    const archivedAt = new Date().toISOString();
    setTabs(current =>
      current.map(item =>
        item.id === tab.id
          ? { ...item, archived: true, archivedAt, updated: "now" }
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
        { archived: true, archivedAt },
        serverApiKey
      );
    }
    setTabPendingDelete(null);
    toast.success(`Archived “${tab.title}”`);
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
      if (tab) window.open(tab.url, "_blank", "noopener,noreferrer");
    }
    if (event.key === "Escape") {
      setQuery("");
      event.currentTarget.blur();
    }
  };

  const moveTab = (tabId: string, groupId: GroupId) => {
    const sourceGroup = tabs.find(tab => tab.id === tabId)?.groupId;
    const destination =
      vaultGroups.find(group => group.id === groupId)?.name ?? "collection";
    setTabs(current =>
      current.map(tab =>
        tab.id === tabId ? { ...tab, groupId, updated: "now" } : tab
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
        [groupId]: [...(withoutTab[groupId] ?? []), tabId],
      };
    });
    toast.success(`Moved to ${destination}`, {
      description: "The local index is updated.",
    });
  };

  const moveTabAtPosition = (
    tabId: string,
    groupId: GroupId,
    insertionIndex: number
  ) => {
    const sourceGroup = tabs.find(tab => tab.id === tabId)?.groupId;
    const destination =
      vaultGroups.find(group => group.id === groupId)?.name ?? "collection";
    setTabs(current =>
      current.map(tab =>
        tab.id === tabId ? { ...tab, groupId, updated: "now" } : tab
      )
    );
    setTabOrders(current => {
      const withoutTab = Object.fromEntries(
        Object.entries(current).map(([id, orderedIds]) => [
          id,
          orderedIds.filter(id => id !== tabId),
        ])
      ) as Record<GroupId, string[]>;
      const destinationOrder = [...(withoutTab[groupId] ?? [])];
      destinationOrder.splice(
        Math.max(0, Math.min(insertionIndex, destinationOrder.length)),
        0,
        tabId
      );
      return {
        ...withoutTab,
        ...(sourceGroup
          ? { [sourceGroup]: withoutTab[sourceGroup] ?? [] }
          : {}),
        [groupId]: destinationOrder,
      };
    });
    toast.success(`Moved to ${destination}`, {
      description: "Placed at the requested position in this collection.",
    });
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
    const existingTab = tabs.find(tab => {
      try {
        return canonicalizeTabUrl(tab.url) === canonicalizeTabUrl(url);
      } catch {
        return tab.url === url;
      }
    });
    if (existingTab) {
      if (existingTab.archived) {
        const restoredTab: VaultTab = {
          ...existingTab,
          groupId: "inbox",
          archived: false,
          archivedAt: null,
          updated: "now",
        };
        setTabs(current =>
          current.map(tab => (tab.id === restoredTab.id ? restoredTab : tab))
        );
        setTabOrders(current => ({
          ...current,
          inbox: [
            restoredTab.id,
            ...(current.inbox ?? []).filter(id => id !== restoredTab.id),
          ],
        }));
        if (storageMode === "backend" && serverOnline) {
          await saveTabToLocalServer(
            localServerUrl,
            {
              url,
              title,
              note: restoredTab.note,
              tags: restoredTab.tags,
              groupId: null,
              favicon: activeTab.favIconUrl,
            },
            serverApiKey
          ).catch(() => setServerOnline(false));
        }
        selectCollection("inbox");
        toast.success("Restored the archived link", {
          description: "Its previous title, note, and tags were kept.",
        });
      } else {
        toast("This URL is already in your library", {
          description: "TabVault kept the existing link and its metadata.",
        });
      }
      return;
    }
    const newTab: VaultTab = {
      id: crypto.randomUUID(),
      groupId: "inbox",
      title,
      url,
      domain: normaliseUrl(url),
      note: "Captured from the active Chrome tab. Add a note or move it when ready.",
      tags: ["quick save"],
      color: "#F05A28",
      icon: "●",
      updated: "now",
      archived: false,
      archivedAt: null,
    };
    setTabs(current => [newTab, ...current]);
    setTabOrders(current => ({
      ...current,
      inbox: [newTab.id, ...(current.inbox ?? [])],
    }));
    setTagCatalog(current => ({
      ...current,
      "quick save": current["quick save"] ?? "Quickly captured work",
    }));
    selectCollection("inbox");
    if (storageMode === "backend" && serverOnline) {
      try {
        const result = await saveTabToLocalServer(
          localServerUrl,
          {
            url,
            title,
            note: newTab.note,
            tags: newTab.tags,
            groupId: null,
            favicon: activeTab?.favIconUrl,
          },
          serverApiKey
        );
        toast.success(
          result.deduplicated
            ? "Merged with an existing tab"
            : "Saved to Inbox",
          {
            description:
              "The active tab is stored in both the local index and offline extension cache.",
          }
        );
        return;
      } catch {
        setServerOnline(false);
      }
    }
    toast.success("Saved to Inbox", {
      description:
        "Stored in the extension cache. The local server is unavailable.",
    });
  };

  const captureCurrentTabRef = useRef(captureCurrentTab);
  captureCurrentTabRef.current = captureCurrentTab;

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
              toast.success("Fast-saved tabs added to Inbox");
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
    setVaultGroups(current => [...current, { id, name, accent: "#8a9c92" }]);
    setNewGroupName("");
    setShowGroupDialog(false);
    selectCollection(id);
    toast.success(`“${name}” is ready`, {
      description: "You can now drag a tab onto its collection row.",
    });
  };

  const saveCollection = () => {
    if (!editingCollection) return;
    const name = editingCollection.name.trim();
    if (!name) {
      toast.error("A collection needs a name");
      return;
    }
    setVaultGroups(current =>
      current.map(group =>
        group.id === editingCollection.id ? { ...group, name } : group
      )
    );
    toast.success("Collection updated", {
      description: `The shelf is now called “${name}”.`,
    });
    setEditingCollection(null);
  };

  const tabsForCollection = (groupId: GroupId) =>
    sortByStoredOrder(
      tabs.filter(tab => descendantCollectionIds(groupId).has(tab.groupId))
    );

  const openCollectionTabs = async (group: VaultGroup) => {
    const collectionTabs = tabsForCollection(group.id);
    if (!collectionTabs.length) {
      toast("This collection is empty");
      return;
    }
    const result = await openTabUrls(collectionTabs.map(tab => tab.url));
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
    if (group.id === "inbox") {
      toast.error("Inbox cannot be deleted");
      return;
    }
    const deletedIds = descendantCollectionIds(group.id);
    const movedTabs = tabs.filter(tab => deletedIds.has(tab.groupId));
    setTabs(current =>
      current.map(tab =>
        deletedIds.has(tab.groupId)
          ? { ...tab, groupId: "inbox", updated: "now" }
          : tab
      )
    );
    setTabOrders(current => {
      const remaining = Object.fromEntries(
        Object.entries(current).filter(([id]) => !deletedIds.has(id))
      ) as Record<GroupId, string[]>;
      return {
        ...remaining,
        inbox: [
          ...(remaining.inbox ?? []).filter(
            id => !movedTabs.some(tab => tab.id === id)
          ),
          ...movedTabs.map(tab => tab.id),
        ],
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
    selectCollection("inbox");
    toast.success(`Deleted ${group.name}`, {
      description: `${movedTabs.length} tab${movedTabs.length === 1 ? "" : "s"} moved to Inbox.`,
    });
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
      domain: normaliseUrl(url),
      tags: editingTab.tags.map(tag => tag.trim()).filter(Boolean),
      updated: "now",
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

  const reorderTabs = (
    sourceId: string,
    targetId: string | "end",
    position: "before" | "after"
  ) => {
    const source = tabs.find(tab => tab.id === sourceId);
    const target =
      targetId === "end" ? undefined : tabs.find(tab => tab.id === targetId);
    if (!source || (target && source.groupId !== target.groupId)) {
      toast.info(
        "To move a tab to another collection, drop it on the collection in the rail."
      );
      return;
    }
    setTabOrders(current => {
      const nextOrder = [...(current[source.groupId] ?? [])].filter(
        id => id !== sourceId
      );
      const insertionIndex =
        targetId === "end"
          ? nextOrder.length
          : Math.max(
              0,
              nextOrder.indexOf(targetId) + (position === "after" ? 1 : 0)
            );
      nextOrder.splice(insertionIndex, 0, sourceId);
      return { ...current, [source.groupId]: nextOrder };
    });
    toast.success("Order updated", {
      description: "The tab has been repositioned in this collection.",
    });
  };

  const handleLibraryDragStart = ({ active }: DragStartEvent) => {
    setActiveDragId(String(active.id));
  };

  const handleLibraryDragCancel = () => {
    setActiveDragId(null);
  };

  const handleLibraryDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragId(null);
    if (!over || active.id === over.id) return;
    const source = tabs.find(tab => tab.id === active.id);
    if (!source) return;
    const groupId = over.data.current?.groupId;
    if (typeof groupId === "string") {
      if (source.groupId !== groupId) moveTab(source.id, groupId);
      return;
    }
    const target = tabs.find(tab => tab.id === over.id);
    if (!target) return;
    const sourceIndex = (tabOrders[source.groupId] ?? []).indexOf(source.id);
    const targetIndex = (tabOrders[target.groupId] ?? []).indexOf(target.id);
    if (source.groupId !== target.groupId) {
      const activeRect = active.rect.current.translated;
      const overRect = over.rect;
      const placeAfter = activeRect
        ? activeRect.top + activeRect.height / 2 >
          overRect.top + overRect.height / 2
        : false;
      moveTabAtPosition(
        source.id,
        target.groupId,
        targetIndex + (placeAfter ? 1 : 0)
      );
      return;
    }
    reorderTabs(
      source.id,
      target.id,
      sourceIndex < targetIndex ? "after" : "before"
    );
  };

  const renameTag = (oldName: string, nextName: string) => {
    const cleanName = nextName.trim();
    if (!cleanName || cleanName === oldName) return;
    setTagCatalog(current => {
      const { [oldName]: description = "", ...rest } = current;
      return { ...rest, [cleanName]: description };
    });
    setTabs(current =>
      current.map(tab => ({
        ...tab,
        tags: tab.tags.map(tag => (tag === oldName ? cleanName : tag)),
      }))
    );
    toast.success("Tag renamed", {
      description: `“${oldName}” is now “${cleanName}”.`,
    });
  };

  const removeTag = (name: string) => {
    setTagCatalog(current => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setTabs(current =>
      current.map(tab => ({
        ...tab,
        tags: tab.tags.filter(tag => tag !== name),
      }))
    );
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      onDragStart={handleLibraryDragStart}
      onDragEnd={handleLibraryDragEnd}
      onDragCancel={handleLibraryDragCancel}
    >
      <div className="min-h-screen bg-[#f6f3ec] text-[#18261f] paper-grain">
        <aside
          className={`fixed inset-y-0 left-0 z-30 flex w-[274px] flex-col border-r border-[#ded9cd] bg-[#f9f7f1]/95 px-4 py-5 backdrop-blur-xl transition-transform duration-200 lg:translate-x-0 ${showMobileRail ? "translate-x-0 shadow-[16px_0_50px_rgba(24,38,31,0.14)]" : "-translate-x-full"}`}
        >
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5">
              <BrandMark className="h-9 w-9" />
              <div>
                <span className="block font-['DM_Sans'] text-[19px] font-bold leading-none tracking-[-0.055em]">
                  tabvault
                </span>
                <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-[#83867e]">
                  local link library
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowMobileRail(false)}
              className="rounded-md p-2 text-[#777b74] hover:bg-[#ebe8df] lg:hidden"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {extensionContext && (
            <div className="mt-8 px-2">
              <button
                onClick={() => void captureCurrentTab()}
                className="flex w-full items-center justify-between rounded-lg bg-[#e95224] px-3.5 py-3 text-left text-[#fffaf2] shadow-[0_7px_16px_rgba(233,82,36,0.19)] transition hover:-translate-y-0.5 hover:bg-[#d94a1e] active:scale-[0.98]"
              >
                <span className="flex items-center gap-2.5 text-[13px] font-bold">
                  <Plus className="h-4 w-4" /> Save active tab
                </span>
                <span className="rounded border border-white/25 px-1.5 py-0.5 font-mono text-[9px]">
                  ⌘ S
                </span>
              </button>
            </div>
          )}

          <nav className="thin-scrollbar mt-7 flex-1 overflow-y-auto px-1">
            <p className="mb-2 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#8e9189]">
              Browse
            </p>
            <div className="space-y-1">
              <button
                onClick={() => setLocation("/")}
                className={`flex w-full items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-left text-[13px] font-semibold ${isAllTabsPage ? "border-[#e95224] bg-[#eeece4] text-[#18261f]" : "border-transparent text-[#666c65] hover:bg-[#efede6]"}`}
              >
                <LayoutList className="h-3.5 w-3.5" /> All Tabs{" "}
                <span className="ml-auto font-mono text-[10px] text-[#a2a49c]">
                  {activeTabs.length}
                </span>
              </button>
              {archivedTabs.length > 0 && (
                <button
                  onClick={() => setLocation("/archive")}
                  className={`flex w-full items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-left text-[13px] font-semibold ${isArchivePage ? "border-[#e95224] bg-[#eeece4] text-[#18261f]" : "border-transparent text-[#666c65] hover:bg-[#efede6]"}`}
                >
                  <Archive className="h-3.5 w-3.5" /> Archive{" "}
                  <span className="ml-auto font-mono text-[10px] text-[#a2a49c]">
                    {archivedTabs.length}
                  </span>
                </button>
              )}
              <button
                onClick={() => setLocation("/dashboard")}
                className="flex w-full items-center gap-2.5 rounded-lg border-l-2 border-transparent px-3 py-2 text-left text-[13px] font-semibold text-[#666c65] hover:bg-[#efede6] hover:text-[#18261f]"
              >
                <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
              </button>
            </div>
            <div className="mt-8 border-t border-[#e3ded3] pt-6">
              <p className="mb-2 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#8e9189]">
                Library
              </p>
              <button
                onClick={() => setShowTagManager(true)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[#666c65] hover:bg-[#efede6] hover:text-[#18261f]"
              >
                <Tag className="h-3.5 w-3.5" />
                <span className="text-[13px] font-semibold">Tags</span>
                <span className="ml-auto font-mono text-[10px] text-[#a2a49c]">
                  {Object.keys(tagCatalog).length}
                </span>
              </button>
              <button
                onClick={() => setLocation("/transfer")}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[#666c65] hover:bg-[#efede6] hover:text-[#18261f]"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                <span className="text-[13px] font-semibold">
                  Import & Export
                </span>
              </button>
              <button
                onClick={() => setLocation("/settings")}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[#666c65] hover:bg-[#efede6] hover:text-[#18261f]"
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span className="text-[13px] font-semibold">Settings</span>
              </button>
              <button
                onClick={() => {
                  if (storageMode !== "backend" || !serverOnline) {
                    toast.error(
                      "Connect the TabVault server before refreshing the library"
                    );
                    return;
                  }
                  void refreshLibrary();
                }}
                disabled={isRefreshingLibrary}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[#666c65] hover:bg-[#efede6] hover:text-[#18261f] disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRefreshingLibrary ? "animate-spin" : ""}`}
                />
                <span className="text-[13px] font-semibold">
                  {isRefreshingLibrary ? "Refreshing…" : "Refresh library"}
                </span>
              </button>
            </div>
          </nav>

          <div className="hidden mt-5 rounded-xl border border-[#ded9cd] bg-[#fffdf8] p-3.5 shadow-[0_8px_24px_rgba(24,38,31,0.04)]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
                API connection
                <ContextHelp title="API connection" side="right" align="start">
                  Your library always works in browser storage. Add an HTTP(S)
                  endpoint and bearer key here when you want it to sync with a
                  TabVault server.
                </ContextHelp>
              </span>
              <span
                className={`h-2 w-2 rounded-full ${serverOnline ? "bg-[#6e9870] shadow-[0_0_0_3px_rgba(110,152,112,0.12)]" : "bg-[#c95f46]"}`}
              />
            </div>
            <p className="mt-2 text-[12px] font-bold">
              {serverOnline
                ? "Server-backed library"
                : "Browser storage active"}
            </p>
            <p className="mt-1 truncate font-mono text-[9px] text-[#8c9088]">
              {localServerUrl.replace(/^https?:\/\//, "")}
            </p>
            {showConnectionSettings && (
              <div className="mt-3 space-y-2 border-t border-[#e8e3d8] pt-3">
                <label className="block">
                  <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#858980]">
                    API endpoint
                  </span>
                  <input
                    value={pendingServerUrl}
                    onChange={event => setPendingServerUrl(event.target.value)}
                    placeholder="https://api.example.com"
                    className="mt-1 w-full border-b border-[#cfc9bc] bg-[#f9f7f1] px-2 py-1.5 font-mono text-[10px] outline-none focus:border-[#e95224]"
                  />
                </label>
                <label className="block">
                  <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#858980]">
                    Bearer key
                  </span>
                  <input
                    value={pendingApiKey}
                    onChange={event => setPendingApiKey(event.target.value)}
                    type="password"
                    placeholder="admin"
                    className="mt-1 w-full border-b border-[#cfc9bc] bg-[#f9f7f1] px-2 py-1.5 font-mono text-[10px] outline-none focus:border-[#e95224]"
                  />
                </label>
                <button
                  onClick={() => void saveConnectionSettings()}
                  className="w-full rounded bg-[#e95224] px-2 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white hover:bg-[#d94a1e]"
                >
                  Save & connect →
                </button>
              </div>
            )}
            <div className="mt-3 flex gap-3 border-t border-[#e8e3d8] pt-2.5">
              <button
                onClick={() =>
                  setShowConnectionSettings(!showConnectionSettings)
                }
                className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#687067] hover:text-[#e95224]"
              >
                {showConnectionSettings ? "Close settings" : "Configure API"}
              </button>
              <button
                onClick={() => void refreshLocalServer()}
                className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#687067] hover:text-[#e95224]"
              >
                Check
              </button>
              <button
                onClick={() => void refreshLibrary()}
                className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#687067] hover:text-[#e95224]"
              >
                Refresh library
              </button>
            </div>
            <p className="mt-2 text-[9px] leading-4 text-[#898d85]">
              Any HTTP(S) endpoint is supported. Offline changes remain in
              browser storage until the API is reachable.
            </p>
          </div>
          <section className="hidden mt-3 overflow-hidden rounded-xl border border-[#ded9cd] bg-[#fffdf8] shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
            <div className="flex items-center">
              <button
                onClick={() => setShowModelPanel(!showModelPanel)}
                className="flex flex-1 items-center justify-between p-3.5 text-left hover:bg-[#f9f7f1]"
              >
                <span>
                  <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
                    Semantic model
                  </span>
                  <span className="mt-1 block text-[12px] font-bold">
                    {semanticIndexStatus?.status === "ready"
                      ? "Index ready"
                      : semanticIndexStatus?.progress?.state === "indexing"
                        ? "Indexing library"
                        : "Setup required"}
                  </span>
                </span>
                <ChevronRight
                  className={`h-4 w-4 text-[#8c9088] transition-transform ${showModelPanel ? "rotate-90" : ""}`}
                />
              </button>
              <ContextHelp
                title="Semantic model"
                side="right"
                align="end"
                className="mr-3.5"
                tip="You can still search by title, note, and tags if this is not set up."
              >
                The optional local embedding model helps search match meaning,
                not just exact words. It runs through your configured TabVault
                server and does not replace your saved tab records.
              </ContextHelp>
            </div>
            {showModelPanel && (
              <div className="border-t border-[#e8e3d8] bg-[#f9f7f1] p-3.5">
                <div className="space-y-2 font-mono text-[9px] text-[#747970]">
                  <div className="flex justify-between gap-3">
                    <span>MODEL</span>
                    <span className="truncate text-right text-[#334438]">
                      {semanticIndexStatus?.model ?? "nomic-embed-text"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>PROVIDER</span>
                    <span className="text-right text-[#334438]">
                      {semanticIndexStatus?.provider ?? "Ollama local"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>INDEXED</span>
                    <span className="text-right text-[#334438]">
                      {semanticIndexStatus?.indexedTabs ?? 0} tabs
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>BATCH SIZE</span>
                    <span className="text-right text-[#334438]">
                      {semanticIndexStatus?.batchSize ?? 16}
                    </span>
                  </div>
                  {semanticIndexStatus?.progress?.state === "indexing" && (
                    <div className="pt-1">
                      <div className="mb-1 flex justify-between">
                        <span>PROGRESS</span>
                        <span>
                          {semanticIndexStatus.progress.processed}/
                          {semanticIndexStatus.progress.total}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden bg-[#dfdbd0]">
                        <div
                          className="h-full bg-[#e95224] transition-all"
                          style={{
                            width: `${Math.round((semanticIndexStatus.progress.processed / Math.max(semanticIndexStatus.progress.total, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                {semanticIndexStatus?.lastError && (
                  <p className="mt-3 border-l-2 border-[#d07a31] pl-2 text-[10px] leading-4 text-[#8a6335]">
                    {semanticIndexStatus.lastError}
                  </p>
                )}
                <button
                  onClick={() => void rebuildIndex()}
                  disabled={isRebuildingIndex || !serverOnline}
                  className="mt-3 w-full rounded-md bg-[#e95224] px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white disabled:cursor-not-allowed disabled:bg-[#c8c1b6]"
                >
                  {isRebuildingIndex
                    ? "Rebuilding index…"
                    : "Rebuild local index →"}
                </button>
                <p className="mt-2 text-[9px] leading-4 text-[#898d85]">
                  Run a local Ollama embedding model, then rebuild after model
                  or import changes.
                </p>
              </div>
            )}
          </section>
          <section className="hidden mt-3 rounded-xl border border-[#ded9cd] bg-[#fffdf8] p-3.5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
                  Index health
                  <ContextHelp title="Index health" side="right" align="start">
                    A health check asks the server whether the semantic index
                    and its model are ready. It checks your search setup, not
                    the contents of each tab.
                  </ContextHelp>
                </p>
                <p className="mt-1 text-[12px] font-bold">
                  {semanticIndexStatus?.healthCheck?.enabled
                    ? `Every ${Math.round(semanticIndexStatus.healthCheck.intervalSeconds / 60)} min`
                    : "Manual checks"}
                </p>
              </div>
              <span
                className={`mt-1 h-2 w-2 rounded-full ${semanticIndexStatus?.healthCheck?.lastResult === "needs_attention" ? "bg-[#c95f46]" : semanticIndexStatus?.healthCheck?.lastResult === "ready" ? "bg-[#6e9870]" : "bg-[#b5b5ad]"}`}
              />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1">
              <button
                onClick={() => void updateHealthSchedule(0)}
                className={`rounded border px-1 py-1.5 font-mono text-[8px] uppercase ${!semanticIndexStatus?.healthCheck?.enabled ? "border-[#e95224] bg-[#fff0ea] text-[#c84b26]" : "border-[#ded9cd] text-[#767b73] hover:bg-[#f9f7f1]"}`}
              >
                Off
              </button>
              <button
                onClick={() => void updateHealthSchedule(900)}
                className={`rounded border px-1 py-1.5 font-mono text-[8px] uppercase ${semanticIndexStatus?.healthCheck?.intervalSeconds === 900 ? "border-[#e95224] bg-[#fff0ea] text-[#c84b26]" : "border-[#ded9cd] text-[#767b73] hover:bg-[#f9f7f1]"}`}
              >
                15m
              </button>
              <button
                onClick={() => void updateHealthSchedule(3600)}
                className={`rounded border px-1 py-1.5 font-mono text-[8px] uppercase ${semanticIndexStatus?.healthCheck?.intervalSeconds === 3600 ? "border-[#e95224] bg-[#fff0ea] text-[#c84b26]" : "border-[#ded9cd] text-[#767b73] hover:bg-[#f9f7f1]"}`}
              >
                1h
              </button>
              <button
                onClick={() => void updateHealthSchedule(14400)}
                className={`rounded border px-1 py-1.5 font-mono text-[8px] uppercase ${semanticIndexStatus?.healthCheck?.intervalSeconds === 14400 ? "border-[#e95224] bg-[#fff0ea] text-[#c84b26]" : "border-[#ded9cd] text-[#767b73] hover:bg-[#f9f7f1]"}`}
              >
                4h
              </button>
            </div>
            <button
              onClick={() => void runHealthCheck()}
              className="mt-3 w-full border-t border-[#e8e3d8] pt-2.5 text-left font-mono text-[9px] uppercase tracking-[0.1em] text-[#687067] hover:text-[#e95224]"
            >
              Run health check now →
            </button>
          </section>
          <section className="hidden mt-3 rounded-xl border border-[#ded9cd] bg-[#fffdf8] p-3.5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
                  Local alerts
                  <ContextHelp title="Local alerts" side="right" align="start">
                    Alerts notify you only when a scheduled health check needs
                    attention. They require a health-check interval and the
                    Chrome extension notification permission.
                  </ContextHelp>
                </p>
                <p className="mt-1 text-[12px] font-bold">
                  {semanticIndexStatus?.healthCheck?.notifyOnNeedsAttention
                    ? "Notify on attention"
                    : "Quiet mode"}
                </p>
              </div>
              <span
                className={`mt-1 h-2 w-2 rounded-full ${semanticIndexStatus?.healthCheck?.notifyOnNeedsAttention ? "bg-[#e95224]" : "bg-[#b5b5ad]"}`}
              />
            </div>
            <label
              className={`mt-3 flex items-center gap-2 border-t border-[#e8e3d8] pt-2.5 text-[10px] ${semanticIndexStatus?.healthCheck?.enabled ? "text-[#5c655c]" : "text-[#989b94]"}`}
            >
              <input
                type="checkbox"
                checked={Boolean(
                  semanticIndexStatus?.healthCheck?.notifyOnNeedsAttention
                )}
                disabled={!semanticIndexStatus?.healthCheck?.enabled}
                onChange={event =>
                  void updateHealthSchedule(
                    semanticIndexStatus?.healthCheck?.intervalSeconds ?? 0,
                    event.target.checked
                  )
                }
                className="h-3.5 w-3.5 accent-[#e95224]"
              />{" "}
              Alert when a scheduled check needs attention
            </label>
            <p className="mt-2 text-[9px] leading-4 text-[#898d85]">
              Chrome shows a local notification only while the scheduled local
              check is enabled and finds an issue.
            </p>
          </section>
        </aside>

        {showMobileRail ? (
          <button
            onClick={() => setShowMobileRail(false)}
            className="fixed inset-0 z-20 bg-[#18261f]/20 lg:hidden"
            aria-label="Close navigation overlay"
          />
        ) : null}
        <main className="min-h-screen lg:ml-[274px]">
          <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-[#ded9cd]/85 bg-[#f6f3ec]/88 px-5 backdrop-blur-xl sm:px-7 lg:px-9">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowMobileRail(true)}
                className="rounded-md border border-[#ded9cd] bg-[#fffdf8] p-2 lg:hidden"
                aria-label="Open navigation"
              >
                <Boxes className="h-4 w-4" />
              </button>
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
                  {isArchivePage ? "Recovery" : "Library"}
                </p>
                <h1 className="mt-3 font-['DM_Sans'] text-[34px] font-bold leading-[0.98] tracking-[-0.065em] text-[#18261f] sm:text-[44px]">
                  {isArchivePage ? "Archive" : "All tabs"}
                </h1>
                <p className="mt-3 max-w-xl text-[13px] leading-6 text-[#697068]">
                  {isArchivePage
                    ? "Archived links stay recoverable here. Restore a link by saving the same URL again, or permanently remove it from this view."
                    : "Browse every saved link. Change the view to scan rows, read previews, or review collection groups."}
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
                    {!query && !isArchivePage && tabView !== "groups" && (
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
                          {vaultGroups.map(group => (
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
                    tabs={activeTabs}
                    onOpen={group => void openCollectionTabs(group)}
                    onShare={group => void shareCollectionAsMarkdown(group)}
                    onDelete={group => {
                      if (group.id !== "inbox")
                        setCollectionPendingDelete(group);
                    }}
                    onBrowse={groupId => {
                      setSearchGroupFilter(groupId);
                      setQuery("");
                      setTabView("standard");
                    }}
                    onCreate={() => setShowGroupDialog(true)}
                  />
                ) : visibleTabs.length ? (
                  <>
                    {!isArchivePage ? (
                      <CollectionDropShelf groups={vaultGroups} />
                    ) : null}
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
                      onDelete={tab => setTabPendingDelete(tab)}
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
                        if (group && group.id !== "inbox") {
                          setCollectionPendingDelete(group);
                        }
                      }}
                      groups={vaultGroups}
                    />
                  </>
                ) : (
                  <div className="border-t border-[#dcd7cc] bg-[#fffdf8] px-5 py-12 text-center">
                    <Search className="mx-auto h-5 w-5 text-[#e95224]" />
                    <p className="mt-3 text-[13px] font-bold">
                      {isArchivePage && !query
                        ? "Archive is empty."
                        : "No links matched that query."}
                    </p>
                    <p className="mt-1 text-[11px] text-[#7b8078]">
                      {isArchivePage && !query
                        ? "Archived links remain recoverable here until you permanently delete them."
                        : "Try a topic, note, or tag. Semantic search understands related language."}
                    </p>
                  </div>
                )}
              </section>
            </div>
          </div>
        </main>

        {showGroupDialog && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-[#18261f]/30 p-5 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-label="Create collection"
          >
            <div className="w-full max-w-sm bg-[#fffdf8] p-5 shadow-[0_24px_70px_rgba(24,38,31,0.25)] rise-in">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#858980]">
                    Collection
                  </p>
                  <h2 className="mt-1 font-['DM_Sans'] text-[20px] font-bold tracking-[-0.045em]">
                    Name a new shelf
                  </h2>
                </div>
                <button
                  onClick={() => setShowGroupDialog(false)}
                  className="p-1 text-[#747970] hover:text-[#18261f]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                autoFocus
                value={newGroupName}
                onChange={event => setNewGroupName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") createGroup();
                }}
                placeholder="e.g. Weekend reading"
                className="mt-5 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 text-[13px] font-semibold outline-none focus:border-[#e95224]"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setShowGroupDialog(false)}
                  className="px-3 py-2 text-[11px] font-bold text-[#72776f]"
                >
                  Cancel
                </button>
                <button
                  onClick={createGroup}
                  className="rounded-md bg-[#e95224] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#d94a1e]"
                >
                  Create collection
                </button>
              </div>
            </div>
          </div>
        )}

        {editingCollection && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-[#18261f]/30 p-5 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-label="Edit collection"
          >
            <div className="w-full max-w-sm bg-[#fffdf8] p-5 shadow-[0_24px_70px_rgba(24,38,31,0.25)] rise-in">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#858980]">
                    Collection
                  </p>
                  <h2 className="mt-1 font-['DM_Sans'] text-[20px] font-bold tracking-[-0.045em]">
                    Edit shelf
                  </h2>
                </div>
                <button
                  onClick={() => setEditingCollection(null)}
                  className="p-1 text-[#747970] hover:text-[#18261f]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <label className="mt-5 block">
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
                  Name
                </span>
                <input
                  value={editingCollection.name}
                  onChange={event =>
                    setEditingCollection({
                      ...editingCollection,
                      name: event.target.value,
                    })
                  }
                  onKeyDown={event => {
                    if (event.key === "Enter") saveCollection();
                  }}
                  className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 text-[13px] font-semibold outline-none focus:border-[#e95224]"
                />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setEditingCollection(null)}
                  className="px-3 py-2 text-[11px] font-bold text-[#72776f]"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCollection}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#e95224] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#d94a1e]"
                >
                  <Save className="h-3.5 w-3.5" /> Save name
                </button>
              </div>
            </div>
          </div>
        )}

        {collectionPendingDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#18261f]/40 p-5 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${collectionPendingDelete.name} collection`}
          >
            <div className="w-full max-w-sm border border-[#e3b7a7] bg-[#fffdf8] p-5 shadow-[0_24px_70px_rgba(24,38,31,0.25)] rise-in">
              <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#c84b26]">
                <Trash2 className="h-3.5 w-3.5" /> Remove collection
              </p>
              <h2 className="mt-2 font-['DM_Sans'] text-[22px] font-bold tracking-[-0.05em]">
                Delete “{collectionPendingDelete.name}”?
              </h2>
              <p className="mt-3 text-[12px] leading-5 text-[#687067]">
                The collection structure will be removed. Its saved tabs will be
                returned to Inbox rather than deleted.
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setCollectionPendingDelete(null)}
                  className="px-3 py-2 text-[11px] font-bold text-[#72776f] hover:text-[#18261f]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteCollection(collectionPendingDelete)}
                  className="rounded-md bg-[#c84b26] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#ae3b1d]"
                >
                  Delete collection
                </button>
              </div>
            </div>
          </div>
        )}

        {tabPendingDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#18261f]/40 p-5 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-label={`${isArchivePage ? "Permanently delete" : "Archive"} ${tabPendingDelete.title}`}
          >
            <div className="w-full max-w-sm border border-[#e3b7a7] bg-[#fffdf8] p-5 shadow-[0_24px_70px_rgba(24,38,31,0.25)] rise-in">
              <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#c84b26]">
                <Trash2 className="h-3.5 w-3.5" />{" "}
                {isArchivePage ? "Permanent deletion" : "Archive saved tab"}
              </p>
              <h2 className="mt-2 font-['DM_Sans'] text-[22px] font-bold tracking-[-0.05em]">
                {isArchivePage
                  ? "Permanently delete this tab?"
                  : "Archive this tab?"}
              </h2>
              <p className="mt-3 text-[12px] leading-5 text-[#687067]">
                {isArchivePage
                  ? `“${tabPendingDelete.title}” will be removed from local storage and the configured backend. This cannot be undone.`
                  : `“${tabPendingDelete.title}” will leave your active library but remain recoverable in Archive. Saving the same URL restores its existing notes and tags.`}
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setTabPendingDelete(null)}
                  className="px-3 py-2 text-[11px] font-bold text-[#72776f] hover:text-[#18261f]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void deleteTab(tabPendingDelete)}
                  className="rounded-md bg-[#c84b26] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#ae3b1d]"
                >
                  {isArchivePage ? "Permanently delete" : "Archive tab"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showTagManager && (
          <div
            className="fixed inset-0 z-40 flex items-end justify-center bg-[#18261f]/30 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Manage tags"
          >
            <div className="w-full max-w-[700px] overflow-hidden bg-[#fffdf8] shadow-[0_24px_70px_rgba(24,38,31,0.25)] rise-in">
              <div className="flex items-center justify-between border-b border-[#ded9cd] px-5 py-4 sm:px-6">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#858980]">
                    Tag directory
                  </p>
                  <h2 className="mt-1 font-['DM_Sans'] text-[20px] font-bold tracking-[-0.045em]">
                    Edit your index vocabulary
                  </h2>
                </div>
                <button
                  onClick={() => setShowTagManager(false)}
                  className="rounded-md p-2 text-[#747970] hover:bg-[#efede6]"
                  aria-label="Close tag manager"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="border-b border-[#ded9cd] bg-[#f9f7f1] p-5 sm:p-6">
                <p className="text-[11px] leading-5 text-[#697068]">
                  Changing a tag name updates every linked tab. Add an optional
                  description so an agent can understand the index without
                  asking for context.
                </p>
                <div className="mt-4 flex gap-2">
                  <input
                    value={newTagName}
                    onChange={event => setNewTagName(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter") addLibraryTag();
                    }}
                    placeholder="New tag"
                    className="min-w-0 flex-1 border-b border-[#bcb6a8] bg-[#fffdf8] px-3 py-2 text-[12px] font-semibold outline-none focus:border-[#e95224]"
                  />
                  <button
                    onClick={addLibraryTag}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#e95224] px-3 py-2 text-[10px] font-bold text-white hover:bg-[#d94a1e]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add tag
                  </button>
                </div>
              </div>
              <div className="thin-scrollbar max-h-[380px] overflow-y-auto p-5 sm:p-6">
                {Object.entries(tagCatalog)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([name, description]) => (
                    <div
                      key={name}
                      className="grid gap-2 border-b border-[#e6e1d7] py-3 sm:grid-cols-[170px_1fr_auto]"
                    >
                      <input
                        defaultValue={name}
                        onBlur={event => renameTag(name, event.target.value)}
                        aria-label={`Tag name ${name}`}
                        className="min-w-0 bg-transparent font-mono text-[11px] font-medium text-[#334438] outline-none focus:text-[#e95224]"
                      />
                      <input
                        value={description}
                        onChange={event =>
                          setTagCatalog(current => ({
                            ...current,
                            [name]: event.target.value,
                          }))
                        }
                        placeholder="No description"
                        aria-label={`Description for ${name}`}
                        className="min-w-0 bg-transparent text-[11px] text-[#697068] outline-none placeholder:text-[#aaa9a1] focus:text-[#18261f]"
                      />
                      <button
                        onClick={() => removeTag(name)}
                        className="justify-self-start rounded p-1 text-[#9a9b94] hover:bg-[#fff0ea] hover:text-[#c84725]"
                        aria-label={`Remove ${name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
              <div className="flex justify-between border-t border-[#ded9cd] bg-[#f9f7f1] px-5 py-4 sm:px-6">
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#858980]">
                  {Object.keys(tagCatalog).length} indexed tags
                </span>
                <button
                  onClick={() => {
                    setShowTagManager(false);
                    toast.success("Tag directory saved", {
                      description:
                        "The local index is ready for the next question.",
                    });
                  }}
                  className="text-[11px] font-bold text-[#e95224] hover:underline"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {editingTab && (
          <div
            className="fixed inset-0 z-40 flex items-end justify-center bg-[#18261f]/35 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Edit tab"
          >
            <div className="thin-scrollbar w-full max-w-[760px] max-h-[calc(100vh-24px)] overflow-y-auto bg-[#fffdf8] shadow-[0_24px_70px_rgba(24,38,31,0.25)] rise-in">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#ded9cd] bg-[#fffdf8]/95 px-5 py-4 backdrop-blur sm:px-6">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#858980]">
                    Tab record
                  </p>
                  <h2 className="mt-1 font-['DM_Sans'] text-[20px] font-bold tracking-[-0.045em]">
                    Edit saved tab
                  </h2>
                </div>
                <button
                  onClick={() => setEditingTab(null)}
                  className="rounded-md p-2 text-[#747970] hover:bg-[#efede6]"
                  aria-label="Close tab editor"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
                <label className="sm:col-span-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
                    Title
                  </span>
                  <input
                    value={editingTab.title}
                    onChange={event =>
                      setEditingTab({
                        ...editingTab,
                        title: event.target.value,
                      })
                    }
                    className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 text-[13px] font-semibold outline-none focus:border-[#e95224]"
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
                    URL
                  </span>
                  <input
                    value={editingTab.url}
                    onChange={event =>
                      setEditingTab({ ...editingTab, url: event.target.value })
                    }
                    className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 font-mono text-[11px] outline-none focus:border-[#e95224]"
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
                    Note
                  </span>
                  <textarea
                    value={editingTab.note}
                    onChange={event =>
                      setEditingTab({ ...editingTab, note: event.target.value })
                    }
                    rows={4}
                    className="mt-2 w-full resize-none border border-[#ded9cd] bg-[#f9f7f1] px-3 py-3 text-[12px] leading-5 outline-none focus:border-[#e95224]"
                  />
                </label>
                <label>
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
                    Collection
                  </span>
                  <select
                    value={editingTab.groupId}
                    onChange={event =>
                      setEditingTab({
                        ...editingTab,
                        groupId: event.target.value,
                      })
                    }
                    className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 text-[12px] font-semibold outline-none focus:border-[#e95224]"
                  >
                    {vaultGroups.map(group => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
                    Tags
                  </span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {editingTab.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded border border-[#ded9cd] bg-[#f9f7f1] px-2 py-1 font-mono text-[9px] text-[#667067]"
                      >
                        {tag}
                        <button
                          onClick={() =>
                            setEditingTab({
                              ...editingTab,
                              tags: editingTab.tags.filter(
                                item => item !== tag
                              ),
                            })
                          }
                          className="text-[#989990] hover:text-[#e95224]"
                          aria-label={`Remove ${tag}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex">
                    <input
                      value={tagDraft}
                      onChange={event => setTagDraft(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addTagToTab();
                        }
                      }}
                      list="tag-catalog-suggestions"
                      placeholder="Search or create tag"
                      aria-label="Search or create tag"
                      className="min-w-0 flex-1 border-b border-[#bcb6a8] bg-transparent px-1 py-2 text-[11px] outline-none focus:border-[#e95224]"
                    />
                    <datalist id="tag-catalog-suggestions">
                      {tagSuggestions.map(tag => (
                        <option key={tag} value={tag}>
                          {tagCatalog[tag]}
                        </option>
                      ))}
                    </datalist>
                    <button
                      onClick={addTagToTab}
                      className="px-2 text-[#e95224] hover:bg-[#fff0ea]"
                      aria-label="Add tag"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-[#ded9cd] bg-[#f9f7f1] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <button
                  onClick={() => setEditingTab(null)}
                  className="text-left text-[11px] font-bold text-[#697068] hover:text-[#18261f]"
                >
                  Cancel
                </button>
                <button
                  onClick={saveTab}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#e95224] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#d94a1e]"
                >
                  <Save className="h-3.5 w-3.5" /> Save tab
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDragId
          ? (() => {
              const activeTab = tabs.find(tab => tab.id === activeDragId);
              return activeTab ? <TabDragOverlay tab={activeTab} /> : null;
            })()
          : null}
      </DragOverlay>
    </DndContext>
  );
}
