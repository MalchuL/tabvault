/** Schema-v4 browser persistence and server transfer conversion. */
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
 * Map an optional group ID to its tab-order bucket.
 * @param {string | null} groupId - Owning group or null for Unassigned.
 * @returns {string} Group ID or the shared Unassigned key.
 */
export function orderKey(groupId: string | null): string {
  return groupId ?? UNASSIGNED_ORDER_KEY;
}

/**
 * Normalize timestamps to UTC; timezone-free input represents UTC.
 * @param {string} value - Stored timestamp.
 * @returns {string} ISO UTC timestamp, or source text when invalid.
 */
export function utcTimestamp(value: string): string {
  const instant = HAS_TIMEZONE.test(value) ? value : `${value}Z`;
  const parsed = Date.parse(instant);
  return Number.isNaN(parsed) ? instant : new Date(parsed).toISOString();
}

/**
 * Create an empty schema-v4 browser library.
 * @returns {PersistedVault} Empty library with initial preferences and ordering.
 */
export function emptyBrowserVault(): PersistedVault {
  return {
    schemaVersion: 4,
    propertySchema: DEFAULT_PROPERTY_SCHEMA,
    library: {
      tabs: [],
      vaultGroups: [],
      tagCatalog: {},
      tabOrders: { [UNASSIGNED_ORDER_KEY]: [] },
      savedSearches: [],
      tombstones: { tabs: [], groups: [] },
    },
    preferences: { tabView: "standard" },
  };
}

/**
 * Narrow JSON input to a record.
 * @param {unknown} value - Untrusted JSON value.
 * @returns {boolean} Whether string-keyed fields can be inspected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a string array.
 * @param {unknown} value - Untrusted JSON value.
 * @returns {boolean} Whether all entries are strings.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

/**
 * Validate a nested browser tab before hydration or persistence.
 * @param {unknown} value - Untrusted tab record.
 * @returns {boolean} Whether the record satisfies the current tab contract.
 */
function isVaultTab(value: unknown): value is VaultTab {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isRecord(value.content) ||
    !isRecord(value.annotations) ||
    !isRecord(value.placement) ||
    !isRecord(value.lifecycle) ||
    !isRecord(value.timestamps)
  )
    return false;
  const { content, annotations, placement, lifecycle, timestamps } = value;
  return (
    [
      content.title,
      content.url,
      content.domain,
      content.color,
      content.icon,
      annotations.note,
      annotations.agentReview,
      timestamps.createdAt,
      timestamps.updatedAt,
    ].every(item => typeof item === "string") &&
    /^https?:\/\//i.test(String(content.url)) &&
    (placement.groupId === null || typeof placement.groupId === "string") &&
    typeof annotations.viewed === "boolean" &&
    isRecord(annotations.customProperties) &&
    isStringArray(annotations.tags) &&
    (lifecycle.archived === undefined ||
      typeof lifecycle.archived === "boolean") &&
    [lifecycle.archivedAt, lifecycle.hiddenUntil].every(
      item => item === undefined || item === null || typeof item === "string"
    )
  );
}

/**
 * Validate a nested collection.
 * @param {unknown} value - Untrusted collection record.
 * @returns {boolean} Whether collection details and timestamps are valid.
 */
function isVaultGroup(value: unknown): value is VaultGroup {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isRecord(value.details) ||
    !isRecord(value.timestamps)
  )
    return false;
  return (
    [
      value.details.name,
      value.details.description,
      value.details.category,
      value.details.accent,
      value.timestamps.createdAt,
      value.timestamps.updatedAt,
    ].every(item => typeof item === "string") &&
    String(value.details.category).length > 0
  );
}

/**
 * Validate schema-v4 JSON without accepting or converting previous versions.
 * @param {unknown} value - Untrusted stored library.
 * @returns {boolean} Whether the complete browser shape is supported.
 */
