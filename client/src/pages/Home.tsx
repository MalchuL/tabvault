/**
 * Signal Library design reminder: This page is an asymmetric link-library workspace.
 * The left rail indexes collections, the center is a calm reading surface, and orange signals active work.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
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
  readApiKey,
  readLocalServerUrl,
  rebuildSemanticIndex,
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
} from "@/lib/extension";
import { TabList, type TabViewMode } from "@/components/TabList";
import { ContextHelp } from "@/components/ContextHelp";
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
  ChevronDown,
  ChevronRight,
  Command,
  FolderPlus,
  Eye,
  LayoutList,
  Pencil,
  Plus,
  Rows3,
  Save,
  Search,
  Server,
  Sparkles,
  Tag,
  Trash2,
  Wifi,
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
};

type PersistedVault = {
  tabs: VaultTab[];
  vaultGroups: VaultGroup[];
  tagCatalog: Record<string, string>;
  tabOrders: Record<GroupId, string[]>;
  savedSearches?: SavedSearch[];
  tabView?: TabViewMode;
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

function toServerDocument(vault: PersistedVault): Record<string, unknown> {
  return {
    schemaVersion: 1,
    tags: Object.entries(vault.tagCatalog).map(([name, description]) => ({
      name,
      description,
    })),
    groups: vault.vaultGroups.map((group, position) => ({
      id: group.id,
      name: group.name,
      parentId: group.parent ?? null,
      color: group.accent,
      position,
    })),
    tabs: vault.tabs.map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      note: tab.note,
      tags: tab.tags,
      groupId: tab.groupId,
      position: vault.tabOrders[tab.groupId]?.indexOf(tab.id) ?? 0,
      createdAt: new Date().toISOString(),
      updatedAt: tab.updated,
    })),
  };
}

function fromServerDocument(
  document: Record<string, unknown>,
  fallback: PersistedVault
): PersistedVault {
  const remoteTabs = Array.isArray(document.tabs)
    ? (document.tabs as Array<Record<string, unknown>>)
    : [];
  if (!remoteTabs.length) return fallback;
  const remoteGroups = Array.isArray(document.groups)
    ? (document.groups as Array<Record<string, unknown>>)
    : [];
  const remoteTags = Array.isArray(document.tags)
    ? (document.tags as Array<Record<string, unknown>>)
    : [];
  const vaultGroups = remoteGroups.map(group => ({
    id: String(group.id),
    name: String(group.name),
    parent: typeof group.parentId === "string" ? group.parentId : undefined,
    accent: typeof group.color === "string" ? group.color : "#829b65",
  }));
  const tabs = remoteTabs.map(tab => ({
    id: String(tab.id),
    groupId: typeof tab.groupId === "string" ? tab.groupId : "inbox",
    title: String(tab.title),
    url: String(tab.url),
    domain: normaliseUrl(String(tab.url)),
    note: typeof tab.note === "string" ? tab.note : "",
    tags: Array.isArray(tab.tags) ? tab.tags.map(String) : [],
    color: "#6b8c7e",
    icon: String(tab.title).slice(0, 1).toUpperCase() || "T",
    updated: typeof tab.updatedAt === "string" ? "synced" : "server",
  }));
  const tabOrders = tabs.reduce<Record<string, string[]>>(
    (orders, tab) => ({
      ...orders,
      [tab.groupId]: [...(orders[tab.groupId] ?? []), tab.id],
    }),
    {}
  );
  return {
    ...fallback,
    tabs,
    vaultGroups: vaultGroups.length ? vaultGroups : fallback.vaultGroups,
    tagCatalog: remoteTags.reduce<Record<string, string>>(
      (catalog, tag) => ({
        ...catalog,
        [String(tag.name)]:
          typeof tag.description === "string" ? tag.description : "",
      }),
      {}
    ),
    tabOrders,
  };
}

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

function normaliseUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0];
  }
}

export default function Home() {
  const [, setLocation] = useLocation();
  const extensionContext = isExtensionContext();
  const [tabs, setTabs] = useState(startingTabs);
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
  const [selectedGroup, setSelectedGroup] = useState<GroupId>("inbox");
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
  const [bulkTag, setBulkTag] = useState("");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [savedSearchName, setSavedSearchName] = useState("");
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const [tabView, setTabView] = useState<TabViewMode>("standard");
  const [semanticIndexStatus, setSemanticIndexStatus] =
    useState<SemanticIndexStatus | null>(null);
  const [showModelPanel, setShowModelPanel] = useState(false);
  const [isRebuildingIndex, setIsRebuildingIndex] = useState(false);
  const [expandedResearch, setExpandedResearch] = useState(true);
  const [serverOnline, setServerOnline] = useState(false);
  const [localServerUrl, setLocalServerUrl] = useState(
    DEFAULT_TABVAULT_SERVER_URL
  );
  const [serverApiKey, setServerApiKey] = useState(DEFAULT_TABVAULT_API_KEY);
  const [showConnectionSettings, setShowConnectionSettings] = useState(false);
  const [pendingServerUrl, setPendingServerUrl] = useState(
    DEFAULT_TABVAULT_SERVER_URL
  );
  const [pendingApiKey, setPendingApiKey] = useState(DEFAULT_TABVAULT_API_KEY);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<GroupId | null>(null);
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
  const [storageReady, setStorageReady] = useState(!extensionContext);

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

  const currentCollection =
    vaultGroups.find(group => group.id === selectedGroup)?.name ?? "Collection";
  const selectedGroupTabs = sortByStoredOrder(
    tabs.filter(tab => descendantCollectionIds(selectedGroup).has(tab.groupId))
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
        const local = tabs.find(item => item.id === tab.id);
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
      tabs.filter(
        tab =>
          (searchGroupFilter === "all" || tab.groupId === searchGroupFilter) &&
          [tab.title, tab.note, tab.domain, ...tab.tags]
            .join(" ")
            .toLowerCase()
            .includes(normalized)
      )
    );
  }, [
    tabs,
    selectedGroupTabs,
    query,
    vaultGroups,
    remoteSearch,
    searchGroupFilter,
    sortByStoredOrder,
  ]);

  const collectionCount = (id: GroupId) =>
    tabs.filter(tab => descendantCollectionIds(id).has(tab.groupId)).length;
  const selectCollection = (id: GroupId) => {
    setSelectedGroup(id);
    setQuery("");
    setShowMobileRail(false);
  };

  useEffect(() => {
    let cancelled = false;
    void new BrowserStorageAdapter<PersistedVault>()
      .load()
      .then(saved => {
        if (cancelled) return;
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
    const server = serverOnline
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
      document => fromServerDocument(document, fallback)
    );
    void adapter.save(fallback).catch(() => {
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
    const searchTerm = query.trim();
    if (!searchTerm) {
      setRemoteSearch(null);
      setRemoteSearchError(null);
      setIsRemoteSearching(false);
      return;
    }
    if (!serverOnline) {
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
      const remote = await new ServerStorageAdapter<Record<string, unknown>>(
        normalizedUrl,
        apiKey
      ).load();
      const hydrated = fromServerDocument(remote, fallback);
      if (hydrated !== fallback) {
        setTabs(hydrated.tabs);
        setVaultGroups(hydrated.vaultGroups);
        setTagCatalog(hydrated.tagCatalog);
        setTabOrders(hydrated.tabOrders);
        setSavedSearches(hydrated.savedSearches ?? []);
        setTabView(hydrated.tabView ?? "standard");
      }
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

  const bulkMoveSelected = async (groupId: GroupId) => {
    if (!selectedTabs.length) return;
    createUndoSnapshot(
      `moving ${selectedTabs.length} tab${selectedTabs.length === 1 ? "" : "s"}`
    );
    selectedTabs.forEach(tab => moveTab(tab.id, groupId));
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
      `removing ${selectedTabs.length} tab${selectedTabs.length === 1 ? "" : "s"}`
    );
    const removedIds = new Set(selectedTabs.map(tab => tab.id));
    setTabs(current => current.filter(tab => !removedIds.has(tab.id)));
    setTabOrders(
      current =>
        Object.fromEntries(
          Object.entries(current).map(([groupId, orderedIds]) => [
            groupId,
            orderedIds.filter(id => !removedIds.has(id)),
          ])
        ) as Record<GroupId, string[]>
    );
    if (extensionContext && serverOnline)
      await Promise.allSettled(
        selectedTabs.map(tab =>
          deleteTabOnLocalServer(localServerUrl, tab.id, serverApiKey)
        )
      );
    setSelectedResultIds(new Set());
    toast(
      `Removed ${selectedTabs.length} selected tab${selectedTabs.length === 1 ? "" : "s"}`
    );
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
    if (event.key === " ") {
      event.preventDefault();
      const tab =
        visibleTabs[Math.min(activeResultIndex, visibleTabs.length - 1)];
      if (tab) toggleResultSelection(tab.id);
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelectedResultIds(new Set(visibleTabs.map(tab => tab.id)));
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
    setDropTarget(null);
    toast.success(`Moved to ${destination}`, {
      description: "The local index is updated.",
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
    if (serverOnline) {
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
      if (captureMessage.type === "TABVAULT_LIBRARY_UPDATED") {
        void new BrowserStorageAdapter<PersistedVault>().load().then(saved => {
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
            setSelectedGroup("inbox");
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
    setDropTarget(null);
    toast.success("Order updated", {
      description: "The tab has been repositioned in this collection.",
    });
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

  const renderGroup = (group: VaultGroup) => {
    const isActive = selectedGroup === group.id;
    const isDropTarget = dropTarget === group.id && draggedTab !== null;
    const nested = Boolean(group.parent);
    return (
      <div
        key={group.id}
        onDragOver={event => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropTarget(group.id);
        }}
        onDragLeave={() =>
          setDropTarget(current => (current === group.id ? null : current))
        }
        onDrop={event => {
          event.preventDefault();
          if (draggedTab !== null) moveTab(draggedTab, group.id);
          setDraggedTab(null);
        }}
        className={`group relative ${nested ? "ml-5 w-[calc(100%-1.25rem)]" : ""}`}
      >
        {nested ? (
          <span className="absolute -left-3 top-0 h-full border-l border-[#d9d5ca]" />
        ) : null}
        <button
          onClick={() => selectCollection(group.id)}
          className={`flex w-full items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-left transition-all duration-150 ${isActive ? "border-[#e95224] bg-[#eeece4] text-[#18261f]" : "border-transparent text-[#666c65] hover:bg-[#efede6] hover:text-[#18261f]"} ${isDropTarget ? "bg-[#fff2eb] ring-1 ring-[#e95224]" : ""}`}
        >
          {isActive ? (
            <BrandMark className="h-4 w-4 shrink-0" />
          ) : (
            <span
              className="h-2 w-2 shrink-0 rounded-full opacity-70"
              style={{ backgroundColor: group.accent }}
            />
          )}
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em]">
            {isDropTarget ? `Drop in ${group.name}` : group.name}
          </span>
          <span
            className={`font-mono text-[10px] ${isActive ? "text-[#e95224]" : "text-[#a2a49c]"}`}
          >
            {collectionCount(group.id)}
          </span>
        </button>
        <button
          onClick={event => {
            event.stopPropagation();
            setEditingCollection({ ...group });
          }}
          className="absolute right-7 top-1/2 -translate-y-1/2 rounded p-1 text-[#a0a198] opacity-0 transition hover:bg-[#fffdf8] hover:text-[#e95224] group-hover:opacity-100 focus:opacity-100"
          aria-label={`Edit ${group.name} collection`}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  };

  const researchGroup = vaultGroups.find(group => group.id === "research");
  const standaloneGroups = vaultGroups.filter(
    group => !group.parent && !["inbox", "research"].includes(group.id)
  );
  const nestedResearchGroups = vaultGroups.filter(
    group => group.parent === "research"
  );
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

  return (
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
          <p className="mb-2 flex items-center gap-1.5 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#8e9189]">
            Collections
            <ContextHelp title="Collections" side="right" align="start">
              Collections are your library shelves. Select a name to see its
              tabs; use the chevron only to expand or collapse nested shelves.
            </ContextHelp>
          </p>
          <div className="space-y-1">
            {vaultGroups.find(group => group.id === "inbox") &&
              renderGroup(vaultGroups.find(group => group.id === "inbox")!)}
            {researchGroup && (
              <div className="relative group/research">
                <div
                  onDragOver={event => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropTarget(researchGroup.id);
                  }}
                  onDragLeave={() =>
                    setDropTarget(current =>
                      current === researchGroup.id ? null : current
                    )
                  }
                  onDrop={event => {
                    event.preventDefault();
                    if (draggedTab !== null)
                      moveTab(draggedTab, researchGroup.id);
                    setDraggedTab(null);
                  }}
                  className={`flex items-center rounded-lg transition ${dropTarget === researchGroup.id && draggedTab !== null ? "bg-[#fff2eb] ring-1 ring-[#e95224]" : ""}`}
                >
                  <button
                    onClick={() => selectCollection(researchGroup.id)}
                    className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-l-lg border-l-2 px-3 py-2 text-left ${selectedGroup === researchGroup.id ? "border-[#e95224] bg-[#eeece4] text-[#18261f]" : "border-transparent text-[#666c65] hover:bg-[#efede6] hover:text-[#18261f]"}`}
                  >
                    {selectedGroup === researchGroup.id ? (
                      <BrandMark className="h-4 w-4 shrink-0" />
                    ) : (
                      <span
                        className="h-2 w-2 rounded-full opacity-70"
                        style={{ backgroundColor: researchGroup.accent }}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {dropTarget === researchGroup.id && draggedTab !== null
                        ? "Drop in Research"
                        : researchGroup.name}
                    </span>
                    <span
                      className={`font-mono text-[10px] ${selectedGroup === researchGroup.id ? "text-[#e95224]" : "text-[#a2a49c]"}`}
                    >
                      {collectionCount(researchGroup.id)}
                    </span>
                  </button>
                  <button
                    onClick={event => {
                      event.stopPropagation();
                      setExpandedResearch(!expandedResearch);
                    }}
                    className="rounded-r-lg p-2 text-[#777b74] hover:bg-[#efede6]"
                    aria-label={`${expandedResearch ? "Collapse" : "Expand"} Research groups`}
                  >
                    {expandedResearch ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => setEditingCollection({ ...researchGroup })}
                    className="absolute right-10 top-1/2 -translate-y-1/2 rounded p-1 text-[#a0a198] opacity-0 transition hover:bg-[#fffdf8] hover:text-[#e95224] group-hover/research:opacity-100 focus:opacity-100"
                    aria-label="Edit Research collection"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
                {expandedResearch && nestedResearchGroups.map(renderGroup)}
              </div>
            )}
            {standaloneGroups.map(renderGroup)}
          </div>
          <button
            onClick={() => setShowGroupDialog(true)}
            className="mt-3 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-[#737870] transition hover:bg-[#efede6] hover:text-[#18261f]"
          >
            <FolderPlus className="h-3.5 w-3.5" /> New collection
          </button>
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
              onClick={() =>
                toast("Archive is clean", {
                  description: "No saved exports are waiting for review.",
                })
              }
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[#666c65] hover:bg-[#efede6] hover:text-[#18261f]"
            >
              <Archive className="h-3.5 w-3.5" />
              <span className="text-[13px] font-semibold">Archive</span>
            </button>
            <button
              onClick={() => setLocation("/transfer")}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[#666c65] hover:bg-[#efede6] hover:text-[#18261f]"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              <span className="text-[13px] font-semibold">Import & Export</span>
            </button>
          </div>
        </nav>

        <div className="mt-5 rounded-xl border border-[#ded9cd] bg-[#fffdf8] p-3.5 shadow-[0_8px_24px_rgba(24,38,31,0.04)]">
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
            {serverOnline ? "Server-backed library" : "Browser storage active"}
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
              onClick={() => setShowConnectionSettings(!showConnectionSettings)}
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
          </div>
          <p className="mt-2 text-[9px] leading-4 text-[#898d85]">
            Any HTTP(S) endpoint is supported. Offline changes remain in browser
            storage until the API is reachable.
          </p>
        </div>
        <section className="mt-3 overflow-hidden rounded-xl border border-[#ded9cd] bg-[#fffdf8] shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
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
              The optional local embedding model helps search match meaning, not
              just exact words. It runs through your configured TabVault server
              and does not replace your saved tab records.
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
                Run a local Ollama embedding model, then rebuild after model or
                import changes.
              </p>
            </div>
          )}
        </section>
        <section className="mt-3 rounded-xl border border-[#ded9cd] bg-[#fffdf8] p-3.5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
                Index health
                <ContextHelp title="Index health" side="right" align="start">
                  A health check asks the server whether the semantic index and
                  its model are ready. It checks your search setup, not the
                  contents of each tab.
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
        <section className="mt-3 rounded-xl border border-[#ded9cd] bg-[#fffdf8] p-3.5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
                Local alerts
                <ContextHelp title="Local alerts" side="right" align="start">
                  Alerts notify you only when a scheduled health check needs
                  attention. They require a health-check interval and the Chrome
                  extension notification permission.
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
      {draggedTab !== null && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#efb39d] bg-[#fff9f4] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#be4724] shadow-[0_12px_28px_rgba(24,38,31,0.15)]">
          Hover a row to reorder · drop on a collection to move
        </div>
      )}

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
                {currentCollection}
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
          <section className="rise-in relative overflow-hidden border-b border-[#dcd7cc] pb-8">
            <div className="absolute right-0 top-0 hidden h-[156px] w-[360px] overflow-hidden rounded-lg border border-[#e4ded1] bg-[#eee8dd] paper-grain lg:block">
              <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[#f6f3ec]/25 to-[#f6f3ec]" />
              <div className="absolute left-0 top-0 flex items-center gap-2 border-b border-r border-[#213a2f]/15 bg-[#fffdf8]/90 px-3 py-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-[#536057]">
                <BrandMark className="h-3.5 w-3.5" /> evidence / shelf 01
              </div>
              <div className="absolute bottom-0 right-0 left-0 flex items-center justify-between border-t border-[#213a2f]/15 bg-[#fffdf8]/85 px-3 py-2 backdrop-blur-sm">
                <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#536057]">
                  Index fragment / 2026.08
                </span>
                <span className="font-mono text-[8px] text-[#e95224]">
                  local / verified
                </span>
              </div>
            </div>
            <div className="relative max-w-2xl">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8e85]">
                <BrandMark className="h-4 w-4" />{" "}
                {selectedGroup === "inbox" ? "Staging area" : "Collection view"}{" "}
                <span className="ml-1 border-l border-[#d9d4c8] pl-2 text-[#e95224]">
                  01 / active
                </span>
              </div>
              <h1 className="mt-3 font-['DM_Sans'] text-[34px] font-bold leading-[0.98] tracking-[-0.065em] text-[#18261f] sm:text-[47px]">
                {selectedGroup === "inbox"
                  ? "Inbox, with intent."
                  : currentCollection}
              </h1>
              <p className="mt-3 max-w-xl text-[13px] leading-6 text-[#697068]">
                {selectedGroup === "inbox"
                  ? "Five loose ends, each ready for a place, a note, or a question."
                  : "A local-first collection with structured metadata your agent can read without guesswork."}
              </p>
            </div>
            <div className="relative mt-7 flex flex-wrap items-center gap-x-7 gap-y-3 font-mono text-[10px] uppercase tracking-[0.09em] text-[#747970]">
              <span>
                <strong className="mr-1.5 text-[#29342d]">{tabs.length}</strong>{" "}
                saved tabs
              </span>
              <span>
                <strong className="mr-1.5 text-[#29342d]">
                  {Object.keys(tagCatalog).length}
                </strong>{" "}
                tags indexed
              </span>
              <span className="flex items-center gap-1.5">
                <Wifi className="h-3 w-3 text-[#e95224]" /> semantic index ready
              </span>
              <span
                className={`flex items-center gap-1.5 ${extensionContext ? "text-[#56815d]" : "text-[#8c9088]"}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${extensionContext ? "bg-[#6e9870]" : "bg-[#b0b2aa]"}`}
                />{" "}
                {extensionContext ? "Chrome storage local" : "browser preview"}
              </span>
            </div>
          </section>

          <div className="rise-in-delay mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_300px]">
            <section>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#8e9189]">
                    {query ? "Search results" : "Collection items"}
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
                  <h2 className="mt-1 font-['DM_Sans'] text-[21px] font-bold tracking-[-0.045em]">
                    {query
                      ? isRemoteSearching
                        ? "Searching local knowledge…"
                        : `${visibleTabs.length} ${remoteSearch?.mode === "semantic" ? "matched on meaning" : "matched locally"}`
                      : `${visibleTabs.length} tabs in ${currentCollection}`}
                  </h2>
                </div>
                <p className="hidden max-w-[300px] text-right text-[11px] leading-5 text-[#80847d] md:block">
                  {searchStatusCopy}
                </p>
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
                    setSearchGroupFilter(event.target.value as "all" | GroupId)
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
                  className={`hidden items-center gap-1 font-mono text-[9px] uppercase tracking-[0.08em] sm:flex ${remoteSearch?.mode === "semantic" ? "text-[#56815d]" : remoteSearch?.mode === "text_fallback" ? "text-[#be742e]" : "text-[#91958c]"}`}
                >
                  <Sparkles
                    className={`h-3 w-3 ${isRemoteSearching ? "animate-pulse" : ""}`}
                  />{" "}
                  {searchModeLabel || "semantic"}
                </span>
                {query && (
                  <span className="hidden rounded border border-[#ded9cd] px-1.5 py-1 font-mono text-[8px] text-[#858980] 2xl:inline">
                    ↑↓ select · space mark · ↵ open
                  </span>
                )}
              </label>
              {query && (
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
                  <ContextHelp title="Saved views" side="bottom" align="start">
                    A saved view remembers this search phrase and shelf filter.
                    It does not duplicate or move your tabs.
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
                      onChange={event => setSavedSearchName(event.target.value)}
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
                  {query ? "Ranked results" : "Collection index"} · drag handle
                  to reorder
                  <ContextHelp
                    title="Tab views and reordering"
                    side="bottom"
                    align="start"
                  >
                    Standard shows details, Compact shows only a favicon and
                    title, and Instant Preview renders a readable article card
                    when page content is available. Drag a row by its handle to
                    change its order inside this collection.
                  </ContextHelp>
                </p>
                <div
                  className="flex overflow-hidden rounded-md border border-[#d9d3c6] bg-[#fffdf8]"
                  role="group"
                  aria-label="Tab view mode"
                >
                  <button
                    onClick={() => setTabView("standard")}
                    className={`p-2 ${tabView === "standard" ? "bg-[#edf2ea] text-[#36533a]" : "text-[#858980] hover:bg-[#f7f4ed]"}`}
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
              {visibleTabs.length ? (
                <TabList
                  tabs={visibleTabs}
                  viewMode={tabView}
                  query={query}
                  activeResultIndex={activeResultIndex}
                  selectedResultIds={selectedResultIds}
                  semanticScores={semanticScores}
                  fallbackMode={remoteSearch?.mode}
                  onActiveIndex={setActiveResultIndex}
                  onToggleSelection={toggleResultSelection}
                  onReorder={reorderTabs}
                  onMove={moveTab}
                  onEdit={openTabEditor}
                  onOpenTagManager={() => setShowTagManager(true)}
                  groups={vaultGroups}
                />
              ) : (
                <div className="border-t border-[#dcd7cc] bg-[#fffdf8] px-5 py-12 text-center">
                  <Search className="mx-auto h-5 w-5 text-[#e95224]" />
                  <p className="mt-3 text-[13px] font-bold">
                    No links matched that query.
                  </p>
                  <p className="mt-1 text-[11px] text-[#7b8078]">
                    Try a topic, note, or tag. Semantic search understands
                    related language.
                  </p>
                </div>
              )}
            </section>

            <aside className="space-y-5 xl:pt-7">
              <section className="overflow-hidden border border-[#ded9cd] bg-[#fffdf8] shadow-[0_9px_25px_rgba(24,38,31,0.035)]">
                <div className="relative h-[110px] overflow-hidden border-b border-[#e4ded3] bg-[#e7e0d3] paper-grain">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#e7e0d3]/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 border-r border-t border-[#314337]/15 bg-[#fffdf8]/90 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#536057]">
                    query sample / indexed note
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
                      Semantic lens
                    </p>
                    <span className="rounded-full bg-[#fff0ea] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[#be4724]">
                      on device
                    </span>
                  </div>
                  <h3 className="mt-2 font-['DM_Sans'] text-[18px] font-bold tracking-[-0.04em]">
                    Ask by intent.
                  </h3>
                  <div className="mt-3 border-l border-[#e95224] bg-[#f7f4ed] px-3 py-2.5">
                    <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#8a8e85]">
                      Query intent
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-[#3d4941]">
                      “validation contract”
                    </p>
                    <div className="mt-2 flex justify-between font-mono text-[8px] uppercase tracking-[0.08em] text-[#747970]">
                      <span>3 matched</span>
                      <span className="text-[#e95224]">top score .93</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setQuery("validation contract");
                      toast.success("Semantic query applied", {
                        description:
                          "Showing notes about validation and agent contracts.",
                      });
                    }}
                    className="mt-3 text-[10px] font-bold text-[#e95224] hover:underline"
                  >
                    Run this query →
                  </button>
                </div>
              </section>
              <section className="border border-[#ded9cd] bg-[#fffdf8] p-4 shadow-[0_9px_25px_rgba(24,38,31,0.035)]">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-[#edf2ea] p-2 text-[#638569]">
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
                      Sync status
                    </p>
                    <h3 className="mt-1 text-[13px] font-bold">
                      {serverOnline
                        ? "Local server is in sync"
                        : "Server needs attention"}
                    </h3>
                  </div>
                </div>
                <div className="mt-4 space-y-2.5 border-t border-[#e7e3da] pt-3 font-mono text-[9px] text-[#747970]">
                  <div className="flex justify-between">
                    <span>LAST WRITE</span>
                    <span className="text-[#334438]">just now</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SCHEMA</span>
                    <span className="text-[#334438]">v1 current</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VECTOR STORE</span>
                    <span className="text-[#334438]">ready</span>
                  </div>
                </div>
              </section>
              <section className="relative overflow-hidden border border-[#ded9cd] bg-[#fffdf8] p-4 shadow-[0_9px_25px_rgba(24,38,31,0.035)]">
                <span className="pointer-events-none absolute right-3 top-3 border border-[#cfc8ba] bg-[#fffdf8]/90 px-1.5 py-1 font-mono text-[7px] uppercase tracking-[0.1em] text-[#6b7269]">
                  field map / v1
                </span>
                <p className="relative font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
                  Data contract
                </p>
                <h3 className="relative mt-2 font-['DM_Sans'] text-[18px] font-bold tracking-[-0.04em]">
                  Imports explain themselves.
                </h3>
                <p className="relative mt-1.5 max-w-[210px] text-[11px] leading-5 text-[#6f756d]">
                  Every invalid field returns a code, path, expected shape, and
                  suggested fix.
                </p>
                <button
                  onClick={() => setLocation("/transfer")}
                  className="relative mt-4 inline-flex items-center gap-1.5 text-[10px] font-bold text-[#e95224] hover:underline"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" /> Open transfer desk
                </button>
              </section>
            </aside>
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
                description so an agent can understand the index without asking
                for context.
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
                    setEditingTab({ ...editingTab, title: event.target.value })
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
                            tags: editingTab.tags.filter(item => item !== tag),
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
                    placeholder="Add tag"
                    className="min-w-0 flex-1 border-b border-[#bcb6a8] bg-transparent px-1 py-2 text-[11px] outline-none focus:border-[#e95224]"
                  />
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
  );
}
