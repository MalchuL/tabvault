/** Schema-v2 browser persistence and server transfer conversion. */
import type {
  PersistedVault,
  VaultGroup,
  VaultTab,
} from "@/domain/library/types";

export type {
  LibraryViewMode,
  PersistedVault,
  SavedSearch,
  VaultGroup,
  VaultTab,
} from "@/domain/library/types";

export const LIBRARY_REFRESH_INTERVALS = [
  { seconds: 0, label: "Off" },
  { seconds: 60, label: "1m" },
  { seconds: 300, label: "5m" },
  { seconds: 900, label: "15m" },
  { seconds: 3600, label: "1h" },
] as const;

export const UNASSIGNED_ORDER_KEY = "unassigned";

const HAS_TIMEZONE = /[zZ]|[+-]\d{2}:?\d{2}$/;

export function orderKey(groupId: string | null) {
  return groupId ?? UNASSIGNED_ORDER_KEY;
}

export function utcTimestamp(value: string): string {
  const instant = HAS_TIMEZONE.test(value) ? value : `${value}Z`;
  const parsed = Date.parse(instant);
  if (Number.isNaN(parsed)) return instant;
  return new Date(parsed).toISOString();
}

function utcTimestampOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" ? utcTimestamp(value) : fallback;
}

function utcTimestampOrNull(value: unknown): string | null {
  return typeof value === "string" ? utcTimestamp(value) : null;
}

export function emptyBrowserVault(): PersistedVault {
  return {
    schemaVersion: 2,
    tabs: [],
    vaultGroups: [],
    tagCatalog: {},
    tabOrders: { [UNASSIGNED_ORDER_KEY]: [] },
    savedSearches: [],
    tabView: "standard",
    tombstones: { tabs: [], groups: [] },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

export function isPersistedVault(value: unknown): value is PersistedVault {
  if (!isRecord(value) || value.schemaVersion !== 2) return false;
  if (
    !Array.isArray(value.tabs) ||
    !Array.isArray(value.vaultGroups) ||
    !isRecord(value.tagCatalog) ||
    !isRecord(value.tabOrders)
  )
    return false;
  if (!Object.values(value.tagCatalog).every(item => typeof item === "string"))
    return false;
  if (!Object.values(value.tabOrders).every(isStringArray)) return false;
  if (
    value.tombstones !== undefined &&
    (!isRecord(value.tombstones) ||
      !isStringArray(value.tombstones.tabs) ||
      !isStringArray(value.tombstones.groups))
  )
    return false;
  if (
    value.savedSearches !== undefined &&
    (!Array.isArray(value.savedSearches) ||
      !value.savedSearches.every(
        saved =>
          isRecord(saved) &&
          typeof saved.id === "string" &&
          typeof saved.name === "string" &&
          typeof saved.query === "string" &&
          typeof saved.groupId === "string"
      ))
  )
    return false;
  if (
    value.tabView !== undefined &&
    !["groups", "standard", "compact", "preview"].includes(
      String(value.tabView)
    )
  )
    return false;
  if (
    !value.vaultGroups.every(
      group =>
        isRecord(group) &&
        typeof group.id === "string" &&
        typeof group.name === "string" &&
        typeof group.description === "string" &&
        typeof group.category === "string" &&
        group.category.length > 0 &&
        typeof group.accent === "string" &&
        typeof group.createdAt === "string" &&
        typeof group.updatedAt === "string" &&
        !("parent" in group) &&
        !("parentId" in group)
    )
  )
    return false;
  return value.tabs.every(
    tab =>
      isRecord(tab) &&
      typeof tab.id === "string" &&
      (typeof tab.groupId === "string" || tab.groupId === null) &&
      typeof tab.title === "string" &&
      typeof tab.url === "string" &&
      /^https?:\/\//i.test(tab.url) &&
      typeof tab.domain === "string" &&
      typeof tab.note === "string" &&
      typeof tab.agentReview === "string" &&
      typeof tab.viewed === "boolean" &&
      isStringArray(tab.tags) &&
      typeof tab.color === "string" &&
      typeof tab.icon === "string" &&
      typeof tab.createdAt === "string" &&
      typeof tab.updatedAt === "string" &&
      (tab.archived === undefined || typeof tab.archived === "boolean") &&
      (tab.archivedAt === undefined ||
        tab.archivedAt === null ||
        typeof tab.archivedAt === "string") &&
      (tab.hiddenUntil === undefined ||
        tab.hiddenUntil === null ||
        typeof tab.hiddenUntil === "string") &&
      !("normalizedUrl" in tab) &&
      !("canonicalUrl" in tab) &&
      !("updated" in tab)
  );
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
    schemaVersion: 2,
    tags: Object.entries(vault.tagCatalog).map(([name, description]) => ({
      name,
      description,
    })),
    groups: vault.vaultGroups.map((group, position) => ({
      id: group.id,
      name: group.name,
      category: group.category,
      description: group.description,
      color: group.accent,
      position,
      createdAt: utcTimestamp(group.createdAt),
      updatedAt: utcTimestamp(group.updatedAt),
    })),
    tabs: vault.tabs.map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      note: tab.note,
      agentReview: tab.agentReview,
      viewed: tab.viewed,
      tags: tab.tags,
      groupId: tab.archived ? null : tab.groupId,
      archived: Boolean(tab.archived),
      archivedAt: utcTimestampOrNull(tab.archivedAt),
      hiddenUntil: utcTimestampOrNull(tab.hiddenUntil),
      position: vault.tabOrders[orderKey(tab.groupId)]?.indexOf(tab.id) ?? 0,
      createdAt: utcTimestamp(tab.createdAt),
      updatedAt: utcTimestamp(tab.updatedAt),
    })),
  };
}