export function isPersistedVault(value: unknown): value is PersistedVault {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 4 ||
    !isRecord(value.propertySchema) ||
    !isRecord(value.library) ||
    !isRecord(value.preferences)
  )
    return false;
  const { library, preferences } = value;
  if (
    !Array.isArray(library.tabs) ||
    !library.tabs.every(isVaultTab) ||
    !Array.isArray(library.vaultGroups) ||
    !library.vaultGroups.every(isVaultGroup) ||
    !isRecord(library.tagCatalog) ||
    !Object.values(library.tagCatalog).every(
      item => typeof item === "string"
    ) ||
    !isRecord(library.tabOrders) ||
    !Object.values(library.tabOrders).every(isStringArray)
  )
    return false;
  if (
    library.tombstones !== undefined &&
    (!isRecord(library.tombstones) ||
      !isStringArray(library.tombstones.tabs) ||
      !isStringArray(library.tombstones.groups))
  )
    return false;
  if (
    library.savedSearches !== undefined &&
    (!Array.isArray(library.savedSearches) ||
      !library.savedSearches.every(
        saved =>
          isRecord(saved) &&
          [saved.id, saved.name, saved.query, saved.groupId].every(
            item => typeof item === "string"
          )
      ))
  )
    return false;
  return (
    preferences.tabView === undefined ||
    ["groups", "standard", "compact", "preview"].includes(
      String(preferences.tabView)
    )
  );
}

/**
 * Extract a domain label without changing the saved URL.
 * @param {string} value - Saved URL.
 * @returns {string} Hostname or a best-effort label for invalid input.
 */
export function domainFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0] || value;
  }
}

/** Portable tab content shared with the HTTP API. */
type PortableContent = { url: string; title: string; favicon?: string | null };
/** Portable annotations; viewed state belongs to custom properties. */
type PortableAnnotations = {
  note: string;
  agentReview: string;
  customProperties: Record<string, unknown>;
  tags: string[];
};
/** Portable lifecycle state. */
type PortableLifecycle = {
  archived: boolean;
  archivedAt: string | null;
  hiddenUntil: string | null;
};
/** A schema-v4 portable tab. */
export type PortableTab = {
  id: string;
  content: PortableContent;
  annotations: PortableAnnotations;
  placement: { groupId: string | null; position: number };
  lifecycle: PortableLifecycle;
  timestamps: { createdAt: string; updatedAt: string };
};
/** A schema-v4 portable collection. */
export type PortableGroup = {
  id: string;
  details: {
    name: string;
    category: string;
    description: string;
    color: string | null;
  };
  placement: { position: number };
  timestamps: { createdAt: string; updatedAt: string };
};
/** Schema-v4 server transfer envelope. */
export type PortableDocument = {
  schemaVersion: 4;
  propertySchema: CustomPropertySchema;
  exportedAt?: string;
  library: {
    tags: Array<{ name: string; description?: string | null }>;
    groups: PortableGroup[];
    tabs: PortableTab[];
  };
};

/**
 * Convert browser state to nested schema-v4 transfer records.
 * Archived tabs are unassigned; relative positions follow local ordering.
 * @param {PersistedVault} vault - Valid browser library.
 * @returns {PortableDocument} Document for the import API.
 */
export function toServerDocument(vault: PersistedVault): PortableDocument {
  return {
    schemaVersion: 4,
    propertySchema: vault.propertySchema,
    library: {
      tags: Object.entries(vault.library.tagCatalog).map(
        ([name, description]) => ({ name, description })
      ),
      groups: vault.library.vaultGroups.map((group, position) => ({
        id: group.id,
        details: {
          name: group.details.name,
          category: group.details.category,
          description: group.details.description,
          color: group.details.accent,
        },
        placement: { position },
        timestamps: {
          createdAt: utcTimestamp(group.timestamps.createdAt),
          updatedAt: utcTimestamp(group.timestamps.updatedAt),
        },
      })),
      tabs: vault.library.tabs.map(tab => ({
        id: tab.id,
        content: { url: tab.content.url, title: tab.content.title },
        annotations: {
          note: tab.annotations.note,
          agentReview: tab.annotations.agentReview,
          customProperties: {
            ...tab.annotations.customProperties,
            viewed: tab.annotations.viewed,
          },
          tags: tab.annotations.tags,
        },
        placement: {
          groupId: tab.lifecycle.archived ? null : tab.placement.groupId,
          position:
            vault.library.tabOrders[orderKey(tab.placement.groupId)]?.indexOf(
              tab.id
            ) ?? 0,
        },
        lifecycle: {
          archived: Boolean(tab.lifecycle.archived),
          archivedAt: tab.lifecycle.archivedAt
            ? utcTimestamp(tab.lifecycle.archivedAt)
            : null,
          hiddenUntil: tab.lifecycle.hiddenUntil
            ? utcTimestamp(tab.lifecycle.hiddenUntil)
            : null,
        },
        timestamps: {
          createdAt: utcTimestamp(tab.timestamps.createdAt),
          updatedAt: utcTimestamp(tab.timestamps.updatedAt),
        },
      })),
    },
  };
}

