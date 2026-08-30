export const UNASSIGNED_ORDER_KEY = "unassigned";

const HAS_TIMEZONE = /[zZ]|[+-]\d{2}:?\d{2}$/;

export function orderKey(groupId) {
  return groupId ?? UNASSIGNED_ORDER_KEY;
}

export function utcTimestamp(value) {
  const instant = HAS_TIMEZONE.test(value) ? value : `${value}Z`;
  const parsed = Date.parse(instant);
  if (Number.isNaN(parsed)) return instant;
  return new Date(parsed).toISOString();
}

function utcTimestampOrFallback(value, fallback) {
  return typeof value === "string" ? utcTimestamp(value) : fallback;
}

function utcTimestampOrNull(value) {
  return typeof value === "string" ? utcTimestamp(value) : null;
}

export function defaultVault() {
  return {
    schemaVersion: 3,
    propertySchema: {
      viewed: { description: "", type: "boolean", default: false },
    },
    tabs: [],
    vaultGroups: [],
    tagCatalog: {},
    tabOrders: { [UNASSIGNED_ORDER_KEY]: [] },
    savedSearches: [],
    tabView: "standard",
    tombstones: { tabs: [], groups: [] },
  };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isVaultV2(value) {
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
  if (
    !Object.values(value.tabOrders).every(
      item => Array.isArray(item) && item.every(id => typeof id === "string")
    )
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
    value.tombstones !== undefined &&
    (!isRecord(value.tombstones) ||
      !Array.isArray(value.tombstones.tabs) ||
      !value.tombstones.tabs.every(id => typeof id === "string") ||
      !Array.isArray(value.tombstones.groups) ||
      !value.tombstones.groups.every(id => typeof id === "string"))
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
      typeof tab.url === "string" &&
      /^https?:\/\//i.test(tab.url) &&
      typeof tab.title === "string" &&
      typeof tab.domain === "string" &&
      typeof tab.note === "string" &&
      typeof tab.agentReview === "string" &&
      typeof tab.viewed === "boolean" &&
      isRecord(tab.customProperties) &&
      Array.isArray(tab.tags) &&
      tab.tags.every(tag => typeof tag === "string") &&
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

export function upgradeVault(value) {
  if (isVaultV2(value)) return value;
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    !Array.isArray(value.tabs)
  )
    return null;
  const upgraded = {
    ...value,
    schemaVersion: 3,
    propertySchema: {
      viewed: { description: "", type: "boolean", default: false },
    },
    tabs: value.tabs.map(tab => ({
      ...tab,
      viewed: Boolean(tab.viewed),
      customProperties: { viewed: Boolean(tab.viewed) },
    })),
  };
  return isVaultV2(upgraded) ? upgraded : null;
}

function domainFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return String(value ?? "")
      .replace(/^https?:\/\//, "")
      .split("/")[0];
  }
}

export function vaultToServerDocument(vault) {
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

export function serverDocumentToVault(document, preferences = defaultVault()) {
  if (document?.schemaVersion === 2) {
    document = {
      ...document,
      schemaVersion: 3,
      propertySchema: {
        viewed: { description: "", type: "boolean", default: false },
      },
      tabs: Array.isArray(document.tabs)
        ? document.tabs.map(tab => ({
            ...tab,
            customProperties: { viewed: Boolean(tab.viewed) },
          }))
        : [],
    };
  }
  if (document?.schemaVersion !== 3)
    throw new Error("Server library is not schema v3");
  const propertySchema = isRecord(document.propertySchema)
    ? document.propertySchema
    : {};
  const now = new Date().toISOString();
  const tombstones = preferences.tombstones ?? { tabs: [], groups: [] };
  const deletedGroups = new Set(tombstones.groups);
  const deletedTabs = new Set(tombstones.tabs);
  const groups = Array.isArray(document.groups)
    ? document.groups.filter(group => !deletedGroups.has(String(group.id)))
    : [];
  const tabs = Array.isArray(document.tabs)
    ? document.tabs.filter(tab => !deletedTabs.has(String(tab.id)))
    : [];
  const tags = Array.isArray(document.tags) ? document.tags : [];
  const vaultGroups = groups.map(group => ({
    id: String(group.id),
    name: String(group.name),
    category: String(group.category),
    description: typeof group.description === "string" ? group.description : "",
    accent: typeof group.color === "string" ? group.color : "#829b65",
    createdAt: utcTimestampOrFallback(group.createdAt, now),
    updatedAt: utcTimestampOrFallback(group.updatedAt, now),
  }));
  const vaultTabs = tabs
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
  const tabOrders = vaultTabs.reduce((orders, tab) => {
    const key = orderKey(tab.groupId);
    orders[key] = [...(orders[key] ?? []), tab.id];
    return orders;
  }, {});
  return {
    schemaVersion: 3,
    propertySchema,
    tabs: vaultTabs,
    vaultGroups,
    tagCatalog: tags.reduce((catalog, tag) => {
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
