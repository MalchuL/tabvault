/** Schema-v3 browser persistence and server transfer conversion. */
import type {
  PersistedVault,
  CustomPropertySchema,
  VaultGroup,
  VaultTab,
} from "./types";

export type {
  LibraryViewMode,
  PersistedVault,
  SavedSearch,
  VaultGroup,
  VaultTab,
} from "./types";

export const LIBRARY_REFRESH_INTERVALS = [
  { seconds: 0, label: "Off" },
  { seconds: 60, label: "1m" },
  { seconds: 300, label: "5m" },
  { seconds: 900, label: "15m" },
  { seconds: 3600, label: "1h" },
] as const;

export const UNASSIGNED_ORDER_KEY = "unassigned";
export const DEFAULT_PROPERTY_SCHEMA: CustomPropertySchema = {
  viewed: { description: "", type: "boolean", default: false },
};

const HAS_TIMEZONE = /[zZ]|[+-]\d{2}:?\d{2}$/;

/**
 * Map an optional group ID to the matching tab-order bucket.
 * @param {string | null} groupId - Owning group, or null for unassigned tabs.
 * @returns {string} Group ID or the shared unassigned-order key.
 */
export function orderKey(groupId: string | null) {
  return groupId ?? UNASSIGNED_ORDER_KEY;
}

/**
 * Normalize stored timestamps to UTC for server transfer.
 * Values without a timezone are interpreted as UTC; unparseable values retain
 * their source text, with a UTC suffix added only if one was missing.
 * @param {string} value - Timestamp from browser or server storage.
 * @returns {string} ISO UTC timestamp, or the source value with a UTC suffix if needed.
 */
export function utcTimestamp(value: string): string {
  const instant = HAS_TIMEZONE.test(value) ? value : `${value}Z`;
  const parsed = Date.parse(instant);
  if (Number.isNaN(parsed)) return instant;
  return new Date(parsed).toISOString();
}

/**
 * Normalize a timestamp only when the source value is a string.
 * @param {unknown} value - Untrusted timestamp field.
 * @param {string} fallback - Timestamp to use when the field is absent or invalid in type.
 * @returns {string} Normalized timestamp or the provided fallback.
 */
function utcTimestampOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" ? utcTimestamp(value) : fallback;
}

/**
 * Preserve an optional timestamp without inventing a date for missing values.
 * @param {unknown} value - Untrusted optional timestamp field.
 * @returns {string | null} Normalized timestamp, or null for a non-string value.
 */
function utcTimestampOrNull(value: unknown): string | null {
  return typeof value === "string" ? utcTimestamp(value) : null;
}

/**
 * Create the initial schema-v3 browser library with an unassigned order bucket.
 * @returns {PersistedVault} Empty library ready for local persistence.
 */
export function emptyBrowserVault(): PersistedVault {
  return {
    schemaVersion: 3,
    propertySchema: DEFAULT_PROPERTY_SCHEMA,
    tabs: [],
    vaultGroups: [],
    tagCatalog: {},
    tabOrders: { [UNASSIGNED_ORDER_KEY]: [] },
    savedSearches: [],
    tabView: "standard",
    tombstones: { tabs: [], groups: [] },
  };
}

/**
 * Narrow unknown JSON input to a non-array object.
 * @param {unknown} value - Value from storage or a server payload.
 * @returns {boolean} Whether string-keyed fields can be inspected safely.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Check an untrusted value for the string-array shape used by orders and tombstones.
 * @param {unknown} value - Value to inspect.
 * @returns {boolean} Whether every array element is a string.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

/**
 * Validate the browser vault shape before treating stored JSON as schema v3.
 * Rejects obsolete hierarchy and URL fields that would reintroduce removed
 * storage semantics. Optional preferences and tombstones are checked when present.
 * @param {unknown} value - Untrusted browser-storage value.
 * @returns {boolean} Whether the value has the supported persisted shape.
 */
export function isPersistedVault(value: unknown): value is PersistedVault {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 3 ||
    !isRecord(value.propertySchema)
  )
    return false;
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
      isRecord(tab.customProperties) &&
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

/**
 * Accept schema v3 or migrate a compatible schema-v2 browser vault.
 * Migration copies tab viewed state into the custom-property record and
 * validates the result; unsupported or malformed input remains unreadable.
 * @param {unknown} value - Untrusted persisted library.
 * @returns {PersistedVault | null} Valid library, or null when migration cannot succeed.
 */
export function migratePersistedVault(value: unknown): PersistedVault | null {
  if (isPersistedVault(value)) return value;
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    !Array.isArray(value.tabs)
  )
    return null;
  const migrated = {
    ...value,
    schemaVersion: 3,
    propertySchema: {
      viewed: { description: "", type: "boolean", default: false },
    },
    tabs: value.tabs.map(tab =>
      isRecord(tab)
        ? {
            ...tab,
            viewed: Boolean(tab.viewed),
            customProperties: { viewed: Boolean(tab.viewed) },
          }
        : tab
    ),
  };
  return isPersistedVault(migrated) ? migrated : null;
}

/**
 * Extract a display domain while retaining a useful label for malformed URLs.
 * @param {string} value - Stored tab URL, which may be invalid.
 * @returns {string} Host without `www.`, or a best-effort text label.
 */
export function domainFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0] || value;
  }
}

/**
 * Convert browser library state to the schema-v3 server transfer shape.
 * Group and tab positions follow local order; archived tabs are unassigned in
 * the transfer record so they cannot reappear in an active group.
 * @param {PersistedVault} vault - Valid local browser library.
 * @returns {Record<string, unknown>} Portable document for the import API.
 */
export function toServerDocument(
  vault: PersistedVault
): Record<string, unknown> {
  return {
    schemaVersion: 3,
    propertySchema: vault.propertySchema,
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
      customProperties: { ...tab.customProperties, viewed: tab.viewed },
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

/**
 * Convert a server sync document into browser storage without losing local preferences.
 * Schema-v2 documents are upgraded, local tombstones suppress remotely retained
 * deletions, and tabs are ordered by their server positions before order buckets
 * are rebuilt. Invalid schema versions fail instead of replacing local data.
 * @param {Record<string, unknown>} document - Server sync payload.
 * @param {Pick<PersistedVault, "savedSearches" | "tabView" | "tombstones">} preferences - Local-only preferences and pending deletions to preserve.
 * @returns {PersistedVault} Browser library ready for persistence.
 * @throws {Error} When the server document has an unsupported schema version.
 */
export function fromServerDocument(
  document: Record<string, unknown>,
  preferences: Pick<PersistedVault, "savedSearches" | "tabView" | "tombstones">
): PersistedVault {
  if (document.schemaVersion === 2) {
    document = {
      ...document,
      schemaVersion: 3,
      propertySchema: DEFAULT_PROPERTY_SCHEMA,
      tabs: Array.isArray(document.tabs)
        ? document.tabs.map(tab =>
            isRecord(tab)
              ? {
                  ...tab,
                  customProperties: { viewed: Boolean(tab.viewed) },
                }
              : tab
          )
        : [],
    };
  }
  if (document.schemaVersion !== 3)
    throw new Error("Server library is not schema v3");
  const propertySchema = isRecord(document.propertySchema)
    ? (document.propertySchema as CustomPropertySchema)
    : {};
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
      customProperties: isRecord(tab.customProperties)
        ? tab.customProperties
        : {},
      viewed: Boolean(
        isRecord(tab.customProperties)
          ? (tab.customProperties.viewed ?? propertySchema.viewed?.default)
          : propertySchema.viewed?.default
      ),
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
    schemaVersion: 3,
    propertySchema,
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