/**
 * Convert nested server records while retaining local preferences and tombstones.
 * Reject malformed documents before callers can replace local data.
 * @param {Record<string, unknown>} document - Server sync payload.
 * @param {PersistedVault} preferences - Local preferences and pending deletions.
 * @returns {PersistedVault} Valid browser library with rebuilt order buckets.
 * @throws {Error} When the server document is unsupported or malformed.
 */
export function fromServerDocument(
  document: Record<string, unknown>,
  preferences: PersistedVault
): PersistedVault {
  if (
    document.schemaVersion !== 4 ||
    !isRecord(document.library) ||
    !Array.isArray(document.library.tabs) ||
    !Array.isArray(document.library.groups) ||
    !Array.isArray(document.library.tags) ||
    !isRecord(document.propertySchema)
  )
    throw new Error("Server library is not schema v4");
  const remote = document as unknown as PortableDocument;
  const tombstones = preferences.library.tombstones ?? { tabs: [], groups: [] };
  const deletedTabs = new Set(tombstones.tabs),
    deletedGroups = new Set(tombstones.groups);
  const vaultGroups: VaultGroup[] = remote.library.groups
    .filter(group => !deletedGroups.has(group.id))
    .map(group => ({
      id: group.id,
      details: {
        name: group.details.name,
        description: group.details.description,
        category: group.details.category,
        accent: group.details.color ?? "#829b65",
      },
      timestamps: {
        createdAt: utcTimestamp(group.timestamps.createdAt),
        updatedAt: utcTimestamp(group.timestamps.updatedAt),
      },
    }));
  const tabs: VaultTab[] = remote.library.tabs
    .filter(tab => !deletedTabs.has(tab.id))
    .slice()
    .sort((left, right) => left.placement.position - right.placement.position)
    .map(tab => ({
      id: tab.id,
      placement: { groupId: tab.placement.groupId },
      content: {
        title: tab.content.title,
        url: tab.content.url,
        domain: domainFromUrl(tab.content.url),
        color: "#6b8c7e",
        icon: tab.content.title.slice(0, 1).toUpperCase() || "T",
      },
      annotations: {
        ...tab.annotations,
        viewed: Boolean(
          tab.annotations.customProperties.viewed ??
            remote.propertySchema.viewed?.default
        ),
      },
      timestamps: {
        createdAt: utcTimestamp(tab.timestamps.createdAt),
        updatedAt: utcTimestamp(tab.timestamps.updatedAt),
      },
      lifecycle: { ...tab.lifecycle },
    }));
  const tabOrders = tabs.reduce<Record<string, string[]>>((orders, tab) => {
    const key = orderKey(tab.placement.groupId);
    (orders[key] ??= []).push(tab.id);
    return orders;
  }, {});
  const result: PersistedVault = {
    schemaVersion: 4,
    propertySchema: remote.propertySchema,
    library: {
      tabs,
      vaultGroups,
      tabOrders,
      tagCatalog: Object.fromEntries(
        remote.library.tags.map(tag => [tag.name, tag.description ?? ""])
      ),
      savedSearches: preferences.library.savedSearches ?? [],
      tombstones,
    },
    preferences: { ...preferences.preferences },
  };
  if (!isPersistedVault(result))
    throw new Error("Server library contains invalid schema-v4 records");
  return result;
}
