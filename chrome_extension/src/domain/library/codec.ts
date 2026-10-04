/** Versioned library validation and the single browser/HTTP record mapping. */
import { isJsonValue, isPropertyDefinition } from "./properties";
import type {
  PersistedVault,
  CustomPropertySchema,
  VaultTab,
  VaultTag,
  VaultGroup,
} from "./types";
export type {
  PersistedVault,
  VaultTab,
  VaultGroup,
  LibraryViewMode,
} from "./types";
export const LIBRARY_REFRESH_INTERVALS = [
  { seconds: 0, label: "Off" },
  { seconds: 60, label: "1m" },
  { seconds: 300, label: "5m" },
  { seconds: 900, label: "15m" },
  { seconds: 3600, label: "1h" },
] as const;
/** Build a fresh v5 library without registering client conventions. @returns {PersistedVault} Empty vault. */
export function emptyBrowserVault(): PersistedVault {
  return {
    schemaVersion: 5,
    propertySchema: {},
    library: { tabs: [], vaultGroups: [], tags: [] },
    preferences: { tabView: "standard" },
    sync: { generation: null, pending: {}, propertyTimes: {} },
  };
}
/** Read a hostname without changing the saved URL. @param {string} value - Saved URL. @returns {string} Display hostname. */
export function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
/** Narrow untrusted JSON to an object. @param {unknown} value - Input. @returns {boolean} Whether fields may be read. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Validate a UTC timestamp at storage boundaries. @param {unknown} value - Input. @returns {boolean} Whether timestamp is valid and offset-aware. */
function timestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /(?:Z|[+-]\d\d:\d\d)$/i.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
/** Validate grouped creation/modification times. @param {unknown} value - Input. @returns {boolean} Whether both timestamps are valid. */
function times(value: unknown) {
  return (
    isRecord(value) && timestamp(value.createdAt) && timestamp(value.updatedAt)
  );
}
/** Validate finite nonnegative positions. @param {unknown} value - Input. @returns {boolean} Whether position is valid. */
function position(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
/** Validate arrays of strings. @param {unknown} value - Input. @returns {boolean} Whether every item is a string. */
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}
/** Validate an absolute saved HTTP(S) URL without rewriting it. @param {string} value - Original URL. @returns {boolean} Whether URL has a supported scheme and host. */
function validSavedUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}
/** Validate persisted v5 data without upgrading or discarding incompatible data. @param {unknown} value - Parsed browser JSON. @returns {boolean} Whether hydration is safe. */
export function isPersistedVault(value: unknown): value is PersistedVault {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 5 ||
    !isRecord(value.library) ||
    !isRecord(value.propertySchema) ||
    !isRecord(value.preferences) ||
    !isRecord(value.sync)
  )
    return false;
  const { library, sync } = value;
  return (
    Object.entries(value.propertySchema).every(([name, definition]) =>
      isPropertyDefinition(name, definition)
    ) &&
    Array.isArray(library.tabs) &&
    library.tabs.every(
      t =>
        isRecord(t) &&
        typeof t.id === "string" &&
        t.id.trim().length > 0 &&
        t.id.length <= 256 &&
        isRecord(t.content) &&
        strings([
          t.content.title,
          t.content.url,
          t.content.domain,
          t.content.color,
          t.content.icon,
        ]) &&
        validSavedUrl(String(t.content.url)) &&
        String(t.content.title).trim().length > 0 &&
        isRecord(t.annotations) &&
        isRecord(t.annotations.customProperties) &&
        isJsonValue(t.annotations.customProperties) &&
        strings(t.annotations.tags) &&
        !("note" in t.annotations) &&
        !("agentReview" in t.annotations) &&
        !("viewed" in t.annotations) &&
        isRecord(t.placement) &&
        (t.placement.groupId === null ||
          typeof t.placement.groupId === "string") &&
        position(t.placement.position) &&
        times(t.timestamps) &&
        isRecord(t.lifecycle) &&
        typeof t.lifecycle.archived === "boolean" &&
        (!t.lifecycle.archived || t.placement.groupId === null) &&
        [t.lifecycle.archivedAt, t.lifecycle.hiddenUntil].every(
          v => v === null || timestamp(v)
        )
    ) &&
    Array.isArray(library.vaultGroups) &&
    library.vaultGroups.every(
      g =>
        isRecord(g) &&
        typeof g.id === "string" &&
        g.id.trim().length > 0 &&
        g.id.length <= 256 &&
        isRecord(g.details) &&
        strings([g.details.name, g.details.category, g.details.description]) &&
        (g.details.accent === undefined ||
          typeof g.details.accent === "string") &&
        isRecord(g.placement) &&
        position(g.placement.position) &&
        times(g.timestamps)
    ) &&
    Array.isArray(library.tags) &&
    library.tags.every(
      t =>
        isRecord(t) &&
        strings([t.name, t.description]) &&
        timestamp(t.createdAt) &&
        timestamp(t.updatedAt)
    ) &&
    new Set(library.tabs.map(t => t.id)).size === library.tabs.length &&
    new Set(library.vaultGroups.map(g => g.id)).size ===
      library.vaultGroups.length &&
    new Set(library.tags.map(t => t.name.toLowerCase())).size ===
      library.tags.length &&
    library.tabs.every(
      t =>
        t.placement.groupId === null ||
        (library.vaultGroups as VaultGroup[]).some(
          g => g.id === t.placement.groupId
        )
    ) &&
    ["standard", "compact", "groups"].includes(
      String(value.preferences.tabView)
    ) &&
    (sync.generation === null || typeof sync.generation === "string") &&
    isRecord(sync.propertyTimes) &&
    Object.values(sync.propertyTimes).every(timestamp) &&
    isRecord(sync.pending) &&
    Object.values(sync.pending).every(
      c =>
        isRecord(c) &&
        ["tab", "group", "tag", "property"].includes(String(c.kind)) &&
        strings([c.id, c.token]) &&
        timestamp(c.updatedAt) &&
        (c.data === null || isRecord(c.data))
    )
  );
}

