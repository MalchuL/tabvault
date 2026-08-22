/**
 * Shared library document conversion. Browser/extension vaults and the FastAPI
 * JSON document are two projections of the same tabs, collections, and tags.
 */
export type VaultGroup = {
  id: string;
  name: string;
  description: string;
  parent?: string;
  accent: string;
};

export type VaultTab = {
  id: string;
  groupId: string;
  title: string;
  url: string;
  domain: string;
  note: string;
  agentReview: string;
  viewed: boolean;
  tags: string[];
  color: string;
  icon: string;
  updated: string;
  archived?: boolean;
  archivedAt?: string | null;
};

export type SavedSearch = {
  id: string;
  name: string;
  query: string;
  groupId: "all" | string;
};

export type LibraryViewMode = "standard" | "compact" | "preview" | "groups";

export type PersistedVault = {
  tabs: VaultTab[];
  vaultGroups: VaultGroup[];
  tagCatalog: Record<string, string>;
  tabOrders: Record<string, string[]>;
  savedSearches?: SavedSearch[];
  tabView?: LibraryViewMode;
};

export const DEFAULT_LIBRARY_GROUPS: VaultGroup[] = [
  { id: "inbox", name: "Inbox", description: "", accent: "#F05A28" },
  { id: "research", name: "Research", description: "", accent: "#829b65" },
  {
    id: "llm-papers",
    name: "LLM papers",
    description: "",
    parent: "research",
    accent: "#7aa6a1",
  },
  { id: "build", name: "Build", description: "", accent: "#7c8bba" },
  { id: "filed", name: "Filed", description: "", accent: "#bb9b68" },
];

export const LIBRARY_REFRESH_INTERVALS = [
  { seconds: 0, label: "Off" },
  { seconds: 60, label: "1m" },
  { seconds: 300, label: "5m" },
  { seconds: 900, label: "15m" },
  { seconds: 3600, label: "1h" },
] as const;

export function emptyBrowserVault(): PersistedVault {
  return {
    tabs: [],
    vaultGroups: DEFAULT_LIBRARY_GROUPS.map(group => ({ ...group })),
    tagCatalog: {},
    tabOrders: { inbox: [] },
    savedSearches: [],
    tabView: "standard",
  };
}

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0] || value;
  }
}

export function toServerDocument(
  vault: PersistedVault
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    tags: Object.entries(vault.tagCatalog).map(([name, description]) => ({
      name,
      description,
    })),
    groups: vault.vaultGroups.map((group, position) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      parentId: group.parent ?? null,
      color: group.accent,
      position,
    })),
    tabs: vault.tabs.map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      note: tab.note,
      agentReview: tab.agentReview,
      viewed: tab.viewed,
      tags: tab.tags,
      groupId: tab.groupId,
      archived: Boolean(tab.archived),
      archivedAt: tab.archivedAt ?? null,
      position: vault.tabOrders[tab.groupId]?.indexOf(tab.id) ?? 0,
      createdAt: tab.updated,
      updatedAt: tab.updated,
    })),
  };
}

export function fromServerDocument(
  document: Record<string, unknown>,
  fallback: PersistedVault
): PersistedVault {
  const remoteTabs = Array.isArray(document.tabs)
    ? (document.tabs as Array<Record<string, unknown>>)
    : [];
  const remoteGroups = Array.isArray(document.groups)
    ? (document.groups as Array<Record<string, unknown>>)
    : [];
  const remoteTags = Array.isArray(document.tags)
    ? (document.tags as Array<Record<string, unknown>>)
    : [];
  const vaultGroups = remoteGroups.map(group => ({
    id: String(group.id),
    name: String(group.name),
    description: typeof group.description === "string" ? group.description : "",
    parent: typeof group.parentId === "string" ? group.parentId : undefined,
    accent: typeof group.color === "string" ? group.color : "#829b65",
  }));
  const tabs = remoteTabs
    .slice()
    .sort(
      (left, right) => Number(left.position ?? 0) - Number(right.position ?? 0)
    )
    .map(tab => ({
      id: String(tab.id),
      groupId: typeof tab.groupId === "string" ? tab.groupId : "inbox",
      title: String(tab.title ?? "Untitled tab"),
      url: String(tab.url ?? ""),
      domain: domainFromUrl(String(tab.url ?? "")),
      note: typeof tab.note === "string" ? tab.note : "",
      agentReview: typeof tab.agentReview === "string" ? tab.agentReview : "",
      viewed: Boolean(tab.viewed),
      tags: Array.isArray(tab.tags) ? tab.tags.map(String) : [],
      color: "#6b8c7e",
      icon:
        String(tab.title ?? "T")
          .slice(0, 1)
          .toUpperCase() || "T",
      updated:
        typeof tab.updatedAt === "string"
          ? tab.updatedAt
          : new Date().toISOString(),
      archived: Boolean(tab.archived),
      archivedAt: typeof tab.archivedAt === "string" ? tab.archivedAt : null,
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
    tagCatalog: remoteTags.length
      ? remoteTags.reduce<Record<string, string>>((catalog, tag) => {
          catalog[String(tag.name)] =
            typeof tag.description === "string" ? tag.description : "";
          return catalog;
        }, {})
      : fallback.tagCatalog,
    tabOrders,
  };
}