export function fromServerDocument(
  document: Record<string, unknown>,
  preferences: Pick<PersistedVault, "savedSearches" | "tabView" | "tombstones">
): PersistedVault {
  if (document.schemaVersion !== 2)
    throw new Error("Server library is not schema v2");
  const tombstones = preferences.tombstones ?? { tabs: [], groups: [] };
  const deletedTabs = new Set(tombstones.tabs);
  const deletedGroups = new Set(tombstones.groups);
  const remoteTabs = Array.isArray(document.tabs)
    ? (document.tabs as Array<Record<string, unknown>>).filter(
        tab => !deletedTabs.has(String(tab.id))
      )
    : [];
  const remoteGroups = Array.isArray(document.groups)
    ? (document.groups as Array<Record<string, unknown>>).filter(
        group => !deletedGroups.has(String(group.id))
      )
    : [];
  const remoteTags = Array.isArray(document.tags)
    ? (document.tags as Array<Record<string, unknown>>)
    : [];
  const now = new Date().toISOString();
  const vaultGroups: VaultGroup[] = remoteGroups.map(group => ({
    id: String(group.id),
    name: String(group.name),
    description: typeof group.description === "string" ? group.description : "",
    category: String(group.category),
    accent: typeof group.color === "string" ? group.color : "#829b65",
    createdAt: utcTimestampOrFallback(group.createdAt, now),
    updatedAt: utcTimestampOrFallback(group.updatedAt, now),
  }));
  const tabs: VaultTab[] = remoteTabs
    .slice()
    .sort(
      (left, right) => Number(left.position ?? 0) - Number(right.position ?? 0)
    )
    .map(tab => ({
      id: String(tab.id),
      groupId: typeof tab.groupId === "string" ? tab.groupId : null,
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
      createdAt: utcTimestampOrFallback(tab.createdAt, now),
      updatedAt: utcTimestampOrFallback(tab.updatedAt, now),
      archived: Boolean(tab.archived),
      archivedAt: utcTimestampOrNull(tab.archivedAt),
      hiddenUntil: utcTimestampOrNull(tab.hiddenUntil),
    }));
  const tabOrders = tabs.reduce<Record<string, string[]>>((orders, tab) => {
    const key = orderKey(tab.groupId);
    orders[key] = [...(orders[key] ?? []), tab.id];
    return orders;
  }, {});
  return {
    schemaVersion: 2,
    tabs,
    vaultGroups,
    tagCatalog: remoteTags.reduce<Record<string, string>>((catalog, tag) => {
      catalog[String(tag.name)] =
        typeof tag.description === "string" ? tag.description : "";
      return catalog;
    }, {}),
    tabOrders,
    savedSearches: preferences.savedSearches ?? [],
    tabView: preferences.tabView ?? "standard",
    tombstones,
  };
}