/** Load supported library fields from valid v5 data, excluding obsolete browser metadata. The input and persisted bytes remain untouched. @param {unknown} value - Parsed browser data. @returns {PersistedVault | null} Valid vault containing current library fields, or null for incompatible data. */
export function parseBrowserVault(value: unknown): PersistedVault | null {
  if (!isPersistedVault(value)) return null;
  return {
    ...value,
    library: {
      tabs: value.library.tabs,
      vaultGroups: value.library.vaultGroups.map(group => {
        if (group.details.accent !== "none") return group;
        const details = { ...group.details };
        delete details.accent;
        return { ...group, details };
      }),
      tags: value.library.tags,
    },
  };
}
export type PortableTab = Omit<VaultTab, "content"> & {
  content: { title: string; url: string };
};
export type PortableGroup = Omit<VaultGroup, "details"> & {
  details: {
    name: string;
    description: string;
    category: string;
    color: string | null;
  };
};
export type PortableDocument = {
  schemaVersion: 5;
  propertySchema: CustomPropertySchema;
  exportedAt?: string;
  library: { tabs: PortableTab[]; groups: PortableGroup[]; tags: VaultTag[] };
};
/** Convert the library into portable records without inventing timestamps. No color is serialized as null; incorrect imported colors remain available for repair. @param {PersistedVault} vault - Current library. @returns {PortableDocument} Transfer document. */
export function toServerDocument(vault: PersistedVault): PortableDocument {
  return {
    schemaVersion: 5,
    propertySchema: vault.propertySchema,
    library: {
      tabs: vault.library.tabs.map(t => ({
        ...t,
        content: { title: t.content.title, url: t.content.url },
      })),
      groups: vault.library.vaultGroups.map(g => ({
        ...g,
        details: {
          name: g.details.name,
          description: g.details.description,
          category: g.details.category,
          color: g.details.accent ?? null,
        },
      })),
      tags: vault.library.tags,
    },
  };
}
/** Convert and validate server data before it can replace browser records. A null color maps to no color without altering incorrect imported values. @param {Record<string, unknown>} document - Server snapshot. @param {PersistedVault} local - Local preferences and pending metadata. @returns {PersistedVault} Valid mapped vault. @throws {Error} Unsupported or malformed data. */
export function fromServerDocument(
  document: Record<string, unknown>,
  local = emptyBrowserVault()
): PersistedVault {
  if (
    document.schemaVersion !== 5 ||
    !isRecord(document.library) ||
    !Array.isArray(document.library.tabs) ||
    !Array.isArray(document.library.groups) ||
    !Array.isArray(document.library.tags)
  )
    throw new Error("Server library is not schema v5");
  const d = document as unknown as PortableDocument;
  const result: PersistedVault = {
    ...local,
    propertySchema: d.propertySchema,
    library: {
      tabs: d.library.tabs.map(t => ({
        ...t,
        content: {
          ...t.content,
          domain: domainFromUrl(t.content.url),
          color: "#6b8c7e",
          icon: t.content.title.slice(0, 1) || "T",
        },
      })),
      vaultGroups: d.library.groups
        .map(g => ({
          ...g,
          details: {
            name: g.details.name,
            description: g.details.description ?? "",
            category: g.details.category,
            ...(g.details.color == null ? {} : { accent: g.details.color }),
          },
        }))
        .sort(
          (a, b) =>
            a.placement.position - b.placement.position ||
            a.id.localeCompare(b.id)
        ),
      tags: d.library.tags.map(t => ({
        ...t,
        description: t.description ?? "",
      })),
    },
  };
  if (!isPersistedVault(result))
    throw new Error("Server library contains invalid schema-v5 records");
  return result;
}
